import { orderDownloads } from "./digital";
import { newId, newToken } from "./ids";
import { availableStock, sweepReservations, type Quote } from "./shop";
import { isPayOnDeliveryMethod, type Order, type OrderStatus, type PaymentMethod, type State } from "./types";
import type { CheckoutIdentity } from "./validation";

/**
 * Stripe impose une expiration de session Checkout d'au moins 30 minutes
 * (voir `createCheckoutSession`) : la réservation de stock ne doit jamais
 * expirer avant, sous peine d'annuler une commande dont la page de paiement
 * Stripe est encore valide pour le client. Les deux durées partagent donc ce
 * même plancher, quel que soit le réglage admin (`reservationMinutes`).
 */
export const MIN_RESERVATION_MINUTES = 30;

/** Numéro lisible et unique : HAD-2026-000001 (compteur par année, stocké en base). */
export function nextOrderNumber(state: State, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const current = state.counters.orderSeq[year] ?? 0;
  const next = current + 1;
  state.counters.orderSeq[year] = next;
  return `HAD-${year}-${String(next).padStart(6, "0")}`;
}

export interface CreateOrderInput {
  quote: Quote;
  identity: CheckoutIdentity;
  /** Défaut : `stripe`. Voir `confirmDeliveryOrder` pour les autres chemins. */
  paymentMethod?: PaymentMethod;
}

/**
 * Crée la commande « en attente de paiement » et réserve le stock correspondant.
 * À appeler dans une transaction : la réservation empêche deux clients d'acheter
 * simultanément le même dernier exemplaire.
 */
export function createPendingOrder(state: State, input: CreateOrderInput): Order {
  const now = new Date();
  const iso = now.toISOString();
  const { quote, identity } = input;

  const order: Order = {
    id: newId(),
    number: nextOrderNumber(state, now),
    createdAt: iso,
    updatedAt: iso,
    customer: identity.customer,
    address: identity.address,
    note: identity.note,
    items: quote.lines.map((line) => ({
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
      imageUrl: line.imageUrl,
      kind: line.kind,
    })),
    subtotalCents: quote.subtotalCents,
    discountCents: quote.discountCents,
    promoCode: quote.promoCode,
    promotionId: quote.promotionId,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    currency: quote.currency,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    paymentMethod: input.paymentMethod ?? "stripe",
    paymentStatus: "pending",
    status: "awaiting_payment",
    accessToken: newToken(24),
    statusHistory: [{ status: "awaiting_payment", at: iso, note: "Commande créée." }],
    consent: {
      terms: identity.terms,
      termsAt: iso,
      marketing: identity.marketing,
    },
    stockCommitted: false,
    stockWarning: null,
    adminNote: "",
    // « En attente de paiement » ne déclenche aucun e-mail : le client vient de
    // quitter la boutique pour la page de paiement, lui écrire n'apprendrait rien.
    notifiedStatuses: [],
  };

  state.orders.push(order);
  // Seuls les articles physiques réservent du stock : un fichier téléchargeable
  // n'est jamais épuisé. La réservation (même vide) garde son second rôle —
  // annuler la commande si le paiement n'arrive pas à temps.
  state.reservations.push({
    id: newId(),
    orderId: order.id,
    items: order.items
      .filter((item) => item.kind !== "digital")
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    createdAt: iso,
    expiresAt: new Date(
      now.getTime() +
        Math.max(MIN_RESERVATION_MINUTES, state.settings.reservationMinutes) * 60_000,
    ).toISOString(),
    status: "active",
  });

  return order;
}

export function setOrderStatus(
  order: Order,
  status: OrderStatus,
  note?: string,
  at = new Date().toISOString(),
): void {
  order.status = status;
  order.updatedAt = at;
  order.statusHistory.push({ status, at, note });
}

/**
 * Rend la commande ferme : le stock quitte le catalogue et le code promo compte
 * son utilisation.
 *
 * Commun aux deux moyens de paiement, car ce n'est pas l'encaissement qui sort
 * les articles du catalogue mais l'engagement de les livrer — une commande
 * payable à la livraison engage la boutique tout autant qu'une commande déjà
 * réglée. Ne fait rien si le stock est déjà décompté : rejouer un webhook
 * Stripe ne doit pas décrémenter deux fois.
 */
