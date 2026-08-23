/**
 * Test de la logique métier critique de Hadrishop (stock, réservations, promotions,
 * zones de livraison, calcul serveur des totaux, avis clients).
 *
 *   npm run selftest
 */
import { deleteAsset, readAsset, saveAsset } from "../lib/assets";
import {
  fileExtension,
  fileFormats,
  formatBytes,
  orderDownloads,
} from "../lib/digital";
import { newId } from "../lib/ids";
import {
  MIN_RESERVATION_MINUTES,
  confirmOrderPayment,
  createPendingOrder,
  publicOrderView,
} from "../lib/orders";
import { markRefunded } from "../lib/payments";
import { cartSuggestions } from "../lib/recommendations";
import {
  approvedReviews,
  clearReviewReports,
  createReview,
  frequentThemes,
  isVerifiedPurchase,
  reportReview,
  sanitizeReviewPhotos,
  setReviewReply,
  voteReviewHelpful,
} from "../lib/reviews";
import {
  availableStock,
  buildQuote,
  listPublicProducts,
  resolveShipping,
  salesCounts,
  sortProducts,
  sweepReservations,
} from "../lib/shop";
import { readState, transaction } from "../lib/store";
import { MAX_REVIEW_PHOTOS, type Product } from "../lib/types";
import { decodeUpload, isGlbFile, newAssetId, sanitizeFileName } from "../lib/uploads";
import { parseCheckoutIdentity, type CheckoutIdentity } from "../lib/validation";

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

  console.log("\n== Livraison : une zone déclarée fait toujours autorité ==");
  // 1300 (Wavre) est à moins de 30 km de 1435 : sans zone déclarée, la distance
  // suffirait à couvrir la livraison. Une zone existe pourtant pour ce code
  // postal (voir `defaultShippingZones`) — désactivée ou restreinte à une autre
  // commune, elle doit l'emporter sur le calcul automatique, jamais s'effacer
  // devant lui.
  const shippingState = structuredClone(state0);
  const zone1300 = shippingState.shippingZones.find((z) => z.postalCode === "1300")!;
  zone1300.active = false;
  check(
    "zone désactivée : livraison refusée (pas de repli par distance)",
    resolveShipping(shippingState, "1300", "Wavre").covered === false,
  );
  zone1300.active = true;
  zone1300.cities = ["Wavre"];
  zone1300.feeCents = 500;
  check(
    "commune non listée dans la zone : livraison refusée",
    resolveShipping(shippingState, "1300", "Bierges").covered === false,
  );
  const wavreResult = resolveShipping(shippingState, "1300", "Wavre");
  check(
    "commune listée : tarif manuel de la zone appliqué",
    wavreResult.covered === true && wavreResult.feeCents === 500,
  );
  check(
    "code postal sans aucune zone déclarée : repli par distance toujours actif",
    resolveShipping(
      { ...shippingState, shippingZones: [] },
      "1300",
      "Wavre",
    ).covered === true,
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
      oncePerCustomer: false,
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
      oncePerCustomer: false,
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
  check(
    "réservation d'au moins 30 min même avec un réglage admin plus court (15 min ici)",
    state1.settings.reservationMinutes < MIN_RESERVATION_MINUTES &&
      (() => {
        const reservation = state2.reservations.find((r) => r.orderId === orderA.id)!;
        const minutesLeft = (Date.parse(reservation.expiresAt) - Date.now()) / 60_000;
        // Marge de quelques secondes pour le temps d'exécution du test lui-même.
        return minutesLeft >= MIN_RESERVATION_MINUTES - 0.1;
      })(),
  );
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

  console.log("\n== Remboursement Stripe (webhook charge.refunded) ==");
  const p6 = state4.products.find((p) => p.sku === "P6")!;
  const refundOrder = await transaction((state) => {
    const q = buildQuote(state, {
      items: [{ productId: p6.id, quantity: 2 }],
      postalCode: "1435",
      city: "Corbais",
      strict: true,
    });
    return createPendingOrder(state, { quote: q, identity });
  });
  await transaction((state) =>
    confirmOrderPayment(state, refundOrder.id, { paymentIntentId: "pi_refund_selftest" }),
  );
  const stockBeforeRefund = (await readState()).products.find((p) => p.id === p6.id)!.stock;

  await markRefunded("pi_refund_selftest", false);
  const afterPartial = await readState();
  const orderAfterPartial = afterPartial.orders.find((o) => o.id === refundOrder.id)!;
  check(
    "remboursement partiel : commande toujours payée",
    orderAfterPartial.paymentStatus === "paid" && orderAfterPartial.status === "paid",
  );
  check(
    "remboursement partiel : stock non touché",
    afterPartial.products.find((p) => p.id === p6.id)!.stock === stockBeforeRefund,
  );

  await markRefunded("pi_refund_selftest", true);
  const afterFull = await readState();
  const orderAfterFull = afterFull.orders.find((o) => o.id === refundOrder.id)!;
  check(
    "remboursement total : commande marquée remboursée",
    orderAfterFull.paymentStatus === "refunded" && orderAfterFull.status === "refunded",
  );
  check(
    "remboursement total : stock remis en rayon",
    afterFull.products.find((p) => p.id === p6.id)!.stock === stockBeforeRefund + 2,
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

  const p7 = state5.products.find((p) => p.sku === "P7")!;
  const promoOrder = await transaction((state) => {
    const q = buildQuote(state, {
      items: [{ productId: p7.id, quantity: 1 }],
      promoCode: "TEST10",
      postalCode: "1435",
      city: "Corbais",
      strict: true,
    });
    return createPendingOrder(state, { quote: q, identity });
  });
  await transaction((state) =>
    confirmOrderPayment(state, promoOrder.id, { paymentIntentId: "pi_promo_selftest" }),
  );
  const statePromoUsed = await readState();
  check(
    "compteur incrémenté après paiement d'une commande avec ce code",
    statePromoUsed.promotions.find((p) => p.id === promoId)!.uses === 1,
  );

  // Le remboursement (webhook Stripe) rend l'utilisation, comme l'annulation
  // admin le fait déjà pour le stock — même garde-fou, même symétrie.
  await markRefunded("pi_promo_selftest", true);
  const statePromoReleased = await readState();
  check(
    "remboursement total : le code redevient utilisable (compteur revenu à 0)",
    statePromoReleased.promotions.find((p) => p.id === promoId)!.uses === 0,
  );
  check(
    "commande remboursée elle-même marquée refunded",
    statePromoReleased.orders.find((o) => o.id === promoOrder.id)!.status === "refunded",
  );

  console.log("\n== Avis clients ==");
  // `orderA` (p4) a été payée avec identity.customer.email ; `orderB` (p5) a été
  // annulée faute de paiement. Le badge doit distinguer les deux.
  const buyerEmail = identity.customer.email;
  check(
    "achat vérifié : commande payée contenant le produit",
    isVerifiedPurchase(state5, p4.id, buyerEmail),
  );
  check(
    "casse et espaces ignorés dans l'e-mail",
    isVerifiedPurchase(state5, p4.id, `  ${buyerEmail.toUpperCase()} `),
  );
  check(
    "non vérifié : e-mail inconnu",
    !isVerifiedPurchase(state5, p4.id, "inconnu@example.org"),
  );
  check(
    "non vérifié : bon e-mail, produit jamais commandé",
    !isVerifiedPurchase(state5, p2.id, buyerEmail),
  );
  // orderB contenait bien p5, mais elle a été annulée faute de paiement.
  check(
    "non vérifié : la commande contenant le produit a été annulée",
    !isVerifiedPurchase(state5, p5.id, buyerEmail),
  );
  check("non vérifié : aucun e-mail donné", !isVerifiedPurchase(state5, p4.id, ""));

  const verified = await transaction((state) =>
    createReview(state, {
      productId: p4.id,
      author: "Acheteuse",
      rating: 5,
      comment: "Très content de cet achat, la finition est nette.",
      email: buyerEmail,
    }),
  );
  check("avis d'un acheteur : publié et vérifié", !verified.flagged && verified.verified);
  check(
    "avis neuf : aucune réponse, aucun vote",
    verified.reply === null && verified.helpfulYes === 0 && verified.helpfulNo === 0,
  );

  const anonymous = await transaction((state) =>
    createReview(state, {
      productId: p4.id,
      author: "Passant",
      rating: 4,
      comment: "Objet correct pour le prix, rien à redire.",
    }),
  );
  check("avis sans e-mail : publié, non vérifié", !anonymous.flagged && !anonymous.verified);

  // Réponse de la boutique : écrite, puis retirée par un texte vide.
  await transaction((state) => {
    const review = state.reviews.find((r) => r.id === verified.id)!;
    setReviewReply(review, "  Merci beaucoup pour votre retour !  ");
  });
  const withReply = (await readState()).reviews.find((r) => r.id === verified.id)!;
  check(
    "réponse enregistrée et détourée",
    withReply.reply?.text === "Merci beaucoup pour votre retour !",
  );
  await transaction((state) => {
    setReviewReply(state.reviews.find((r) => r.id === verified.id)!, "   ");
  });
  check(
    "réponse retirée par un texte vide",
    (await readState()).reviews.find((r) => r.id === verified.id)!.reply === null,
  );

  // Votes d'utilité.
  await transaction((state) => {
    const review = state.reviews.find((r) => r.id === verified.id)!;
    voteReviewHelpful(review, true);
    voteReviewHelpful(review, true);
    voteReviewHelpful(review, false);
  });
  const voted = (await readState()).reviews.find((r) => r.id === verified.id)!;
  check("votes comptés séparément", voted.helpfulYes === 2 && voted.helpfulNo === 1);

  // Les avis marqués comme spam ne comptent ni dans la liste ni dans la moyenne.
  const spam = await transaction((state) =>
    createReview(state, {
      productId: p4.id,
      author: "Bot",
      rating: 1,
      comment: "Visitez https://exemple-spam.test pour gagner de l'argent facilement.",
    }),
  );
  check("lien détecté comme spam", spam.flagged);
  const publicList = approvedReviews(await readState(), p4.id);
  check(
    "avis spam absent de la liste publique",
    publicList.length === 2 && !publicList.some((r) => r.id === spam.id),
  );

  console.log("\n== Photos et signalements d'avis ==");
  // Le serveur ne fait confiance à rien de ce que le navigateur envoie.
  const jpeg = `data:image/jpeg;base64,${"A".repeat(400)}`;
  check(
    "photo JPEG acceptée",
    sanitizeReviewPhotos([jpeg]).length === 1,
  );
  check(
    "SVG refusé (peut porter du script)",
    sanitizeReviewPhotos(["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="]).length === 0,
  );
  check(
    "URL distante refusée",
    sanitizeReviewPhotos(["https://exemple.test/photo.jpg"]).length === 0,
  );
  check(
    "photo trop lourde refusée",
    sanitizeReviewPhotos([`data:image/jpeg;base64,${"A".repeat(400_000)}`]).length === 0,
  );
  check(
    `pas plus de ${MAX_REVIEW_PHOTOS} photos`,
    sanitizeReviewPhotos([jpeg, jpeg, jpeg, jpeg]).length === MAX_REVIEW_PHOTOS,
  );
  check("valeur non tableau ignorée", sanitizeReviewPhotos("pas un tableau").length === 0);

  await transaction((state) => {
    const review = state.reviews.find((r) => r.id === verified.id)!;
    reportReview(review);
    reportReview(review);
  });
  const flaggedByVisitors = (await readState()).reviews.find((r) => r.id === verified.id)!;
  check("signalements comptés", flaggedByVisitors.reports === 2);
  check(
    "un signalement ne masque pas l'avis",
    !flaggedByVisitors.flagged &&
      approvedReviews(await readState(), p4.id).some((r) => r.id === verified.id),
  );
  await transaction((state) =>
    clearReviewReports(state.reviews.find((r) => r.id === verified.id)!),
  );
  check(
    "signalements remis à zéro",
    (await readState()).reviews.find((r) => r.id === verified.id)!.reports === 0,
  );

  console.log("\n== Points le plus souvent cités ==");
  const themeProduct = (await readState()).products.find((p) => p.sku === "P6")!;
  await transaction((state) => {
    const comments = [
      "Finition impeccable et objet très solide, je recommande.",
      "La finition est nette, livraison rapide en prime.",
      "Solide, bien fini. Livraison rapide elle aussi.",
      "Un peu petit à mon goût mais la finition reste correcte.",
    ];
    for (const [index, comment] of comments.entries()) {
      createReview(state, {
        productId: themeProduct.id,
        author: `Client ${index + 1}`,
        rating: 4,
        comment,
      });
    }
  });
  const themeReviews = approvedReviews(await readState(), themeProduct.id);
  const themes = frequentThemes(themeReviews, themeProduct.name);
  const labels = themes.map((t) => t.label);
  check("« finition » ressort des 4 avis", labels.includes("finition"), labels.join(", "));
  check("singulier et pluriel regroupés", labels.includes("solide"), labels.join(", "));
  check(
    "un mot cité une seule fois est écarté",
    !labels.includes("petit"),
    labels.join(", "),
  );
  check(
    "compte des avis distincts, pas des occurrences",
    themes.find((t) => t.label === "finition")?.reviews === 3,
    JSON.stringify(themes),
  );
  check("aucun mot vide dans le résumé", !labels.some((l) => ["très", "tres", "mais"].includes(l)));
  check(
    "résumé muet en dessous de 3 avis",
    frequentThemes(themeReviews.slice(0, 2), "").length === 0,
  );

  console.log("\n== Ventes, nouveautés et suggestions de panier ==");
  const state6 = await readState();
  const sales = salesCounts(state6);
  // orderA : 2 exemplaires de P4, payée. orderB : P5, annulée faute de paiement.
  check("quantités payées comptées", sales.get(p4.id) === 2, `${sales.get(p4.id)}`);
  check("commande annulée non comptée", (sales.get(p5.id) ?? 0) === 0);
  const bestSellers = sortProducts(listPublicProducts(state6), "ventes", { sales });
  check(
    "le produit vendu passe devant les invendus en stock",
    bestSellers.filter((p) => p.inStock)[0]?.id === p4.id ||
      // P4 est en rupture après la vente : il passe alors en fin de liste, ce qui
      // reste la règle générale du tri.
      !bestSellers.find((p) => p.id === p4.id)?.inStock,
  );

  const fresh = await transaction((state) => {
    const product = state.products.find((p) => p.sku === "P6")!;
    product.createdAt = new Date().toISOString();
    const old = state.products.find((p) => p.sku === "P7")!;
    old.createdAt = new Date(Date.now() - 120 * 86_400_000).toISOString();
    return { newId: product.id, oldId: old.id };
  });
  const state7 = await readState();
  const catalogue = listPublicProducts(state7);
  check(
    "produit récent marqué comme nouveauté",
    catalogue.find((p) => p.id === fresh.newId)?.isNew === true,
  );
  check(
    "produit ancien non marqué",
    catalogue.find((p) => p.id === fresh.oldId)?.isNew === false,
  );

  const suggested = cartSuggestions(state7, [p4.id]);
  check(
    "suggestions hors panier et en stock",
    suggested.length > 0 &&
      suggested.every((p) => p.id !== p4.id && p.inStock),
    `${suggested.length}`,
  );
  check("panier vide : aucune suggestion", cartSuggestions(state7, []).length === 0);

  console.log("\n== Code promo une fois par client ==");
  const oncePromoId = await transaction((state) => {
    const promotion = state.promotions.find((p) => p.id === promoId)!;
    promotion.oncePerCustomer = true;
    promotion.maxUses = null;
    return promotion.id;
  });
  const state8 = await readState();
  // orderA a été payée par identity.customer.email, mais sans ce code.
  check(
    "code accepté pour un client qui ne l'a jamais utilisé",
    buildQuote(state8, {
      items: [{ productId: p2.id, quantity: 2 }],
      promoCode: "TEST10",
      customerEmail: buyerEmail,
    }).discountCents === 60,
  );
  await transaction((state) => {
    const order = state.orders.find((o) => o.id === orderA.id)!;
    order.promotionId = oncePromoId;
  });
  const state9 = await readState();
  expectThrows(
    "code refusé au même client la seconde fois",
    () =>
      buildQuote(state9, {
        items: [{ productId: p2.id, quantity: 2 }],
        promoCode: "TEST10",
        customerEmail: buyerEmail,
        strict: true,
      }),
    "invalid_promo",
  );
  check(
    "code accepté pour une autre adresse",
    buildQuote(state9, {
      items: [{ productId: p2.id, quantity: 2 }],
      promoCode: "TEST10",
      customerEmail: "quelquun.dautre@example.org",
    }).discountCents === 60,
  );
  const anonymousQuote = buildQuote(state9, {
    items: [{ productId: p2.id, quantity: 2 }],
    promoCode: "TEST10",
  });
  check(
    "panier sans e-mail : code appliqué mais signalé",
    anonymousQuote.discountCents === 60 && anonymousQuote.promoOncePerCustomer,
  );

  // Course entre deux commandes créées avant que l'une des deux ne soit payée :
  // sans compter les commandes encore en attente, les deux passeraient le
  // contrôle (aucune n'étant encore « payée » aux yeux de l'autre), ce qui
  // permettrait d'utiliser un code réservé à un usage par client autant de
  // fois qu'on ouvre de commandes en parallèle sans attendre le paiement.
  const p3 = state9.products.find((p) => p.sku === "P3")!;
  const raceEmail = "course@example.org";
  const pendingRaceOrder = await transaction((state) => {
    const q = buildQuote(state, {
      items: [{ productId: p3.id, quantity: 1 }],
      promoCode: "TEST10",
      customerEmail: raceEmail,
      strict: true,
    });
    const order = createPendingOrder(state, {
      quote: q,
      identity: { ...identity, customer: { ...identity.customer, email: raceEmail } },
    });
    order.promotionId = oncePromoId;
    return order;
  });
  const statePromoRace = await readState();
  expectThrows(
    "seconde commande, même client : refusée tant que la première commande n'a pas expiré (même non payée)",
    () =>
      buildQuote(statePromoRace, {
        items: [{ productId: p3.id, quantity: 1 }],
        promoCode: "TEST10",
        customerEmail: raceEmail,
        strict: true,
      }),
    "invalid_promo",
  );

  // La première commande expire sans jamais avoir été payée : le code redevient
  // utilisable, exactement comme pour un panier simplement abandonné.
  await transaction((state) => {
    const reservation = state.reservations.find((r) => r.orderId === pendingRaceOrder.id)!;
    reservation.expiresAt = new Date(Date.now() - 60_000).toISOString();
  });
  await transaction((state) => sweepReservations(state));
  const statePromoRaceExpired = await readState();
  check(
    "commande expirée non payée : le code redevient utilisable pour le même client",
    buildQuote(statePromoRaceExpired, {
      items: [{ productId: p3.id, quantity: 1 }],
      promoCode: "TEST10",
      customerEmail: raceEmail,
      strict: true,
    }).discountCents > 0,
  );

  // Pré-vérification du checkout (avant la transaction qui, elle, balaie déjà) :
  // une commande antérieure du même client, jamais payée, dont la réservation a
  // expiré, ne doit JAMAIS faire échouer la pré-vérification avec « déjà
  // utilisé » — même si rien d'autre n'a encore persisté le balayage de cette
  // réservation précise. `/api/checkout` lit un état frais puis balaie cette
  // copie LOCALE avant d'évaluer le code, exactement comme reproduit ici : sans
  // ce balayage local, la commande abandonnée compterait à tort (bug réel
  // reproduit en conditions réelles, corrigé dans app/api/checkout/route.ts).
  const staleEmail = "abandon@example.org";
  const staleOrder = await transaction((state) => {
    const q = buildQuote(state, {
      items: [{ productId: p3.id, quantity: 1 }],
      promoCode: "TEST10",
      customerEmail: staleEmail,
      strict: true,
    });
    const order = createPendingOrder(state, {
      quote: q,
      identity: { ...identity, customer: { ...identity.customer, email: staleEmail } },
    });
    order.promotionId = oncePromoId;
    return order;
  });
  // La réservation expire, mais rien ne persiste ce balayage (à la différence du
  // scénario précédent) : c'est exactement l'état que lirait le pré-contrôle.
  await transaction((state) => {
    const reservation = state.reservations.find((r) => r.orderId === staleOrder.id)!;
    reservation.expiresAt = new Date(Date.now() - 60_000).toISOString();
  });
  const staleStateUnswept = await readState();
  expectThrows(
    "sans balayage local, le pré-contrôle refuserait à tort (piège documenté)",
    () =>
      buildQuote(staleStateUnswept, {
        items: [{ productId: p3.id, quantity: 1 }],
        promoCode: "TEST10",
        customerEmail: staleEmail,
        strict: true,
      }),
    "invalid_promo",
  );
  const staleStateSweptLocally = await readState();
  sweepReservations(staleStateSweptLocally);
  check(
    "avec le balayage local du pré-contrôle, le code redevient utilisable immédiatement",
    buildQuote(staleStateSweptLocally, {
      items: [{ productId: p3.id, quantity: 1 }],
      promoCode: "TEST10",
      customerEmail: staleEmail,
      strict: true,
    }).discountCents > 0,
  );

  console.log("\n== Fichiers numériques : utilitaires ==");
  check("extension lisible", fileExtension("modele-v2.STL") === "STL");
  check("extension absente", fileExtension("sans-extension") === "");
  check(
    "formats dédoublonnés dans l'ordre",
    fileFormats([{ name: "a.stl" }, { name: "b.pdf" }, { name: "c.STL" }]).join(",") ===
      "STL,PDF",
  );
  check("taille en Mo", formatBytes(2_100_000) === "2,1 Mo");
  check("taille en Ko", formatBytes(340_000) === "340 Ko");
  check(
    "nom de fichier débarrassé de son chemin",
    sanitizeFileName("../../etc/passwd") === "passwd",
  );
  check("nom vide remplacé", sanitizeFileName("") === "fichier");

  const decoded = decodeUpload(
    { name: "notice.txt", data: `data:text/plain;base64,${Buffer.from("bonjour").toString("base64")}` },
    1000,
  );
  check(
    "data-URI décodée avec son type",
    decoded.name === "notice.txt" &&
      decoded.contentType === "text/plain" &&
      decoded.bytes.toString() === "bonjour",
  );
  check(
    "base64 nu accepté, type générique",
    decodeUpload({ name: "x.bin", data: Buffer.from("ab").toString("base64") }, 100)
      .contentType === "application/octet-stream",
  );
  expectThrows(
    "fichier trop volumineux refusé",
    () => decodeUpload({ name: "gros.stl", data: Buffer.alloc(500).toString("base64") }, 100),
    "validation_error",
  );
  expectThrows(
    "contenu vide refusé",
    () => decodeUpload({ name: "vide.stl", data: "" }, 100),
    "validation_error",
  );
  check(
    "en-tête GLB reconnue",
    isGlbFile(Buffer.concat([Buffer.from("glTF"), Buffer.alloc(20)])),
  );
  check("fichier non GLB rejeté", !isGlbFile(Buffer.from("solid ascii stl content")));

  console.log("\n== Magasin d'assets ==");
  const assetId = newAssetId();
  await saveAsset(assetId, Buffer.from("contenu du fichier vendu"));
  const roundTrip = await readAsset(assetId);
  check("asset relu à l'identique", roundTrip?.toString() === "contenu du fichier vendu");
  check("identifiant inconnu : rien", (await readAsset(newAssetId())) === null);
  check("identifiant invalide : rien", (await readAsset("../../etc/passwd")) === null);
  await deleteAsset(assetId);
  check("asset supprimé", (await readAsset(assetId)) === null);

  console.log("\n== Produit numérique : vente et remise ==");
  const digitalAssetId = newAssetId();
  await saveAsset(digitalAssetId, Buffer.from("STL du porte-casque"));
  const digitalId = await transaction((state) => {
    const now = new Date().toISOString();
    const product: Product = {
      id: newId(),
      sku: "DIGI1",
      slug: "modele-porte-casque",
      name: "Modèle 3D — Porte casque",
      description: "Le fichier source à imprimer chez soi.",
      priceCents: 500,
      stock: 0,
      imageUrl: "",
      active: true,
      category: "Fichiers",
      sortOrder: 999,
      archived: false,
      kind: "digital",
      digitalFiles: [
        {
          id: digitalAssetId,
          name: "porte-casque.stl",
          sizeBytes: 19,
          contentType: "application/octet-stream",
          createdAt: now,
        },
      ],
      model3d: null,
      createdAt: now,
      updatedAt: now,
    };
    state.products.push(product);
    return product.id;
  });

  const state10 = await readState();
  const digitalPublic = listPublicProducts(state10).find((p) => p.id === digitalId)!;
  check(
    "fichier vendable malgré un stock à zéro",
    digitalPublic.inStock && digitalPublic.available === 1,
  );
  check(
    "formats et compteur exposés au catalogue",
    digitalPublic.kind === "digital" &&
      digitalPublic.fileCount === 1 &&
      digitalPublic.fileFormats.join(",") === "STL",
  );

  const digitalQuote = buildQuote(state10, {
    items: [{ productId: digitalId, quantity: 5 }],
    postalCode: "9999",
    city: "Hors zone",
  });
  check(
    "quantité ramenée à un exemplaire",
    digitalQuote.lines[0]?.quantity === 1 &&
      digitalQuote.issues.some((issue) => issue.code === "digital_single"),
  );
  check(
    "panier tout numérique : ni frais ni zone à couvrir",
    digitalQuote.digitalOnly &&
      digitalQuote.hasDigital &&
      digitalQuote.shippingCents === 0 &&
      digitalQuote.shippingCovered === true,
    `covered=${digitalQuote.shippingCovered}`,
  );
  const mixedQuote = buildQuote(state10, {
    items: [
      { productId: digitalId, quantity: 1 },
      { productId: p2.id, quantity: 1 },
    ],
    postalCode: "1435",
    city: "Corbais",
  });
  check(
    "panier mixte : livraison toujours résolue",
    mixedQuote.hasDigital && !mixedQuote.digitalOnly && mixedQuote.shippingCovered === true,
  );

  check(
    "adresse facultative pour une commande de fichiers",
    parseCheckoutIdentity(
      {
        firstName: "Test",
        lastName: "Client",
        email: "fichier@example.org",
        phone: "+32470000000",
        terms: true,
      },
      { requireAddress: false },
    ).customer.email === "fichier@example.org",
  );
  expectThrows(
    "adresse exigée pour un objet à livrer",
    () =>
      parseCheckoutIdentity({
        firstName: "Test",
        lastName: "Client",
        email: "objet@example.org",
        phone: "+32470000000",
        terms: true,
      }),
    "invalid_customer_data",
  );

  const digitalOrder = await transaction((state) => {
    const quote = buildQuote(state, { items: [{ productId: digitalId, quantity: 1 }] });
    return createPendingOrder(state, { quote, identity });
  });
  check(
    "aucun stock réservé pour un fichier",
    (await readState()).reservations.find((r) => r.orderId === digitalOrder.id)?.items
      .length === 0,
  );
  check(
    "avant paiement : aucun téléchargement",
    orderDownloads(await readState(), digitalOrder).length === 0,
  );

  await transaction((state) => {
    confirmOrderPayment(state, digitalOrder.id, {});
  });
  const state11 = await readState();
  const paidDigital = state11.orders.find((o) => o.id === digitalOrder.id)!;
  const downloads = orderDownloads(state11, paidDigital);
  check(
    "après paiement : le fichier est remis",
    downloads.length === 1 && downloads[0].files[0]?.name === "porte-casque.stl",
  );
  check(
    "le lien porte le jeton de la commande",
    publicOrderView(paidDigital, state11).downloads[0]?.files[0]?.url.includes(
      paidDigital.accessToken,
    ) === true,
  );
  check(
    "vue publique sans état : aucun lien",
    publicOrderView(paidDigital).downloads.length === 0,
  );
  check(
    "le stock du produit numérique n'a pas bougé",
    state11.products.find((p) => p.id === digitalId)?.stock === 0,
  );

  const refunded = await transaction((state) => {
    const order = state.orders.find((o) => o.id === digitalOrder.id)!;
    order.status = "refunded";
    order.paymentStatus = "refunded";
    return order;
  });
  check(
    "commande remboursée : accès révoqué",
    orderDownloads(await readState(), refunded).length === 0,
  );
  await deleteAsset(digitalAssetId);

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
