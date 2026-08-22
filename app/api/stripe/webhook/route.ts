import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { applySession, markPaymentFailed, markRefunded } from "@/lib/payments";
import { getStripe, getWebhookSecret } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Point d'entrée Stripe : SEULE source de vérité du paiement.
 * La signature est vérifiée sur le corps brut ; aucun événement non signé n'est traité.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "signature manquante" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = getStripe().webhooks.constructEvent(payload, signature, getWebhookSecret());
  } catch (error) {
    console.error("[hadrishop] webhook Stripe rejeté", error);
    return NextResponse.json({ error: "signature invalide" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await applySession(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.expired": {
        await applySession(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.orderId) {
          await markPaymentFailed(
            session.metadata.orderId,
            "Paiement refusé par Stripe : stock libéré.",
          );
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.orderId) {
          await markPaymentFailed(
            intent.metadata.orderId,
            "Paiement refusé par Stripe : stock libéré.",
          );
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intent =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (intent) await markRefunded(intent);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    // On renvoie 500 pour que Stripe rejoue l'événement (le traitement est idempotent).
    console.error(`[hadrishop] traitement du webhook ${event.type} en échec`, error);
    return NextResponse.json({ error: "traitement impossible" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
