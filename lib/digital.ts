import type { DigitalFile, Order, State } from "./types";

/**
 * Produits numériques : ce qui relie une commande payée aux fichiers qu'elle
 * donne le droit de télécharger, et les quelques fonctions d'affichage qui
 * vont avec (taille lisible, extension, formats).
 *
 * Ce module n'importe que des types et ne touche ni à `Buffer` ni à `crypto` :
 * il est repris tel quel par des composants client (suivi de commande,
 * administration). Le décodage des fichiers envoyés, lui, est réservé au
 * serveur — voir `lib/uploads.ts`.
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
