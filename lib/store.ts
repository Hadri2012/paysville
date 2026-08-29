import { promises as fs } from "fs";
import path from "path";
import { initialState } from "./seed";
import type { State } from "./types";

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Couche de persistance de VéloLoc.
 *
 * Next.js (le backend intégré utilisé ici) ne fournit pas de base de données native :
 * c'est la seule brique qui doit être complétée. On garde donc la solution la plus
 * simple possible — un document JSON unique manipulé de façon transactionnelle —
 * avec deux pilotes :
 *
 *  - `postgres` : activé dès que `DATABASE_URL` est défini (recommandé en production,
 *    les données survivent aux déploiements). Les transactions utilisent un verrou
 *    `SELECT ... FOR UPDATE`, ce qui garantit qu'aucune acceptation simultanée ne peut
 *    réserver deux fois la même période pour le même vélo (double réservation).
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

  const normalized: State = {
    schemaVersion: state.schemaVersion ?? 1,
    settings,
    bikes: state.bikes && state.bikes.length > 0 ? state.bikes : fallback.bikes,
    requests: state.requests ?? [],
    admins: state.admins ?? [],
    sessions: state.sessions ?? [],
  };

  return migrate(normalized);
}

/** Migrations de schéma, appliquées une seule fois (portées par `schemaVersion`). */
function migrate(state: State): State {
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  return state;
}

/* -------------------------------------------------------------------------- */
/* Pilote fichier                                                             */
/* -------------------------------------------------------------------------- */

function dataFilePath(): string {
  return (
    process.env.VELOLOC_DATA_FILE || path.join(process.cwd(), ".data", "veloloc.json")
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
          `CREATE TABLE IF NOT EXISTS veloloc_state (
             id INTEGER PRIMARY KEY,
             data JSONB NOT NULL,
             updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
        );
        await pool.query(
          "INSERT INTO veloloc_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING",
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
      const { rows } = await pool.query("SELECT data FROM veloloc_state WHERE id = 1");
      return normalize(rows[0]?.data ?? initialState());
    },
    async transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
      const pool = await getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          "SELECT data FROM veloloc_state WHERE id = 1 FOR UPDATE",
        );
        const state = normalize(rows[0]?.data ?? initialState());
        const result = await fn(state);
        await client.query(
          "UPDATE veloloc_state SET data = $1, updated_at = now() WHERE id = 1",
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

const globalStore = globalThis as unknown as { __velolocStore?: Store };

export function getStore(): Store {
  if (!globalStore.__velolocStore) {
    const url = process.env.DATABASE_URL;

    // Sur un hébergement au système de fichiers en lecture seule (Vercel et
    // équivalents), le pilote fichier échouerait avec une erreur EROFS obscure,
    // à la première écriture seulement — donc potentiellement en pleine demande.
    // Mieux vaut refuser tout de suite avec un message qui dit quoi faire.
    if (!url && process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL est absent. Sur Vercel, le système de fichiers est en " +
          "lecture seule : le stockage fichier ne peut pas fonctionner et les " +
          "données (demandes, vélos, compte admin) seraient perdues. " +
          "Créez une base PostgreSQL (Vercel → Storage → Create Database → " +
          "Postgres, puis Connect au projet), ou renseignez DATABASE_URL dans " +
          "Settings → Environment Variables, puis redéployez.",
      );
    }

    globalStore.__velolocStore = url ? createPostgresStore(url) : createFileStore();
  }
  return globalStore.__velolocStore;
}

export function readState(): Promise<State> {
  return getStore().read();
}

export function transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  return getStore().transaction(fn);
}
