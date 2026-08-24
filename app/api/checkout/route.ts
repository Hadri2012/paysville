import { assertSameOrigin, handle, jsonOk, limit, limitGlobal, readJson, siteUrl } from "@/lib/http";
import { errors } from "@/lib/errors";
import { notifyOrderStatus } from "@/lib/notify";
import { confirmOrderPayment, createPendingOrder, releaseOrder } from "@/lib/orders";
import { buildQuote, sweepReservations } from "@/lib/shop";
import { readState, transaction } from "@/lib/store";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { verifyTestBypassCode } from "@/lib/testBypass";
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
    // Filet global, non contournable en changeant d'adresse IP prétendue à
    // chaque tentative (voir `limitGlobal`).
    limitGlobal("checkout", 100, 60_000);
    assertSameOrigin(request);

    const body = await readJson(request);
    const items = parseCartItems(body.items);
    if (items.length === 0) throw errors.emptyCart();

    const promoCode = cleanString(body.promoCode, 40) || null;

    // Un panier entièrement composé de fichiers ne s'expédie pas : l'adresse
    // postale devient facultative. Il faut donc connaître la nature du panier
    // avant de valider le formulaire — d'où ce devis préalable, sans adresse.
    const preview = buildQuote(await readState(), { items, promoCode, strict: false });

    const identity = parseCheckoutIdentity(body, { requireAddress: !preview.digitalOnly });
    if (!identity.terms) throw errors.termsRequired();

    // Code de contournement pour valider une commande sans paiement Stripe réel
    // (test uniquement — voir lib/testBypass.ts). Inactif par défaut, et refuse de
    // fonctionner si une clé Stripe de production est configurée.
    const bypass = verifyTestBypassCode(body.testBypassCode);

    // Pré-vérification stricte (produits, stock, promo, zone de livraison) : elle
    // donne au client un message précis avant même de parler de paiement. Elle est
    // refaite dans la transaction ci-dessous, qui seule fait autorité.
    //
    // Le balayage des réservations expirées est indispensable ici aussi (pas
    // seulement dans la transaction plus bas) : sans lui, une précédente commande
    // du même client — abandonnée, jamais payée, dont la réservation a expiré —
    // reste comptée par `hasUsedPromotion` tant que rien d'autre n'a déclenché de
    // balayage. Un code « une fois par client » serait alors refusé à tort, avec
    // un message affirmant que le client l'a « déjà utilisé » alors que sa seule
    // commande avec ce code s'est simplement éteinte sans paiement. La mutation
    // reste locale à cette lecture : elle ne fait pas autorité, seule la
    // transaction ci-dessous écrit l'état.
    const preCheckState = await readState();
    sweepReservations(preCheckState);
    buildQuote(preCheckState, {
      items,
      promoCode,
      customerEmail: identity.customer.email,
      postalCode: identity.address.postalCode,
      city: identity.address.city,
      strict: true,
    });

    if (!bypass && !isStripeConfigured()) throw errors.stripeNotConfigured();

    const { order, reservationMinutes } = await transaction((state) => {
      sweepReservations(state);
      const quote = buildQuote(state, {
        items,
        promoCode,
        customerEmail: identity.customer.email,
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

    if (bypass) {
      await transaction((state) => {
        sweepReservations(state);
        confirmOrderPayment(state, order.id, {});
      });
      // Ce chemin ne passe pas par `applySession` : sans cet appel, la
      // confirmation de commande partirait en production mais jamais en test,
      // c'est-à-dire précisément là où on la vérifie.
      await notifyOrderStatus(order.id, "paid");
      return jsonOk({
        url: `/confirmation?commande=${encodeURIComponent(order.number)}&token=${encodeURIComponent(order.accessToken)}`,
        orderNumber: order.number,
      });
    }

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
