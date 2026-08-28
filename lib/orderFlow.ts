import {
  ORDER_STATUS_LABELS,
  isPayOnDeliveryMethod,
  type OrderStatus,
  type OrderStatusEvent,
  type PaymentMethod,
} from "./types";

/**
 * Parcours d'une commande, tel qu'il est raconté au client.
 *
 * Partagé entre la frise du suivi de commande (`components/OrderTimeline.tsx`)
 * et les e-mails de notification : ce sont les mêmes étapes et les mêmes
 * phrases. Deux copies auraient fini par diverger, et un client lisant « prête
 * à partir » dans son e-mail puis autre chose sur le site aurait raison de
 * douter de l'une des deux.
 */

/** Parcours normal d'une commande, dans l'ordre. */
export const ORDER_FLOW: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "preparing",
  "ready",
  "shipped",
  "delivered",
];

export const ORDER_STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  awaiting_payment: "Commande enregistrée, en attente de la confirmation du paiement.",
  paid: "Paiement reçu. Votre commande est confirmée.",
  preparing: "Vos articles sont en cours d'impression et de préparation.",
  ready: "Votre commande est emballée et prête à partir.",
  shipped: "Votre colis a quitté l'atelier.",
  delivered: "Votre colis vous a été remis. Merci de votre confiance.",
  canceled: "Cette commande a été annulée. Les articles sont retournés en stock.",
  refunded: "Cette commande a été remboursée.",
};

/** Une commande annulée ou remboursée quitte le parcours normal. */
export function isStoppedStatus(status: OrderStatus): boolean {
  return status === "canceled" || status === "refunded";
}

/**
 * Une commande payable à la livraison (espèces ou carte sur le terminal du
 * livreur) ne passe jamais par l'étape « paid » : rien n'est encaissé avant la
 * remise en main propre (voir `confirmDeliveryOrder` dans `lib/orders.ts`).
 * Elle saute directement à « en préparation », qui joue alors le rôle de
 * confirmation de commande.
 */
export function isDeliveryConfirmationStep(
  status: OrderStatus,
  paymentMethod: PaymentMethod,
  history: OrderStatusEvent[],
): boolean {
  return (
    status === "preparing" &&
    isPayOnDeliveryMethod(paymentMethod) &&
    !history.some((event) => event.status === "paid")
  );
}

/** Comment on désigne, dans une phrase, le règlement à la livraison. */
function deliveryPaymentPhrase(paymentMethod: PaymentMethod): string {
  return paymentMethod === "card_on_delivery"
    ? "par carte au moment de la livraison"
    : "en espèces au moment de la livraison";
}

/**
 * Libellé de l'étape « paid »/« preparing », adapté au moyen de paiement : dire
 * « Paiement confirmé » d'une commande dont rien n'a encore été encaissé
 * induirait le client en erreur.
 */
export function stepLabel(
  status: OrderStatus,
  paymentMethod: PaymentMethod,
  history: OrderStatusEvent[],
): string {
  // Distinct du libellé de « preparing » ci-dessous : les deux étapes
  // partagent leur date (voir `buildOrderSteps`), un même intitulé donnerait
  // l'impression d'une ligne dupliquée plutôt que de deux étapes.
  if (status === "paid" && isPayOnDeliveryMethod(paymentMethod)) return "Commande enregistrée";
  if (isDeliveryConfirmationStep(status, paymentMethod, history)) return "Commande confirmée";
  return ORDER_STATUS_LABELS[status];
}

export function stepDescription(
  status: OrderStatus,
  paymentMethod: PaymentMethod,
  history: OrderStatusEvent[],
): string {
  if (status === "paid" && isPayOnDeliveryMethod(paymentMethod)) {
    return `Commande enregistrée. Vous réglerez ${deliveryPaymentPhrase(paymentMethod)}.`;
  }
  if (isDeliveryConfirmationStep(status, paymentMethod, history)) {
    return `Commande confirmée, vos articles sont en cours d'impression et de préparation. Vous réglerez ${deliveryPaymentPhrase(paymentMethod)}.`;
  }
  return ORDER_STATUS_DESCRIPTIONS[status];
}

export interface OrderStep {
  status: OrderStatus;
  state: "done" | "current" | "upcoming";
  event?: OrderStatusEvent;
}

/**
 * Étapes à afficher : celles déjà franchies avec leur date, l'étape en cours,
 * et les suivantes en attente. L'historique brut ne répond qu'à « où en est ma
 * commande ? » ; ce parcours complet répond aussi à « et ensuite ? ».
 */
export function buildOrderSteps(
  status: OrderStatus,
  history: OrderStatusEvent[],
  paymentMethod: PaymentMethod = "stripe",
): OrderStep[] {
  // Première occurrence de chaque statut : c'est la date à laquelle l'étape a
  // été atteinte, même si le statut a ensuite été repositionné à la main.
  const reached = new Map<OrderStatus, OrderStatusEvent>();
  for (const event of history) {
    if (!reached.has(event.status)) reached.set(event.status, event);
  }

  // Une commande payable à la livraison n'a pas d'événement « paid » : elle
  // saute directement à « preparing », qui se produit au même instant que ce
  // que « paid » représenterait. Lui emprunter sa date évite une étape « faite »
  // affichée sans aucune date, ce qui se lirait comme une anomalie. La note,
  // elle, n'est pas reprise : elle appartient à l'étape qui l'a réellement
  // portée (« preparing ») — la dupliquer sur les deux lignes lirait comme une
  // erreur de copier-coller, pas comme deux étapes distinctes.
  if (isPayOnDeliveryMethod(paymentMethod) && !reached.has("paid") && reached.has("preparing")) {
    const preparingEvent = reached.get("preparing")!;
    reached.set("paid", { status: "paid", at: preparingEvent.at });
  }

  if (isStoppedStatus(status)) {
    const passed = ORDER_FLOW.filter((step) => reached.has(step)).map<OrderStep>(
      (step) => ({ status: step, state: "done", event: reached.get(step) }),
    );
    return [...passed, { status, state: "current", event: reached.get(status) }];
  }

  const currentIndex = ORDER_FLOW.indexOf(status);
  return ORDER_FLOW.map((step, index) => ({
    status: step,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
    event: reached.get(step),
  }));
}
