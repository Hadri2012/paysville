import { ORDER_STATUS_LABELS, type OrderStatus, type OrderStatusEvent } from "@/lib/types";

/**
 * Progression visuelle d'une commande.
 *
 * L'historique brut ne contient que les étapes déjà franchies : il répond à « où en
 * est ma commande ? » mais pas à « et ensuite ? ». On affiche donc le parcours
 * complet — les étapes passées avec leur date, l'étape en cours mise en avant, les
 * suivantes en attente — pour que le client sache ce qu'il reste avant sa livraison.
 *
 * Une commande annulée ou remboursée quitte le parcours : on montre alors ce qui a
 * réellement eu lieu, puis l'étape finale, sans promettre une suite qui n'arrivera pas.
 */

/** Parcours normal d'une commande, dans l'ordre. */
const FLOW: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "preparing",
  "ready",
  "shipped",
  "delivered",
];

const DESCRIPTIONS: Record<OrderStatus, string> = {
  awaiting_payment: "Commande enregistrée, en attente de la confirmation du paiement.",
  paid: "Paiement reçu. Votre commande est confirmée.",
  preparing: "Vos articles sont en cours d'impression et de préparation.",
  ready: "Votre commande est emballée et prête à partir.",
  shipped: "Votre colis a quitté l'atelier.",
  delivered: "Votre colis vous a été remis. Merci de votre confiance.",
  canceled: "Cette commande a été annulée. Les articles sont retournés en stock.",
  refunded: "Cette commande a été remboursée.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
}

interface Step {
  status: OrderStatus;
  state: "done" | "current" | "upcoming";
  event?: OrderStatusEvent;
}

function buildSteps(status: OrderStatus, history: OrderStatusEvent[]): Step[] {
  // Première occurrence de chaque statut : c'est la date à laquelle l'étape a été
  // atteinte, même si le statut a ensuite été repositionné à la main.
  const reached = new Map<OrderStatus, OrderStatusEvent>();
  for (const event of history) {
    if (!reached.has(event.status)) reached.set(event.status, event);
  }

  if (status === "canceled" || status === "refunded") {
    const passed = FLOW.filter((step) => reached.has(step)).map<Step>((step) => ({
      status: step,
      state: "done",
      event: reached.get(step),
    }));
    return [...passed, { status, state: "current", event: reached.get(status) }];
  }

  const currentIndex = FLOW.indexOf(status);
  return FLOW.map((step, index) => ({
    status: step,
    state: index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming",
    event: reached.get(step),
  }));
}

export function OrderTimeline({
  status,
  statusHistory,
}: {
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];
}) {
  const steps = buildSteps(status, statusHistory);
  const stopped = status === "canceled" || status === "refunded";

  return (
    <ol className={`order-timeline${stopped ? " order-timeline-stopped" : ""}`}>
      {steps.map((step) => (
        <li key={step.status} className={`order-step is-${step.state}`}>
          <div className="order-step-label">
            <strong>{ORDER_STATUS_LABELS[step.status]}</strong>
            {step.state === "current" ? (
              <span className={`badge ${stopped ? "badge-danger" : "badge-info"}`}>
                {stopped ? "Commande arrêtée" : "Étape en cours"}
              </span>
            ) : null}
          </div>
          {step.event ? (
            <div className="small muted">{formatDate(step.event.at)}</div>
          ) : step.state === "upcoming" ? (
            <div className="small muted">À venir</div>
          ) : null}
          <div className="small order-step-desc">{DESCRIPTIONS[step.status]}</div>
          {/* La note porte le détail propre à cette commande (motif d'annulation,
              référence du paiement) : elle complète la description, sans la remplacer. */}
          {step.event?.note ? (
            <div className="small order-step-note">{step.event.note}</div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
