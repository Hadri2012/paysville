import { isPayOnDeliveryMethod, type Order, type OrderStatus, type PaymentMethod } from "../types";

/**
 * Commande fictive servant à l'aperçu des e-mails dans l'administration.
 *
 * Fabriquée plutôt que reprise d'une vraie commande : l'aperçu doit rester
 * stable d'une fois sur l'autre, montrer tous les cas intéressants (plusieurs
 * articles, un fichier téléchargeable, une remise) et ne jamais afficher les
 * coordonnées d'un client réel à l'écran.
 */
export function sampleOrder(status: OrderStatus, paymentMethod: PaymentMethod = "stripe"): Order {
  const createdAt = "2026-08-20T09:24:00.000Z";

  // Historique cohérent avec l'étape demandée : la frise et les dates affichées
  // n'auraient aucun sens si l'aperçu prétendait « expédiée » sans passer par
  // « payée ». Une commande payable à la livraison, elle, ne passe jamais par
  // « paid » — voir `lib/orderFlow.ts#isDeliveryConfirmationStep`.
  const flow: OrderStatus[] = isPayOnDeliveryMethod(paymentMethod)
    ? ["awaiting_payment", "preparing", "ready", "shipped", "delivered"]
    : ["awaiting_payment", "paid", "preparing", "ready", "shipped", "delivered"];
  const upTo = flow.indexOf(status);
  const passed = upTo >= 0 ? flow.slice(0, upTo + 1) : [...flow.slice(0, 2), status];

  return {
    id: "apercu",
    number: "HAD-2026-000042",
    createdAt,
    updatedAt: createdAt,
    customer: {
      firstName: "Camille",
      lastName: "Dupont",
      email: "camille@example.org",
      phone: "+32 470 00 00 00",
    },
    address: {
      street: "Rue de la Gare",
      streetNumber: "12",
      complement: "Boîte 3",
      postalCode: "1435",
      city: "Corbais",
      country: "Belgique",
    },
    note: "",
    items: [
      {
        productId: "p1",
        sku: "P2",
        name: "Porte casque",
        unitPriceCents: 299,
        quantity: 2,
        lineTotalCents: 598,
        imageUrl: "",
        kind: "physical",
      },
      {
        productId: "p2",
        sku: "P12",
        name: "Jeton caddie",
        unitPriceCents: 109,
        quantity: 1,
        lineTotalCents: 109,
        imageUrl: "",
        kind: "physical",
      },
      {
        productId: "p3",
        sku: "N1",
        name: "Modèle 3D — Support de casque",
        unitPriceCents: 450,
        quantity: 1,
        lineTotalCents: 450,
        imageUrl: "",
        kind: "digital",
      },
    ],
    subtotalCents: 1157,
    discountCents: 116,
    promoCode: "BIENVENUE10",
    promotionId: "promo",
    shippingCents: 350,
    totalCents: 1391,
    currency: "EUR",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    paymentMethod,
    paymentStatus:
      status === "refunded"
        ? "refunded"
        : isPayOnDeliveryMethod(paymentMethod) && status !== "delivered"
          ? "pending"
          : "paid",
    status,
    accessToken: "apercu",
    statusHistory: passed.map((step, index) => ({
      status: step,
      at: new Date(Date.parse(createdAt) + index * 36 * 60_000).toISOString(),
      note: undefined,
    })),
    consent: { terms: true, termsAt: createdAt, marketing: false },
    stockCommitted: status !== "awaiting_payment",
    stockWarning: null,
    adminNote: "",
    notifiedStatuses: [],
  };
}
