"use client";

import { useState } from "react";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

/**
 * Aperçu des e-mails envoyés aux clients.
 *
 * Le cadre affiche le gabarit réel (`/api/admin/email-preview`), pas une
 * imitation : ce qui est vu ici est exactement ce qui part. Un e-mail se
 * vérifie à l'œil — c'est le seul moyen de repérer une mise en page cassée
 * avant qu'un client ne la reçoive.
 */

const STEPS: { status: OrderStatus; when: string }[] = [
  { status: "paid", when: "Dès que le paiement est confirmé par Stripe." },
  { status: "preparing", when: "Quand vous passez la commande en préparation." },
  { status: "ready", when: "Quand la commande est emballée." },
  { status: "shipped", when: "Au départ du colis." },
  { status: "delivered", when: "À la remise du colis." },
  { status: "canceled", when: "Si vous annulez une commande déjà payée." },
  { status: "refunded", when: "Après un remboursement." },
];

export function EmailPreview({ configured }: { configured: boolean }) {
  const [status, setStatus] = useState<OrderStatus>("paid");
  const active = STEPS.find((step) => step.status === status);

  return (
    <div className="stack-lg">
      <div>
        <h1>E-mails aux clients</h1>
        <p className="muted">
          Chaque étape franchie déclenche un message, une seule fois. Voici ce que vos
          clients reçoivent.
        </p>
      </div>

      {configured ? (
        <div className="alert alert-success">
          <span>
            L&apos;envoi est actif : les messages partent réellement vers les clients.
          </span>
        </div>
      ) : (
        <div className="alert alert-warning">
          <span>
            Aucun service d&apos;envoi n&apos;est configuré : les messages sont écrits dans
            le journal du serveur au lieu d&apos;être envoyés. Renseignez{" "}
            <code>RESEND_API_KEY</code> et <code>EMAIL_FROM</code> pour les activer. La
            boutique fonctionne normalement entre-temps.
          </span>
        </div>
      )}

      <section className="card stack">
        <div>
          <h2 className="card-title" style={{ marginBottom: 4 }}>
            Étape à prévisualiser
          </h2>
          {active ? <p className="small muted" style={{ margin: 0 }}>{active.when}</p> : null}
        </div>

        <div className="btn-row">
          {STEPS.map((step) => (
            <button
              key={step.status}
              type="button"
              className={`btn btn-sm ${
                step.status === status ? "btn-primary" : "btn-secondary"
              }`}
              onClick={() => setStatus(step.status)}
            >
              {ORDER_STATUS_LABELS[step.status]}
            </button>
          ))}
        </div>
      </section>

      <section className="card card-flush">
        <iframe
          // La clé force le rechargement du cadre à chaque changement d'étape.
          key={status}
          src={`/api/admin/email-preview?statut=${status}`}
          title={`Aperçu de l'e-mail « ${ORDER_STATUS_LABELS[status]} »`}
          style={{
            width: "100%",
            height: 900,
            border: 0,
            display: "block",
            borderRadius: "var(--radius)",
          }}
        />
      </section>
    </div>
  );
}
