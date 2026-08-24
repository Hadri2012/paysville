import type Stripe from "stripe";
import { notifyOrderStatus } from "./notify";
import { confirmOrderPayment, releaseOrder, releasePromotionUse, restockOrder } from "./orders";
import { sweepReservations } from "./shop";
import { readState, transaction } from "./store";
import { isStripeConfigured, paymentIntentId, retrieveSession } from "./stripe";
import type { Order } from "./types";

/** Applique une session Stripe vérifiée côté serveur à la commande correspondante. */
export async function applySession(session: Stripe.Checkout.Session): Promise<Order | null> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return null;

  const order = await applySessionToState(session, orderId);

  // Confirmation de commande, hors transaction. `notifyOrderStatus` ne l'envoie
  // qu'une fois : ce chemin est emprunté aussi bien par le webhook Stripe (qui
  // peut être rejoué) que par la page de confirmation.
  if (order?.paymentStatus === "paid") {
    await notifyOrderStatus(order.id, "paid");
  }

  return order;
}

async function applySessionToState(
  session: Stripe.Checkout.Session,
  orderId: string,
): Promise<Order | null> {
  return transaction((state) => {
    sweepReservations(state);
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return null;

    if (session.payment_status === "paid") {
      if (
        typeof session.amount_total === "number" &&
        session.amount_total !== order.totalCents
      ) {
        console.warn(
          `[hadrishop] montant Stripe (${session.amount_total}) différent du total calculé (${order.totalCents}) pour ${order.number}`,
        );
      }
      return confirmOrderPayment(state, orderId, {
        sessionId: session.id,
        paymentIntentId: paymentIntentId(session),
      });
    }

    if (session.status === "expired") {
      return releaseOrder(
        state,
        orderId,
        "Session de paiement Stripe expirée : stock libéré.",
        "canceled",
      );
    }

    order.stripeSessionId = session.id;
    return order;
  });
}

/**
 * Réconciliation à la demande : on interroge Stripe (source de vérité) pour connaître
 * l'état réel du paiement. Utilisée par la page de confirmation — la simple visite de
 * cette page ne vaut jamais preuve de paiement.
 */
export async function syncOrderFromStripe(orderNumber: string): Promise<Order | null> {
  const state = await readState();
  const order = state.orders.find((o) => o.number === orderNumber);
  if (!order) return null;
  if (!order.stripeSessionId) return order;
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") return order;
  if (!isStripeConfigured()) return order;

  try {
    const session = await retrieveSession(order.stripeSessionId);
    const updated = await applySession(session);
    return updated ?? order;
  } catch (error) {
    console.error("[hadrishop] impossible de vérifier la session Stripe", error);
    return order;
  }
}

/**
 * Applique un remboursement Stripe confirmé par webhook (`charge.refunded`).
 *
 * `fullyRefunded` distingue un remboursement total d'un remboursement partiel
 * (ex. un simple avoir sur les frais de port) : Stripe déclenche cet événement
 * dans les deux cas, et un remboursement partiel ne doit ni clore la commande
 * ni couper l'accès à des fichiers déjà payés.
 */
export async function markRefunded(paymentIntent: string, fullyRefunded: boolean): Promise<void> {
  const refundedId = await transaction((state) => {
    const order = state.orders.find((o) => o.stripePaymentIntentId === paymentIntent);
    if (!order || order.paymentStatus === "refunded") return null;
    if (!fullyRefunded) return null;

    // Le stock réservé par cette commande retourne en rayon, et le code promo
    // éventuellement utilisé rend son utilisation — comme lors d'une annulation
    // ou d'un remboursement fait depuis l'administration.
    restockOrder(state, order);
    releasePromotionUse(state, order);

    order.paymentStatus = "refunded";
    order.status = "refunded";
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({
      status: "refunded",
      at: order.updatedAt,
      note: "Remboursement confirmé par Stripe.",
    });
    return order.id;
  });

  if (refundedId) await notifyOrderStatus(refundedId, "refunded");
}

export async function markPaymentFailed(orderId: string, reason: string): Promise<void> {
  await transaction((state) => {
    releaseOrder(state, orderId, reason, "failed");
  });
}
