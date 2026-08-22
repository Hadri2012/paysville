import Anthropic from "@anthropic-ai/sdk";
import {
  SUGGESTION_COUNT,
  localSuggestions,
  scoreCandidates,
  type Suggestion,
} from "./recommendations";
import type { PublicProduct } from "./shop";
import type { State } from "./types";

/**
 * Couche Claude des suggestions « Vous aimerez aussi ».
 *
 * Elle reçoit les meilleurs candidats du score local (`lib/recommendations.ts`),
 * les réordonne selon ce qui va réellement ensemble, et rédige une phrase
 * d'accroche par produit. Trois règles la gouvernent :
 *
 *  - **Facultative.** Sans `ANTHROPIC_API_KEY`, rien n'est tenté : les suggestions
 *    locales s'affichent, la page est identique.
 *  - **Jamais bloquante.** L'appel est mis en cache et couvert par un délai maximal
 *    court. Si Claude n'a pas répondu à temps, on sert immédiatement le classement
 *    local ; la réponse continue d'arriver en tâche de fond et alimente le cache
 *    pour la visite suivante. Une page produit ne ralentit donc jamais.
 *  - **Bornée.** Seules des références (SKU) présentes dans la liste envoyée sont
 *    acceptées en retour ; tout le reste est ignoré. Le modèle ne peut pas inventer
 *    un produit ni faire remonter un article archivé.
 */

/** Au-delà, on sert le classement local et on laisse Claude finir en tâche de fond. */
const RESPONSE_BUDGET_MS = 2_500;

/** Durée de validité d'une entrée en cache. */
const CACHE_TTL_MS = 30 * 60_000;

/** Candidats soumis au modèle : assez pour qu'il ait le choix, sans gonfler le coût. */
const CANDIDATE_POOL = 12;

const MAX_REASON_LENGTH = 90;

interface CacheEntry {
  /** Promesse en vol ou déjà résolue : deux visiteurs simultanés ne paient qu'un appel. */
  promise: Promise<Map<string, string>>;
  expiresAt: number;
}

// Le cache vit sur `globalThis` pour survivre au rechargement de module de Next.js
// en développement (sinon chaque modification relance des appels inutiles).
const globalCache = globalThis as unknown as {
  __hadrishopSuggestionCache?: Map<string, CacheEntry>;
};
const cache = (globalCache.__hadrishopSuggestionCache ??= new Map());

export function isAiSuggestionsEnabled(): boolean {
  return Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim());
}

/**
 * Empreinte du contexte : dès qu'un prix, un nom ou la disponibilité change, la clé
 * change et le cache se renouvelle de lui-même — pas de suggestion périmée qui
 * vanterait un produit devenu indisponible.
 */
function cacheKey(current: PublicProduct, candidates: PublicProduct[]): string {
  const fingerprint = candidates
    .map((c) => `${c.sku}:${c.priceCents}:${c.inStock ? 1 : 0}`)
    .join("|");
  return `${current.sku}@${current.priceCents}->${fingerprint}`;
}

