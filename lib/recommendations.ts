import { listPublicProducts, type PublicProduct } from "./shop";
import type { State } from "./types";

/**
 * Suggestions « Vous aimerez aussi » sur la fiche produit.
 *
 * Deux étages, dans cet ordre :
 *
 *  1. **Un score local**, toujours actif, sans configuration ni appel réseau. Il
 *     combine ce que la boutique sait déjà : catégorie commune, proximité de prix,
 *     et surtout les achats conjoints réellement observés dans les commandes payées.
 *  2. **Une couche Claude facultative** (`lib/aiRecommendations.ts`), qui réordonne
 *     ces candidats et rédige une phrase d'accroche par produit. Elle ne s'active
 *     que si `ANTHROPIC_API_KEY` est renseignée ; sinon on sert le score local tel
 *     quel. C'est ce qui rendra les suggestions plus fines à mesure que le
 *     catalogue s'étoffe, sans jamais bloquer l'affichage de la page.
 */

export interface Suggestion {
  product: PublicProduct;
  /** Phrase courte affichée sous le produit. Vide tant que l'IA n'a rien écrit. */
  reason: string;
}

/** Nombre de suggestions affichées sur une fiche produit. */
export const SUGGESTION_COUNT = 4;

/**
 * Combien de fois chaque paire de produits a été achetée ensemble, sur les
 * commandes réellement payées (une commande annulée ne dit rien des goûts).
 */
function coPurchaseCounts(state: State, productId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of state.orders) {
    if (order.paymentStatus !== "paid") continue;
    if (!order.items.some((item) => item.productId === productId)) continue;
    for (const item of order.items) {
      if (item.productId === productId) continue;
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Classement local des candidats. Le score reste volontairement lisible : chaque
 * critère vaut un nombre de points fixe, ce qui permet de le régler à la main.
 */
export function scoreCandidates(state: State, current: PublicProduct): PublicProduct[] {
  const together = coPurchaseCounts(state, current.id);

  return listPublicProducts(state)
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      let score = 0;

      // Acheté avec ce produit par de vrais clients : le signal le plus fort.
      score += (together.get(candidate.id) ?? 0) * 10;

      // Même catégorie.
      if (candidate.category && candidate.category === current.category) score += 5;

      // Proximité de prix : un écart faible vaut jusqu'à 3 points.
      const reference = Math.max(current.priceCents, 1);
      const gap = Math.abs(candidate.priceCents - current.priceCents) / reference;
      if (gap <= 0.25) score += 3;
      else if (gap <= 0.6) score += 1;

      // Un produit en rupture ne peut pas être ajouté au panier : on le rétrograde
      // sans l'exclure, pour garder de quoi remplir la liste sur un petit catalogue.
      if (!candidate.inStock) score -= 8;

      return { candidate, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.candidate.name.localeCompare(b.candidate.name, "fr"),
    )
    .map((entry) => entry.candidate);
}

/** Suggestions locales, sans IA : le repli utilisé si Claude n'est pas configuré. */
export function localSuggestions(state: State, current: PublicProduct): Suggestion[] {
  return scoreCandidates(state, current)
    .slice(0, SUGGESTION_COUNT)
    .map((product) => ({ product, reason: "" }));
}
