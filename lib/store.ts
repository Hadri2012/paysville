import { promises as fs } from "fs";
import path from "path";
import { defaultPromotion, defaultShippingZones, initialState } from "./seed";
import type { State } from "./types";

const CURRENT_SCHEMA_VERSION = 8;

/**
 * Couche de persistance de Hadrishop.
 *
 * Next.js (le backend intégré utilisé ici) ne fournit pas de base de données native :
 * c'est la seule brique qui doit être complétée. On garde donc la solution la plus
 * simple possible — un document JSON unique manipulé de façon transactionnelle —
 * avec deux pilotes :
 *
 *  - `postgres` : activé dès que `DATABASE_URL` est défini (recommandé en production,
 *    les données survivent aux déploiements). Les transactions utilisent un verrou
 *    `SELECT ... FOR UPDATE`, ce qui garantit qu'aucune commande simultanée ne peut
 *    réserver deux fois le même dernier exemplaire.
 *  - `fichier` : utilisé sinon (développement local). Les écritures sont sérialisées
 *    par un mutex en mémoire et écrites de façon atomique (fichier temporaire + rename).
 *
 * Tout le reste du code ne connaît que l'interface `Store`.
 */
export interface Store {
  read(): Promise<State>;
  transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T>;
  driver: "postgres" | "file";
}

/** Complète un état chargé avec les valeurs par défaut (migrations légères). */
function normalize(state: State): State {
  const fallback = initialState();
  const settings = { ...fallback.settings, ...(state.settings ?? {}) };
  settings.legal = { ...fallback.settings.legal, ...(state.settings?.legal ?? {}) };
  const version = state.schemaVersion ?? 1;

  const normalized: State = {
    schemaVersion: version,
    settings,
    products: state.products ?? [],
    orders: state.orders ?? [],
    promotions: state.promotions ?? [],
    reviews: state.reviews ?? [],
    shippingZones: state.shippingZones ?? [],
    reservations: state.reservations ?? [],
    admins: state.admins ?? [],
    sessions: state.sessions ?? [],
    counters: { orderSeq: state.counters?.orderSeq ?? {} },
  };

  return migrate(normalized);
}

/**
 * Migrations de schéma, appliquées une seule fois (portées par `schemaVersion`).
 * Une base déjà en place n'est jamais écrasée : on ajoute uniquement ce qui manque,
 * pour ne pas ressusciter une zone ou un code promo qu'un admin aurait supprimé.
 */
function migrate(state: State): State {
  // v1 -> v2 : zones de livraison élargies (30 km autour de 1435, Gembloux inclus)
  // et code promo de démarrage, ajoutés seulement s'ils n'existent pas déjà (par
  // code postal / par code promo) pour ne rien dupliquer ni rien restaurer après
  // coup — un admin a pu supprimer volontairement une zone.
  if (state.schemaVersion < 2) {
    const existingPostalCodes = new Set(
      state.shippingZones.map((z) => z.postalCode.trim().toUpperCase()),
    );
    for (const zone of defaultShippingZones()) {
      if (!existingPostalCodes.has(zone.postalCode.trim().toUpperCase())) {
        state.shippingZones.push(zone);
      }
    }
    if (state.promotions.length === 0) {
      state.promotions.push(defaultPromotion());
    }
  }

  // v2 -> v3 : avis clients. Le tableau lui-même est déjà créé par `normalize()`,
  // cette étape ne sert qu'à porter le numéro de version.
  if (state.schemaVersion < 3) {
    state.reviews ??= [];
  }

  // v3 -> v4 : auto-publication des avis avec filtrage anti-spam automatique.
  // Les avis non-approuvés deviennent marqués comme non-flaggés (ils seront visibles).
  if (state.schemaVersion < 4) {
    for (const item of state.reviews) {
      const oldReview = item as unknown as Record<string, unknown>;
      if ('approved' in oldReview && 'moderatedAt' in oldReview) {
        const review = item as unknown as Record<string, unknown>;
        review.flagged = !(review.approved as boolean);
        delete review.approved;
        delete review.moderatedAt;
      }
    }
  }

  // v4 -> v5 : réponse de la boutique, badge « achat vérifié » et votes d'utilité.
  // Les avis déjà en base n'ont aucun de ces champs : on leur donne l'état neutre
  // (pas de réponse, non vérifié, aucun vote). Un ancien avis ne peut pas être
  // vérifié rétroactivement — l'e-mail de son auteur n'a jamais été conservé.
  if (state.schemaVersion < 5) {
    for (const review of state.reviews) {
      review.verified ??= false;
      review.reply ??= null;
      review.helpfulYes ??= 0;
      review.helpfulNo ??= 0;
    }
  }

  // v5 -> v6 : photos et signalements sur les avis, codes promo à usage unique par
  // client. Là encore, l'état neutre pour ce qui existe déjà — en particulier
  // `oncePerCustomer: false`, pour qu'un code en circulation continue de marcher
  // exactement comme avant la mise à jour.
  if (state.schemaVersion < 6) {
    for (const review of state.reviews) {
      review.photos ??= [];
      review.reports ??= 0;
    }
    for (const promotion of state.promotions) {
      promotion.oncePerCustomer ??= false;
    }
  }

  // v6 -> v7 : produits numériques (fichiers vendus par téléchargement) et modèle
  // 3D optionnel. Tout ce qui existe est un produit physique sans fichier ni
  // modèle : l'état neutre, qui ne change rien au comportement en place.
  if (state.schemaVersion < 7) {
    for (const product of state.products) {
      product.kind ??= "physical";
      product.digitalFiles ??= [];
      product.model3d ??= null;
    }
    for (const order of state.orders) {
      for (const item of order.items) {
        item.kind ??= "physical";
      }
    }
  }

  // v7 -> v8 : e-mails de suivi de commande. Les commandes déjà en base sont
  // marquées comme ayant DÉJÀ été notifiées pour l'étape où elles en sont : sans
  // cela, la mise à jour enverrait d'un coup une notification pour chaque
  // commande en cours — y compris « votre colis est parti » pour des colis
  // partis depuis des semaines.
  if (state.schemaVersion < 8) {
    for (const order of state.orders) {
      // `statusHistory` est en principe toujours présent, mais une commande
      // écrite par une version très ancienne pourrait ne pas l'avoir : une
      // migration qui échoue rend la boutique entière illisible, pour une
      // commande mal formée.
      order.statusHistory ??= [];
      order.notifiedStatuses ??= [...new Set(order.statusHistory.map((e) => e.status))];
    }
  }

  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  return state;
}

