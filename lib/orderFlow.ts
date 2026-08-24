import type { OrderStatus, OrderStatusEvent } from "./types";

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
): OrderStep[] {
  // Première occurrence de chaque statut : c'est la date à laquelle l'étape a
  // été atteinte, même si le statut a ensuite été repositionné à la main.
  const reached = new Map<OrderStatus, OrderStatusEvent>();
  for (const event of history) {
    if (!reached.has(event.status)) reached.set(event.status, event);
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
