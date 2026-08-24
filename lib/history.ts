import { orderGrantsDownloads } from "./digital";
import { purchasableQuantity } from "./shop";
import type { Order, OrderStatus, PaymentStatus, ProductKind, State } from "./types";

/**
 * Historique des commandes d'un client, et ce qu'il faut pour en repasser une.
 *
 * ## Pourquoi un résumé, et pas la vue complète
 *
 * La boutique n'a pas de comptes clients : une commande se consulte en prouvant
 * qu'on la connaît (numéro + e-mail, voir `/api/orders/track`). Lister toutes les
 * commandes d'une adresse e-mail à partir de cette seule preuve élargit ce qui
 * est visible — c'est assumé, c'est la fonctionnalité — mais l'élargissement est
 * borné ici : le résumé ne porte ni adresse postale, ni téléphone, ni jeton
 * d'accès, ni lien de téléchargement. Voir le détail d'une commande passe donc
 * toujours par la même porte qu'avant, avec son propre numéro.
 *
 * ## Ce que « recommander » peut reprendre
 *
 * Un article d'une ancienne commande n'est pas forcément rachetable : le produit
 * a pu être retiré du catalogue, être en rupture, ou — pour un fichier — être
 * déjà acquis par cette même commande. Chaque ligne porte donc son verdict,
 * calculé sur l'état actuel du catalogue, pour que le bouton « Recommander » ne
 * promette que ce qu'il peut tenir.
 */

export interface OrderHistoryItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  kind: ProductKind;
  /**
   * Quantité encore commandable aujourd'hui, d'après le catalogue actuel.
   * `0` : produit retiré, désactivé, ou en rupture.
   */
  available: number;
  /**
   * Fichier auquel cette commande donne toujours accès. Le racheter ne
   * donnerait rien de plus : le téléchargement reste ouvert depuis le suivi.
   */
  alreadyOwned: boolean;
}

export interface OrderHistoryEntry {
  number: string;
  createdAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  currency: string;
  /** Nombre d'exemplaires commandés, toutes lignes confondues. */
  itemCount: number;
  items: OrderHistoryItem[];
  /** Au moins un article de cette commande est encore commandable. */
  canReorder: boolean;
}

/** Un article est reprenable s'il est encore vendable et pas déjà acquis. */
export function isReorderable(item: OrderHistoryItem): boolean {
  return item.available > 0 && !item.alreadyOwned;
}

function historyItems(state: State, order: Order): OrderHistoryItem[] {
  const grantsDownloads = orderGrantsDownloads(order);

  return order.items.map((item) => {
    const product = state.products.find((p) => p.id === item.productId);
    const listed = product && product.active && !product.archived;
    // Le fichier reste téléchargeable tant que la commande y donne droit — et
    // seulement si le produit porte encore des fichiers à remettre, exactement
    // la condition qu'applique `orderDownloads`.
    const alreadyOwned =
      item.kind === "digital" &&
      grantsDownloads &&
      Boolean(product && product.digitalFiles.length > 0);

    return {
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      kind: item.kind,
      available: listed ? purchasableQuantity(state, product) : 0,
      alreadyOwned,
    };
  });
}

export function toHistoryEntry(state: State, order: Order): OrderHistoryEntry {
  const items = historyItems(state, order);
  return {
    number: order.number,
    createdAt: order.createdAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
    currency: order.currency,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    canReorder: items.some(isReorderable),
  };
}

/**
 * Commandes passées avec cette adresse e-mail, de la plus récente à la plus
 * ancienne. La comparaison ignore la casse et les espaces, comme partout
 * ailleurs où la boutique rapproche un e-mail d'une commande.
 */
export function customerOrderHistory(state: State, email: string): OrderHistoryEntry[] {
  const needle = email.trim().toLowerCase();
  if (!needle) return [];

  return state.orders
    .filter((order) => order.customer.email.trim().toLowerCase() === needle)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((order) => toHistoryEntry(state, order));
}
