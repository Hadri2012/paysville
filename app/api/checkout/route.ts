import { assertSameOrigin, handle, jsonOk, limit, readJson, siteUrl } from "@/lib/http";
import { errors } from "@/lib/errors";
import { createPendingOrder, releaseOrder } from "@/lib/orders";
import { buildQuote, sweepReservations } from "@/lib/shop";
import { readState, transaction } from "@/lib/store";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { cleanString, parseCartItems, parseCheckoutIdentity } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Création d'une commande + session Stripe Checkout.
 *
 * Le serveur : valide le formulaire, relit les produits, vérifie le stock réel,
 * récupère les vrais prix, applique le code promo, calcule les frais de livraison
 * et le total, réserve le stock, puis seulement crée la session de paiement.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "checkout", 10, 60_000);
    assertSameOrigin(request);

    const body = await readJson(request);
    const items = parseCartItems(body.items);
    if (items.length === 0) throw errors.emptyCart();

    const identity = parseCheckoutIdentity(body);
    if (!identity.terms) throw errors.termsRequired();

    const promoCode = cleanString(body.promoCode, 40) || null;

    // Pré-vérification (produits, stock, promo, zone de livraison) : elle donne au
    // client un message précis avant même de parler de paiement. Elle est refaite
    // dans la transaction ci-dessous, qui seule fait autorité.
    buildQuote(await readState(), {
      items,
      promoCode,
      postalCode: identity.address.postalCode,
      city: identity.address.city,
      strict: true,
    });

    if (!isStripeConfigured()) throw errors.stripeNotConfigured();

    const { order, reservationMinutes } = await transaction((state) => {
      sweepReservations(state);
      const quote = buildQuote(state, {
        items,
        promoCode,
        postalCode: identity.address.postalCode,
        city: identity.address.city,
        strict: true,
      });
      if (quote.lines.length === 0) throw errors.emptyCart();
      return {
        order: createPendingOrder(state, { quote, identity }),
        reservationMinutes: state.settings.reservationMinutes,
      };
    });

    try {
      const session = await createCheckoutSession(
        order,
        siteUrl(request),
        reservationMinutes,
      );
      if (!session.url) throw errors.stripeError();

      await transaction((state) => {
        const stored = state.orders.find((o) => o.id === order.id);
        if (stored) {
          stored.stripeSessionId = session.id;
          stored.updatedAt = new Date().toISOString();
        }
      });

      return jsonOk({ url: session.url, orderNumber: order.number });
    } catch (error) {
      // Le paiement n'a pas pu démarrer : on relâche immédiatement le stock réservé.
      await transaction((state) => {
        releaseOrder(
          state,
          order.id,
          "Session de paiement non créée : stock libéré.",
          "failed",
        );
      });
      console.error("[hadrishop] création de session Stripe impossible", error);
      throw errors.stripeError();
    }
  });
}