function describe(product: PublicProduct): string {
  const description = product.description.slice(0, 160);
  return [
    `- ${product.sku} — ${product.name}`,
    product.category ? `  catégorie : ${product.category}` : "",
    `  prix : ${(product.priceCents / 100).toFixed(2)} €`,
    description ? `  description : ${description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Appel Claude : renvoie une table SKU -> phrase d'accroche, dans l'ordre choisi. */
async function askClaude(
  current: PublicProduct,
  candidates: PublicProduct[],
): Promise<Map<string, string>> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sku: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["sku", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["suggestions"],
          additionalProperties: false,
        },
      },
    },
    system:
      "Tu aides une petite boutique belge d'objets imprimés en 3D à suggérer des " +
      "produits complémentaires. Tu réponds toujours en français.",
    messages: [
      {
        role: "user",
        content: `Un client regarde ce produit :

${describe(current)}

Voici les autres produits du catalogue :

${candidates.map(describe).join("\n")}

Choisis les ${SUGGESTION_COUNT} produits les plus pertinents à lui proposer, du plus au moins pertinent.
Privilégie ce qui se combine réellement avec le produit consulté (même pièce de la maison, même usage, même univers) plutôt que la simple ressemblance.

Pour chacun, écris une accroche d'une phrase, maximum ${MAX_REASON_LENGTH} caractères, qui explique le lien avec le produit consulté. Tutoie-le pas : emploie un ton neutre et sobre, sans superlatif ni point d'exclamation.

N'utilise que des références (SKU) figurant dans la liste ci-dessus.`,
      },
    ],
  });

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") return new Map();

  const parsed = JSON.parse(text.text) as {
    suggestions?: { sku?: unknown; reason?: unknown }[];
  };

  // Filet de sécurité : on ne retient que les SKU réellement proposés au modèle.
  const allowed = new Set(candidates.map((c) => c.sku));
  const result = new Map<string, string>();
  for (const entry of parsed.suggestions ?? []) {
    if (typeof entry.sku !== "string" || !allowed.has(entry.sku)) continue;
    if (result.has(entry.sku)) continue;
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    result.set(entry.sku, reason.slice(0, MAX_REASON_LENGTH));
  }
  return result;
}

function fromCache(key: string): Promise<Map<string, string>> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.promise;
}

/**
 * Suggestions pour une fiche produit : enrichies par Claude si possible, locales
 * sinon. Ne rejette jamais — l'appelant peut afficher le résultat sans précaution.
 */
export async function suggestionsFor(
  state: State,
  current: PublicProduct,
): Promise<Suggestion[]> {
  const ranked = scoreCandidates(state, current);
  if (ranked.length === 0) return [];
  if (!isAiSuggestionsEnabled()) return localSuggestions(state, current);

  // Inutile de payer des jetons pour faire évaluer un article invendable : on ne
  // soumet que des produits en stock, tant qu'il y en a assez pour remplir la liste.
  const purchasable = ranked.filter((product) => product.inStock);
  const pool = purchasable.length >= SUGGESTION_COUNT ? purchasable : ranked;
  const candidates = pool.slice(0, CANDIDATE_POOL);
  const key = cacheKey(current, candidates);

  let pending = fromCache(key);
  if (!pending) {
    pending = askClaude(current, candidates).catch((error) => {
      // Une panne ou une clé invalide ne doit pas condamner le cache : on retire
      // l'entrée pour qu'un prochain visiteur puisse retenter.
      cache.delete(key);
      console.error("[hadrishop] suggestions Claude indisponibles", error);
      return new Map<string, string>();
    });
    cache.set(key, { promise: pending, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  // `Promise.race` sans annulation : si le budget expire, l'appel continue en tâche
  // de fond et remplira le cache pour la visite suivante.
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), RESPONSE_BUDGET_MS).unref?.(),
  );
  const reasons = await Promise.race([pending, timeout]);

  if (!reasons || reasons.size === 0) return localSuggestions(state, current);

  // L'ordre retenu par Claude fait foi ; on complète avec le classement local si
  // le modèle en a proposé moins que prévu.
  const bySku = new Map(candidates.map((c) => [c.sku, c]));
  const chosen: Suggestion[] = [];
  for (const [sku, reason] of reasons) {
    const product = bySku.get(sku);
    if (product) chosen.push({ product, reason });
    if (chosen.length === SUGGESTION_COUNT) break;
  }
  for (const product of candidates) {
    if (chosen.length === SUGGESTION_COUNT) break;
    if (!chosen.some((s) => s.product.id === product.id)) {
      chosen.push({ product, reason: "" });
    }
  }

  // Le classement du modèle ne doit pas remonter un article invendable : quel que
  // soit son avis, ce qui est en rupture passe après ce qui est achetable. Tri
  // stable, donc l'ordre choisi par Claude est conservé à l'intérieur de chaque
  // groupe.
  return chosen.sort((a, b) => Number(b.product.inStock) - Number(a.product.inStock));
}
