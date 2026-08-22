/**
 * Test de la logique métier critique de Hadrishop (stock, réservations, promotions,
 * zones de livraison, calcul serveur des totaux).
 *
 *   npm run selftest
 */
import { newId } from "../lib/ids";
import { confirmOrderPayment, createPendingOrder } from "../lib/orders";
import { buildQuote, availableStock, sweepReservations } from "../lib/shop";
import { readState, transaction } from "../lib/store";
import type { CheckoutIdentity } from "../lib/validation";

let failures = 0;

function check(label: string, condition: boolean, extra = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

function expectThrows(label: string, fn: () => unknown, code?: string): void {
  try {
    fn();
    failures += 1;
    console.log(`  FAIL ${label} — aucune erreur levée`);
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (code && actual !== code) {
      failures += 1;
      console.log(`  FAIL ${label} — code ${actual} au lieu de ${code}`);
    } else {
      console.log(`  ok   ${label} (${actual})`);
    }
  }
}

const identity: CheckoutIdentity = {
  customer: {
    firstName: "Test",
    lastName: "Client",
    email: "test@example.org",
    phone: "+32470000000",
  },
  address: {
    street: "Rue de la Gare",
    streetNumber: "1",
    complement: "",
    postalCode: "1435",
    city: "Corbais",
    country: "Belgique",
  },
  note: "",
  terms: true,
  marketing: false,
};

async function main() {
  console.log("\n== Catalogue initial ==");
  const state0 = await readState();
  check("13 produits initiaux", state0.products.length === 13, `${state0.products.length}`);
  const p14 = state0.products.find((p) => p.sku === "P14");
  check("P14 Presse-savon en rupture", p14?.stock === 0);
  check(
    "P2 Porte casque à 2,99 € / stock 3",
    state0.products.find((p) => p.sku === "P2")?.priceCents === 299 &&
      state0.products.find((p) => p.sku === "P2")?.stock === 3,
  );
  check(
    "aucun produit de don",
    !state0.products.some((p) => /don|donation/i.test(p.name)),
  );
  check(
    "zone 1435 configurée avec les 3 communes",
    state0.shippingZones.some(
      (z) =>
        z.postalCode === "1435" &&
        ["Mont-Saint-Guibert", "Corbais", "Hévillers"].every((c) => z.cities.includes(c)),
    ),
  );

  console.log("\n== Calcul serveur du panier ==");
  const p2 = state0.products.find((p) => p.sku === "P2")!;
  const quote = buildQuote(state0, {
    items: [{ productId: p2.id, quantity: 2 }],
    postalCode: "1435",
    city: "corbais",
  });
  check("sous-total calculé côté serveur", quote.subtotalCents === 598, `${quote.subtotalCents}`);
  check("livraison couverte (commune insensible à la casse)", quote.shippingCovered === true);
  check("total cohérent", quote.totalCents === 598 + quote.shippingCents);

  const outside = buildQuote(state0, {
    items: [{ productId: p2.id, quantity: 1 }],
    postalCode: "1000",
    city: "Bruxelles",
  });
  check("adresse hors zone refusée", outside.shippingCovered === false);
  expectThrows(
    "commande hors zone bloquée (strict)",
    () =>
      buildQuote(state0, {
        items: [{ productId: p2.id, quantity: 1 }],
        postalCode: "1000",
        city: "Bruxelles",
        strict: true,
      }),
    "shipping_not_covered",
  );

  expectThrows(
    "produit en rupture non commandable",
    () =>
      buildQuote(state0, {
        items: [{ productId: p14!.id, quantity: 1 }],
        strict: true,
      }),
    "out_of_stock",
  );

  console.log("\n== Promotions ==");
  const promoId = await transaction((state) => {
    const id = newId();
    state.promotions.push({
      id,
      code: "TEST10",
      active: true,
      type: "percent",
      value: 10,
      startsAt: null,
      endsAt: null,
      minSubtotalCents: null,
      maxUses: 1,
      uses: 0,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.promotions.push({
      id: newId(),
      code: "EXPIRE",
      active: true,
      type: "fixed",
      value: 100,
      startsAt: null,
      endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      minSubtotalCents: null,
      maxUses: null,
      uses: 0,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return id;
  });

  const state1 = await readState();
  const withPromo = buildQuote(state1, {
    items: [{ productId: p2.id, quantity: 2 }],
    promoCode: "test10",
    postalCode: "1435",
    city: "Corbais",
  });
  check("remise 10 % appliquée", withPromo.discountCents === 60, `${withPromo.discountCents}`);
  expectThrows(
    "code expiré refusé",
    () =>
      buildQuote(state1, {
        items: [{ productId: p2.id, quantity: 1 }],
        promoCode: "EXPIRE",
        strict: true,
      }),
    "invalid_promo",
  );
  expectThrows(
    "code inconnu refusé",
    () =>
      buildQuote(state1, {
        items: [{ productId: p2.id, quantity: 1 }],
        promoCode: "NIMPORTEQUOI",
        strict: true,
      }),
    "invalid_promo",
  );

  console.log("\n== Réservation de stock et concurrence ==");
  const p4 = state1.products.find((p) => p.sku === "P4")!; // stock 2
  const orderA = await transaction((state) => {
    const q = buildQuote(state, {
      items: [{ productId: p4.id, quantity: 2 }],
      postalCode: "1435",
      city: "Corbais",
      strict: true,
    });
    return createPendingOrder(state, { quote: q, identity });
  });
  check("numéro de commande au format HAD-AAAA-NNNNNN", /^HAD-\d{4}-\d{6}$/.test(orderA.number), orderA.number);

  const state2 = await readState();
  check(
    "stock physique inchangé avant paiement",
    state2.products.find((p) => p.id === p4.id)!.stock === 2,
  );
  check("stock disponible tombé à 0 (réservé)", availableStock(state2, p4) === 0);
  expectThrows(
    "un second client ne peut pas prendre le dernier exemplaire",
    () =>
      buildQuote(state2, {
        items: [{ productId: p4.id, quantity: 1 }],
        postalCode: "1435",
        city: "Corbais",
        strict: true,
      }),
    "out_of_stock",
  );

  console.log("\n== Confirmation de paiement ==");
  await transaction((state) =>
    confirmOrderPayment(state, orderA.id, {
      sessionId: "cs_test_selftest",
      paymentIntentId: "pi_test_selftest",
    }),
  );
  const state3 = await readState();
  check("stock décrémenté après paiement", state3.products.find((p) => p.id === p4.id)!.stock === 0);
  const confirmed = state3.orders.find((o) => o.id === orderA.id)!;
  check("statut = paiement confirmé", confirmed.status === "paid" && confirmed.paymentStatus === "paid");

  // Idempotence : rejouer l'événement Stripe ne doit pas décrémenter deux fois.
  await transaction((state) =>
    confirmOrderPayment(state, orderA.id, { sessionId: "cs_test_selftest" }),
  );
  const state4 = await readState();
  check(
    "confirmation idempotente (webhook rejoué)",
    state4.products.find((p) => p.id === p4.id)!.stock === 0,
  );

  console.log("\n== Expiration de réservation ==");
  const p5 = state4.products.find((p) => p.sku === "P5")!;
  const orderB = await transaction((state) => {
    const q = buildQuote(state, {
      items: [{ productId: p5.id, quantity: 3 }],
      postalCode: "1435",
      city: "Corbais",
      strict: true,
    });
    return createPendingOrder(state, { quote: q, identity });
  });
  check("stock réservé", availableStock(await readState(), p5) === 0);

  await transaction((state) => {
    const reservation = state.reservations.find((r) => r.orderId === orderB.id)!;
    reservation.expiresAt = new Date(Date.now() - 60_000).toISOString();
  });
  await transaction((state) => sweepReservations(state));
  const state5 = await readState();
  check("stock libéré après expiration", availableStock(state5, p5) === 3);
  const expired = state5.orders.find((o) => o.id === orderB.id)!;
  check(
    "commande non payée annulée automatiquement",
    expired.status === "canceled" && expired.paymentStatus === "canceled",
  );

  console.log("\n== Compteur de promotion ==");
  const promo = state5.promotions.find((p) => p.id === promoId)!;
  check("compteur d'utilisation à 0 (promo non utilisée)", promo.uses === 0);

  console.log(
    failures === 0
      ? "\n✅ Tous les contrôles sont passés.\n"
      : `\n❌ ${failures} contrôle(s) en échec.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