function commitOrderStock(state: State, order: Order, reason: string): void {
  if (order.stockCommitted) return;

  const reservation = state.reservations.find(
    (r) => r.orderId === order.id && r.status === "active",
  );

  if (reservation) {
    for (const item of reservation.items) {
      const product = state.products.find((p) => p.id === item.productId);
      if (product) product.stock = Math.max(0, product.stock - item.quantity);
    }
    reservation.status = "consumed";
  } else {
    // La réservation a expiré avant la confirmation : on revérifie le stock réel.
    // Les fichiers téléchargeables ne sont pas concernés — rien à décompter.
    const physicalItems = order.items.filter((item) => item.kind !== "digital");
    const missing: string[] = [];
    for (const item of physicalItems) {
      const product = state.products.find((p) => p.id === item.productId);
      if (!product) {
        missing.push(item.name);
        continue;
      }
      const free = availableStock(state, product);
      if (free < item.quantity) {
        missing.push(`${item.name} (${free}/${item.quantity} disponible)`);
      }
    }
    for (const item of physicalItems) {
      const product = state.products.find((p) => p.id === item.productId);
      if (product) product.stock = Math.max(0, product.stock - item.quantity);
    }
    if (missing.length > 0) {
      order.stockWarning = `${reason} Stock à vérifier : ${missing.join(", ")}.`;
    }
  }

  if (order.promotionId) {
    const promotion = state.promotions.find((p) => p.id === order.promotionId);
    if (promotion) promotion.uses += 1;
  }

  order.stockCommitted = true;
}

/**
 * Confirme le paiement d'une commande (appelée uniquement depuis une vérification
 * Stripe côté serveur : webhook signé ou récupération de la session via l'API).
 * Idempotent : rejouer l'événement ne décrémente pas le stock deux fois.
 */
export function confirmOrderPayment(
  state: State,
  orderId: string,
  stripe: { sessionId?: string | null; paymentIntentId?: string | null },
): Order | null {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;

  if (stripe.sessionId) order.stripeSessionId = stripe.sessionId;
  if (stripe.paymentIntentId) order.stripePaymentIntentId = stripe.paymentIntentId;

  if (order.paymentStatus === "paid") return order;

  const iso = new Date().toISOString();
  commitOrderStock(state, order, "Réservation expirée avant confirmation du paiement.");

  order.paymentStatus = "paid";
  setOrderStatus(order, "paid", "Paiement confirmé par Stripe.", iso);
  return order;
}

/**
 * Valide une commande payable à la livraison (espèces ou carte sur le terminal
 * du livreur).
 *
 * Rien n'est encaissé ici : `paymentStatus` reste `pending` jusqu'à la remise en
 * main propre (voir `collectDeliveryPayment`). La commande passe pourtant
 * directement « en préparation », et son stock est décompté — c'est tout le
 * sens de ces moyens de paiement : le client s'engage à la commande, la
 * boutique s'engage à préparer, l'argent circule à la fin.
 *
 * Elle ne repasse donc jamais par « en attente de paiement », qui décrirait
 * l'inverse de ce qui se passe : ce n'est pas la boutique qui attend avant
 * d'agir.
 *
 * Idempotent, comme la confirmation Stripe : deux validations de la même
 * commande ne décomptent pas le stock deux fois.
 */
export function confirmDeliveryOrder(state: State, orderId: string): Order | null {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;
  if (!isPayOnDeliveryMethod(order.paymentMethod)) return order;
  if (order.status !== "awaiting_payment") return order;

  const note =
    order.paymentMethod === "card_on_delivery"
      ? "Commande confirmée. Règlement par carte à la livraison."
      : "Commande confirmée. Règlement en espèces à la livraison.";
  commitOrderStock(state, order, "Réservation expirée avant validation de la commande.");
  setOrderStatus(state.orders.find((o) => o.id === orderId)!, "preparing", note);
  return order;
}

/**
 * Enregistre le règlement remis par le client au livreur (espèces ou carte sur
 * le terminal).
 *
 * Séparé du changement d'étape : selon la tournée, l'argent est parfois compté
 * avant que la commande ne soit marquée livrée, parfois après. Renvoie `false`
 * s'il n'y avait rien à encaisser — commande réglée par Stripe, déjà soldée, ou
 * annulée.
 */
