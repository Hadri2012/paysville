import { orderDownloads } from "./digital";
import { newId, newToken } from "./ids";
import { availableStock, sweepReservations, type Quote } from "./shop";
import type { Order, OrderStatus, State } from "./types";
import type { CheckoutIdentity } from "./validation";

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
    paymentStatus: "pending",
    status: "awaiting_payment",
    accessToken: newToken(24),
    statusHistory: [{ status: "awaiting_payment", at: iso, note: "Commande créée." }],
    consent: {
      terms: identity.terms,
      termsAt: iso,
      marketing: identity.marketing,
    },
    stockWarning: null,
    adminNote: "",
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
      now.getTime() + Math.max(5, state.settings.reservationMinutes) * 60_000,
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
      order.stockWarning = `Réservation expirée avant confirmation du paiement. Stock à vérifier : ${missing.join(
        ", ",
      )}.`;
    }
  }

  if (order.promotionId) {
    const promotion = state.promotions.find((p) => p.id === order.promotionId);
    if (promotion) promotion.uses += 1;
  }

  order.paymentStatus = "paid";
  setOrderStatus(order, "paid", "Paiement confirmé par Stripe.", iso);
  return order;
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
  order.paymentStatus = paymentStatus;
  setOrderStatus(order, "canceled", reason);
  return order;
}

/** Remet le stock en rayon quand une commande payée est annulée/remboursée par l'admin. */
export function restockOrder(state: State, order: Order): void {
  for (const item of order.items) {
    if (item.kind === "digital") continue;
    const product = state.products.find((p) => p.id === item.productId);
    if (product) product.stock += item.quantity;
  }
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
