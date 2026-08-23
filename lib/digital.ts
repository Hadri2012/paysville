import { errors } from "./errors";
import { newToken } from "./ids";
import type { DigitalFile, Order, State } from "./types";
import { cleanString } from "./validation";

/**
 * Produits numériques : tout ce qui relie une commande payée aux fichiers
 * qu'elle donne le droit de télécharger, et le décodage des fichiers envoyés
 * par l'administration (tout format accepté — STL, 3MF, PDF, ZIP…).
 */

/** Taille lisible, à la française : « 2,1 Mo », « 340 Ko ». */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} Mo`;
  }
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} Ko`;
  return `${Math.max(0, Math.round(bytes))} o`;
}

/** Extension affichable d'un nom de fichier : « STL », « PDF »… (vide sinon). */
export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return match ? match[1].toUpperCase() : "";
}

/** Formats distincts d'une liste de fichiers, dans l'ordre d'apparition. */
export function fileFormats(files: Pick<DigitalFile, "name">[]): string[] {
  const seen = new Set<string>();
  for (const file of files) {
    const ext = fileExtension(file.name);
    if (ext) seen.add(ext);
  }
  return [...seen];
}

/** Une commande donne-t-elle (encore) accès à ses fichiers ? */
export function orderGrantsDownloads(order: Order): boolean {
  return (
    order.paymentStatus === "paid" &&
    order.status !== "canceled" &&
    order.status !== "refunded"
  );
}

export interface OrderDownloadFile {
  fileId: string;
  name: string;
  sizeBytes: number;
}

export interface OrderDownloadGroup {
  productId: string;
  productName: string;
  files: OrderDownloadFile[];
}

/**
 * Fichiers auxquels une commande donne accès, groupés par produit. La liste est
 * relue dans l'état actuel du produit : si la boutique corrige ou remplace un
 * fichier après l'achat, l'acheteur reçoit la version à jour.
 */
export function orderDownloads(state: State, order: Order): OrderDownloadGroup[] {
  if (!orderGrantsDownloads(order)) return [];
  const groups: OrderDownloadGroup[] = [];
  for (const item of order.items) {
    if (item.kind !== "digital") continue;
    const product = state.products.find((p) => p.id === item.productId);
    if (!product || product.digitalFiles.length === 0) continue;
    groups.push({
      productId: product.id,
      productName: item.name,
      files: product.digitalFiles.map((file) => ({
        fileId: file.id,
        name: file.name,
        sizeBytes: file.sizeBytes,
      })),
    });
  }
  return groups;
}

/* ---------------------------- Upload (admin) ------------------------------ */

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
