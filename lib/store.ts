import { promises as fs } from "fs";
import path from "path";
import { defaultPromotion, defaultShippingZones, initialState } from "./seed";
import type { State } from "./types";

const CURRENT_SCHEMA_VERSION = 4;

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
  // Les avis non-approuvés deviennent marqués comme non-flaggés (ils seront visibles),
  // et les anciens avis n'ont pas de flag donc ils deviennent faux par défaut.
  if (state.schemaVersion < 4) {
    for (const review of state.reviews) {
      if ('approved' in review && 'moderatedAt' in review) {
        (review as any).flagged = !(review as any).approved;
        delete (review as any).approved;
        delete (review as any).moderatedAt;
      }
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

export function getStore(): Store {
  if (!globalStore.__hadrishopStore) {
    const url = process.env.DATABASE_URL;

    // Sur un hébergement au système de fichiers en lecture seule (Vercel et
    // équivalents), le pilote fichier échouerait avec une erreur EROFS obscure,
    // à la première écriture seulement — donc potentiellement en pleine commande.
    // Mieux vaut refuser tout de suite avec un message qui dit quoi faire.
    if (!url && process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL est absent. Sur Vercel, le système de fichiers est en " +
          "lecture seule : le stockage fichier ne peut pas fonctionner et les " +
          "données (commandes, stocks, compte admin) seraient perdues. " +
          "Créez une base PostgreSQL (Vercel → Storage → Create Database → " +
          "Postgres, puis Connect au projet), ou renseignez DATABASE_URL dans " +
          "Settings → Environment Variables, puis redéployez.",
      );
    }

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
