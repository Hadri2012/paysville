import Stripe from "stripe";
import { errors } from "./errors";
import type { Order } from "./types";

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

/** La clé secrète Stripe ne quitte jamais le serveur. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw errors.stripeNotConfigured();
  if (!client) {
    client = new Stripe(key, {
      appInfo: { name: "Hadrishop" },
      maxNetworkRetries: 2,
    });
  }
  return client;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw errors.stripeNotConfigured();
  return secret;
}

/**
 * Crée la session Stripe Checkout à partir des montants calculés par le serveur.
 * Aucun prix envoyé par le navigateur n'intervient ici.
 */
export async function createCheckoutSession(
  order: Order,
  site: string,
  reservationMinutes: number,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const currency = order.currency.toLowerCase();

  const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
  if (order.discountCents > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: order.discountCents,
      currency,
      duration: "once",
      name: order.promoCode ? `Code ${order.promoCode}` : "Remise Hadrishop",
      metadata: { orderNumber: order.number },
    });
    discounts.push({ coupon: coupon.id });
  }

  const digitalOnly = order.items.every((item) => item.kind === "digital");
  const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: digitalOnly
          ? "Remise par téléchargement"
          : order.shippingCents > 0
            ? "Livraison Hadrishop"
            : "Livraison offerte",
        fixed_amount: { amount: order.shippingCents, currency },
      },
    },
  ];

  // Stripe impose une expiration de session d'au moins 30 minutes.
  const expiresInMinutes = Math.max(30, reservationMinutes);

  return stripe.checkout.sessions.create({
    mode: "payment",
    locale: "fr",
    customer_email: order.customer.email,
    client_reference_id: order.number,
    metadata: { orderId: order.id, orderNumber: order.number },
    payment_intent_data: {
      metadata: { orderId: order.id, orderNumber: order.number },
      description: `Hadrishop ${order.number}`,
    },
    line_items: order.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency,
        unit_amount: item.unitPriceCents,
        product_data: {
          name: item.colorName ? `${item.name} — ${item.colorName}` : item.name,
          metadata: { sku: item.sku },
        },
      },
    })),
    discounts,
    shipping_options: shippingOptions,
    expires_at: Math.floor(Date.now() / 1000) + expiresInMinutes * 60,
    success_url: `${site}/confirmation?commande=${encodeURIComponent(
      order.number,
    )}&token=${order.accessToken}`,
    cancel_url: `${site}/commande?paiement=annule&commande=${encodeURIComponent(
      order.number,
    )}`,
  });
}

export async function retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.retrieve(sessionId);
}

export function paymentIntentId(
  session: Pick<Stripe.Checkout.Session, "payment_intent">,
): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}
