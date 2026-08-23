import { promises as fs } from "fs";
import path from "path";

/**
 * Magasin d'assets binaires : fichiers vendus avec les produits numériques et
 * modèles 3D des fiches produit.
 *
 * Ces contenus ne vivent PAS dans le document JSON de la boutique — un seul
 * fichier STL de quelques mégaoctets multiplierait le coût de chaque lecture de
 * la base. Seules les métadonnées (nom, taille, type) restent dans l'état ; le
 * binaire est rangé ici, sous un identifiant aléatoire, et lu uniquement au
 * moment d'un téléchargement.
 *
 * Deux pilotes, alignés sur ceux de `lib/store.ts` :
 *  - `postgres` dès que `DATABASE_URL` est défini : table dédiée, contenu en
 *    base64 (production, les fichiers survivent aux déploiements) ;
 *  - `fichier` sinon : un fichier par asset dans `.data/assets/`.
 */

/** Un identifiant d'asset est toujours un jeton hexadécimal généré par nous. */
const ASSET_ID_RE = /^[a-f0-9]{16,64}$/;

export function isAssetId(value: string): boolean {
  return ASSET_ID_RE.test(value);
}

interface AssetStore {
  save(id: string, data: Buffer): Promise<void>;
  read(id: string): Promise<Buffer | null>;
  remove(id: string): Promise<void>;
}

/* -------------------------------- Fichier --------------------------------- */

function assetsDir(): string {
  const dataFile = process.env.HADRISHOP_DATA_FILE;
  if (dataFile) return `${dataFile}.assets`;
  return path.join(process.cwd(), ".data", "assets");
}

function createFileAssetStore(): AssetStore {
  const dir = assetsDir();
  const fileFor = (id: string) => path.join(dir, id);

  return {
    async save(id, data) {
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${fileFor(id)}.${process.pid}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, fileFor(id));
    },
    async read(id) {
      try {
        return await fs.readFile(fileFor(id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async remove(id) {
      try {
        await fs.unlink(fileFor(id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

/* ------------------------------- PostgreSQL -------------------------------- */

type PgPool = {
  query(text: string, values?: unknown[]): Promise<{ rows: { data: string }[] }>;
};

function createPostgresAssetStore(connectionString: string): AssetStore {
  let poolPromise: Promise<PgPool> | null = null;

  async function getPool(): Promise<PgPool> {
    if (!poolPromise) {
      poolPromise = (async () => {
        const { Pool } = await import("pg");
        const pool = new Pool({
          connectionString,
          max: 2,
          ssl:
            process.env.DATABASE_SSL === "disable"
              ? undefined
              : connectionString.includes("localhost") ||
                  connectionString.includes("127.0.0.1")
                ? undefined
                : { rejectUnauthorized: false },
        }) as unknown as PgPool;
        await pool.query(
          `CREATE TABLE IF NOT EXISTS hadrishop_assets (
             id TEXT PRIMARY KEY,
             data TEXT NOT NULL,
             created_at TIMESTAMPTZ NOT NULL DEFAULT now()
           )`,
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
    async save(id, data) {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO hadrishop_assets (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [id, data.toString("base64")],
      );
    },
    async read(id) {
      const pool = await getPool();
      const { rows } = await pool.query("SELECT data FROM hadrishop_assets WHERE id = $1", [
        id,
      ]);
      const stored = rows[0]?.data;
      return stored === undefined ? null : Buffer.from(stored, "base64");
    },
    async remove(id) {
      const pool = await getPool();
      await pool.query("DELETE FROM hadrishop_assets WHERE id = $1", [id]);
    },
  };
}

/* -------------------------------------------------------------------------- */

const globalAssets = globalThis as unknown as { __hadrishopAssets?: AssetStore };

function getAssetStore(): AssetStore {
  if (!globalAssets.__hadrishopAssets) {
    const url = process.env.DATABASE_URL;
    globalAssets.__hadrishopAssets = url
      ? createPostgresAssetStore(url)
      : createFileAssetStore();
  }
  return globalAssets.__hadrishopAssets;
}

export function saveAsset(id: string, data: Buffer): Promise<void> {
  if (!isAssetId(id)) throw new Error(`Identifiant d'asset invalide : ${id}`);
  return getAssetStore().save(id, data);
}

export function readAsset(id: string): Promise<Buffer | null> {
  if (!isAssetId(id)) return Promise.resolve(null);
  return getAssetStore().read(id);
}

/** Idempotent : supprimer un asset déjà absent n'est pas une erreur. */
export function deleteAsset(id: string): Promise<void> {
  if (!isAssetId(id)) return Promise.resolve();
  return getAssetStore().remove(id);
}
