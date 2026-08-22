import type Stripe from "stripe";
import { notifyOrderPaid, notifyOrderStatus } from "./notifications";
import { confirmOrderPayment, releaseOrder } from "./orders";
import { sweepReservations } from "./shop";
import { readState, transaction } from "./store";
import { isStripeConfigured, paymentIntentId, retrieveSession } from "./stripe";
import type { Order } from "./types";

/** Applique une session Stripe vérifiée côté serveur à la commande correspondante. */
export async function applySession(session: Stripe.Checkout.Session): Promise<Order | null> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return null;

  const result = await transaction<{ order: Order | null; justPaid: boolean }>((state) => {
    sweepReservations(state);
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return { order: null, justPaid: false };

    if (session.payment_status === "paid") {
      if (
        typeof session.amount_total === "number" &&
        session.amount_total !== order.totalCents
      ) {
        console.warn(
          `[hadrishop] montant Stripe (${session.amount_total}) différent du total calculé (${order.totalCents}) pour ${order.number}`,
        );
      }
      // `confirmOrderPayment` est idempotent : on retient donc si CETTE exécution est
      // celle qui a fait basculer la commande, pour n'envoyer l'e-mail qu'une fois
      // même si Stripe rejoue le webhook.
      const wasPaid = order.paymentStatus === "paid";
      const updated = confirmOrderPayment(state, orderId, {
        sessionId: session.id,
        paymentIntentId: paymentIntentId(session),
      });
      return { order: updated, justPaid: Boolean(updated) && !wasPaid };
    }

    if (session.status === "expired") {
      return {
        order: releaseOrder(
          state,
          orderId,
          "Session de paiement Stripe expirée : stock libéré.",
          "canceled",
        ),
        justPaid: false,
      };
    }

    order.stripeSessionId = session.id;
    return { order, justPaid: false };
  });

  // Hors transaction : l'appel réseau ne doit pas prolonger le verrou base.
  if (result.justPaid && result.order) await notifyOrderPaid(result.order);

  return result.order;
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

export async function markRefunded(paymentIntent: string): Promise<void> {
  const refunded = await transaction<Order | null>((state) => {
    const order = state.orders.find((o) => o.stripePaymentIntentId === paymentIntent);
    if (!order || order.paymentStatus === "refunded") return null;
    order.paymentStatus = "refunded";
    order.status = "refunded";
    order.updatedAt = new Date().toISOString();
    order.statusHistory.push({
      status: "refunded",
      at: order.updatedAt,
      note: "Remboursement confirmé par Stripe.",
    });
    return order;
  });

  // `null` si la commande était déjà remboursée : le webhook rejoué ne renotifie pas.
  if (refunded) await notifyOrderStatus(refunded);
}

export async function markPaymentFailed(orderId: string, reason: string): Promise<void> {
  await transaction((state) => {
    releaseOrder(state, orderId, reason, "failed");
  });
}