/* -------------------------------------------------------------------------- */
/* Pilote fichier                                                             */
/* -------------------------------------------------------------------------- */

function dataFilePath(): string {
  return (
    process.env.HADRISHOP_DATA_FILE ||
    path.join(process.cwd(), ".data", "hadrishop.json")
  );
}

function createFileStore(): Store {
  const file = dataFilePath();
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<State> {
    try {
      const raw = await fs.readFile(file, "utf8");
      return normalize(JSON.parse(raw) as State);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const seeded = initialState();
        await save(seeded);
        return seeded;
      }
      throw error;
    }
  }

  async function save(state: State): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(tmp, file);
  }

  /** Sérialise toutes les transactions : une seule à la fois dans le processus. */
  function withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(fn, fn);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    driver: "file",
    read: () => withLock(load),
    transaction: <T,>(fn: (state: State) => T | Promise<T>) =>
      withLock(async () => {
        const state = await load();
        const result = await fn(state);
        await save(state);
        return result;
      }),
  };
}

/* -------------------------------------------------------------------------- */
/* Pilote PostgreSQL                                                          */
/* -------------------------------------------------------------------------- */

type PgPool = {
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<{ rows: { data: State }[] }>;
    release(): void;
  }>;
  query(text: string, values?: unknown[]): Promise<{ rows: { data: State }[] }>;
};

function createPostgresStore(connectionString: string): Store {
  let poolPromise: Promise<PgPool> | null = null;

  async function getPool(): Promise<PgPool> {
    if (!poolPromise) {
      poolPromise = (async () => {
        const { Pool } = await import("pg");
        const pool = new Pool({
          connectionString,
          max: 5,
          ssl:
            process.env.DATABASE_SSL === "disable"
              ? undefined
              : connectionString.includes("localhost") ||
                  connectionString.includes("127.0.0.1")
                ? undefined
                : { rejectUnauthorized: false },
        }) as unknown as PgPool;
        await pool.query(
          `CREATE TABLE IF NOT EXISTS hadrishop_state (
             id INTEGER PRIMARY KEY,
             data JSONB NOT NULL,
             updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        );
        await pool.query(
          "INSERT INTO hadrishop_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING",
          [JSON.stringify(initialState())],
        );
        return pool;
      })().catch((error) => {
        poolPromise = null;
        throw error;
      });
    }
    return poolPromise;
  }

  return {
    driver: "postgres",
    async read() {
      const pool = await getPool();
      const { rows } = await pool.query("SELECT data FROM hadrishop_state WHERE id = 1");
      return normalize(rows[0]?.data ?? initialState());
    },
    async transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
      const pool = await getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          "SELECT data FROM hadrishop_state WHERE id = 1 FOR UPDATE",
        );
        const state = normalize(rows[0]?.data ?? initialState());
        const result = await fn(state);
        await client.query(
          "UPDATE hadrishop_state SET data = $1, updated_at = now() WHERE id = 1",
          [JSON.stringify(state)],
        );
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* la connexion est peut-être déjà perdue */
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/* -------------------------------------------------------------------------- */

const globalStore = globalThis as unknown as { __hadrishopStore?: Store };

/**
 * Le stockage est-il configurable en l'état ? Renvoie `null` si oui, sinon la
 * raison, rédigée pour la personne qui exploite la boutique.
 *
 * Séparé de `getStore()` pour pouvoir être posé la question **sans** déclencher
 * d'exception : une erreur lancée depuis un composant serveur n'arrive au
 * navigateur que sous la forme « Une erreur est survenue » — Next.js masque le
 * message en production, et à raison. Un défaut de configuration se règle en
 * deux minutes quand on sait lequel, et ne se règle jamais quand la page refuse
 * de le dire (voir `components/SetupNotice.tsx`).
 *
 * Vérification purement locale (lecture de variables d'environnement) : elle
 * peut être faite à chaque rendu sans coût ni accès réseau.
 */
export function storeConfigurationError(): string | null {
  // Sur un hébergement au système de fichiers en lecture seule (Vercel et
  // équivalents), le pilote fichier échouerait avec une erreur EROFS obscure,
  // à la première écriture seulement — donc potentiellement en pleine commande.
  // Mieux vaut refuser tout de suite.
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    return (
      "DATABASE_URL est absent. Sur Vercel, le système de fichiers est en " +
      "lecture seule : le stockage fichier ne peut pas fonctionner et les " +
      "données (commandes, stocks, compte admin) seraient perdues."
    );
  }
  return null;
}

export function getStore(): Store {
  if (!globalStore.__hadrishopStore) {
    const problem = storeConfigurationError();
    if (problem) throw new Error(problem);

    const url = process.env.DATABASE_URL;
    globalStore.__hadrishopStore = url
      ? createPostgresStore(url)
      : createFileStore();
  }
  return globalStore.__hadrishopStore;
}

export function readState(): Promise<State> {
  return getStore().read();
}

export function transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  return getStore().transaction(fn);
}