export function collectDeliveryPayment(order: Order, at = new Date().toISOString()): boolean {
  if (!isPayOnDeliveryMethod(order.paymentMethod)) return false;
  if (order.paymentStatus !== "pending") return false;
  if (order.status === "canceled" || order.status === "refunded") return false;

  order.paymentStatus = "paid";
  order.updatedAt = at;
  return true;
}

/** Libère la réservation d'une commande non payée (session expirée / annulée). */
export function releaseOrder(
  state: State,
  orderId: string,
  reason: string,
  paymentStatus: "canceled" | "failed" = "canceled",
): Order | null {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") return order;

  for (const reservation of state.reservations) {
    if (reservation.orderId === order.id && reservation.status === "active") {
      reservation.status = "released";
    }
  }
  // Une commande payable à la livraison est ferme sans être payée : son stock
  // est déjà sorti du catalogue, relâcher la réservation ne suffirait pas à le
  // rendre.
  // Sans effet sur une commande dont le stock est encore simplement réservé.
  restockOrder(state, order);
  order.paymentStatus = paymentStatus;
  setOrderStatus(order, "canceled", reason);
  return order;
}

/**
 * Remet le stock en rayon quand une commande ferme est annulée ou remboursée.
 *
 * Ne fait rien si le stock n'est pas (ou plus) engagé : sans cette garde, deux
 * annulations successives — ou une annulation d'une commande jamais confirmée —
 * créeraient du stock qui n'a jamais existé.
 */
export function restockOrder(state: State, order: Order): void {
  if (!order.stockCommitted) return;
  for (const item of order.items) {
    if (item.kind === "digital") continue;
    const product = state.products.find((p) => p.id === item.productId);
    if (product) product.stock += item.quantity;
  }
  order.stockCommitted = false;
}

/**
 * Rend au code promo l'utilisation consommée par cette commande, quand une
 * commande payée est annulée ou remboursée.
 *
 * Symétrique de l'incrémentation dans `confirmOrderPayment` : sans ce retour,
 * un code à nombre d'utilisations limité s'épuisait à cause de commandes qui,
 * au final, n'ont jamais tenu — la même règle que `hasUsedPromotion` applique
 * déjà côté client (« une commande remboursée rend son droit au client »).
 */
export function releasePromotionUse(state: State, order: Order): void {
  if (!order.promotionId) return;
  const promotion = state.promotions.find((p) => p.id === order.promotionId);
  if (promotion) promotion.uses = Math.max(0, promotion.uses - 1);
}

export function findOrderByNumber(state: State, number: string): Order | undefined {
  const needle = number.trim().toUpperCase();
  return state.orders.find((o) => o.number.toUpperCase() === needle);
}

export function findOrderBySession(state: State, sessionId: string): Order | undefined {
  return state.orders.find((o) => o.stripeSessionId === sessionId);
}

/**
 * Vue « client » d'une commande : aucune donnée interne inutile n'est exposée.
 *
 * Avec `state`, la vue inclut les liens de téléchargement des fichiers achetés
 * (commande payée uniquement). Ces liens embarquent le jeton d'accès de la
 * commande — ils ne sont donc remis qu'à qui a déjà prouvé qu'elle est la
 * sienne (numéro + e-mail, ou lien de confirmation).
 */
export function publicOrderView(order: Order, state?: State) {
  const downloads = state
    ? orderDownloads(state, order).map((group) => ({
        productId: group.productId,
        productName: group.productName,
        files: group.files.map((file) => ({
          name: file.name,
          sizeBytes: file.sizeBytes,
          url: `/api/telechargement?commande=${encodeURIComponent(
            order.number,
          )}&token=${order.accessToken}&fichier=${file.fileId}`,
        })),
      }))
    : [];

  return {
    number: order.number,
    createdAt: order.createdAt,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    items: order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      imageUrl: item.imageUrl,
      kind: item.kind,
    })),
    downloads,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    promoCode: order.promoCode,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    currency: order.currency,
    customer: {
      firstName: order.customer.firstName,
      lastName: order.customer.lastName,
      email: order.customer.email,
    },
    address: order.address,
    note: order.note,
    statusHistory: order.statusHistory,
  };
}

export type PublicOrderView = ReturnType<typeof publicOrderView>;

/** Balayage périodique déclenché par les lectures publiques. */
export function housekeeping(state: State): void {
  sweepReservations(state);
}
