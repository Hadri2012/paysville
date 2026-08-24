import {
  ORDER_STATUS_DESCRIPTIONS,
  buildOrderSteps,
  isStoppedStatus,
} from "@/lib/orderFlow";
import { ORDER_STATUS_LABELS, type OrderStatus, type OrderStatusEvent } from "@/lib/types";

/**
 * Progression visuelle d'une commande.
 *
 * Les étapes et leurs descriptions viennent de `lib/orderFlow.ts`, partagé avec
 * les e-mails de notification : le client lit exactement la même chose dans sa
 * boîte de réception et sur cette page.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
}

export function OrderTimeline({
  status,
  statusHistory,
}: {
  status: OrderStatus;
  statusHistory: OrderStatusEvent[];
}) {
  const steps = buildOrderSteps(status, statusHistory);
  const stopped = isStoppedStatus(status);

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
          <div className="small order-step-desc">
            {ORDER_STATUS_DESCRIPTIONS[step.status]}
          </div>
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
