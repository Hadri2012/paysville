import { formatBytes } from "./digital";
import { errors } from "./errors";
import { newToken } from "./ids";
import { cleanString } from "./validation";

/**
 * Décodage des fichiers envoyés par l'administration (tout format accepté —
 * STL, 3MF, STEP, PDF, ZIP…).
 *
 * Ce module est **strictement serveur** : il manipule des `Buffer` et tire un
 * générateur aléatoire de `crypto`. Il est séparé de `lib/digital.ts`, dont les
 * fonctions d'affichage sont importées par des composants client — les y
 * laisser ensemble suffisait à embarquer un polyfill de `crypto` de plus de
 * 400 Ko dans le navigateur de chaque visiteur du suivi de commande.
 */

export interface DecodedUpload {
  name: string;
  contentType: string;
  bytes: Buffer;
}

/** Nom de fichier sans chemin ni caractère de contrôle, jamais vide. */
export function sanitizeFileName(raw: unknown): string {
  const base = cleanString(raw, 160).split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[<>:"|?*]/g, "").trim();
  return cleaned || "fichier";
}

/**
 * Décode un fichier envoyé en JSON par l'administration : `data` est une
 * data-URI (`data:<mime>;base64,<contenu>`) ou du base64 nu. Tout format est
 * accepté — ce sont des fichiers vendus, pas des contenus affichés — mais la
 * taille est bornée par l'appelant.
 */
export function decodeUpload(
  body: Record<string, unknown>,
  maxBytes: number,
): DecodedUpload {
  const name = sanitizeFileName(body.name);
  const raw = typeof body.data === "string" ? body.data.trim() : "";
  if (!raw) throw errors.validation("Aucun contenu de fichier reçu.");

  let contentType = "application/octet-stream";
  let base64 = raw;
  const dataUri = /^data:([\w.+-]+\/[\w.+-]+)?(?:;[\w-]+=[\w-]+)*;base64,([\s\S]*)$/.exec(raw);
  if (dataUri) {
    if (dataUri[1]) contentType = dataUri[1].toLowerCase();
    base64 = dataUri[2];
  }

  // 4/3 : marge du base64, pour refuser tôt sans décoder un contenu trop lourd.
  if (base64.length > (maxBytes * 4) / 3 + 8) {
    throw errors.validation(
      `Ce fichier dépasse la taille maximale autorisée (${formatBytes(maxBytes)}).`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw errors.validation("Contenu de fichier illisible (base64 attendu).");
  }
  if (bytes.length === 0) throw errors.validation("Le fichier reçu est vide.");
  if (bytes.length > maxBytes) {
    throw errors.validation(
      `Ce fichier dépasse la taille maximale autorisée (${formatBytes(maxBytes)}).`,
    );
  }

  return { name, contentType, bytes };
}

/** Un fichier GLB commence toujours par les quatre octets « glTF ». */
export function isGlbFile(bytes: Buffer): boolean {
  return bytes.length > 12 && bytes.toString("latin1", 0, 4) === "glTF";
}

/** Identifiant d'asset neuf (jeton hexadécimal, voir `lib/assets.ts`). */
export function newAssetId(): string {
  return newToken(16);
}
