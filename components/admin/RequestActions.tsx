"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "./apiClient";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/types";

interface Props {
  requestId: string;
  requestNumber: string;
  status: RequestStatus;
  adminComment: string;
  internalNote: string;
}

export function RequestActions({ requestId, requestNumber, status, adminComment, internalNote }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [comment, setComment] = useState(adminComment);
  const [note, setNote] = useState(internalNote);
  const [statusValue, setStatusValue] = useState<RequestStatus>(status);

  const run = async (payload: Record<string, unknown>, successText: string) => {
    setBusy(true);
    setMessage(null);
    const result = await apiCall(`/api/admin/requests/${requestId}`, "PATCH", payload);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: successText });
    router.refresh();
  };

  const accept = () => run({ action: "accept" }, "Demande acceptée.");
  const refuse = () => run({ action: "refuse" }, "Demande refusée.");
  const cancel = () => {
    if (!window.confirm(`Annuler la location ${requestNumber} ? La période sera libérée.`)) return;
    run({ action: "cancel" }, "Location annulée.");
  };

  const del = async () => {
    const confirmed = window.confirm(
      `Supprimer définitivement la demande ${requestNumber} ?\n\nCette action est irréversible.`,
    );
    if (!confirmed) return;
    setBusy(true);
    const result = await apiCall(`/api/admin/requests/${requestId}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    router.push("/admin/demandes");
    router.refresh();
  };

  return (
    <div className="stack">
      {message ? (
        <div className={`alert alert-${message.tone === "success" ? "success" : "error"}`} role="status">
          <span>{message.text}</span>
        </div>
      ) : null}

      {status === "pending" ? (
        <div className="btn-row">
          <button type="button" className="btn btn-success btn-lg" disabled={busy} onClick={accept}>
            ✓ Accepter
          </button>
          <button type="button" className="btn btn-danger btn-lg" disabled={busy} onClick={refuse}>
            ✕ Refuser
          </button>
        </div>
      ) : null}

      {status === "accepted" ? (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={cancel}>
          Annuler cette location
        </button>
      ) : null}

      <div className="field">
        <label htmlFor="adminComment">Commentaire (visible par le client)</label>
        <textarea
          id="adminComment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || comment === adminComment}
        onClick={() => run({ adminComment: comment }, "Commentaire enregistré.")}
      >
        Enregistrer le commentaire
      </button>

      <div className="field">
        <label htmlFor="internalNote">Note interne (non visible par le client)</label>
        <textarea
          id="internalNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || note === internalNote}
        onClick={() => run({ internalNote: note }, "Note enregistrée.")}
      >
        Enregistrer la note
      </button>

      <div className="field">
        <label htmlFor="status">Modifier le statut manuellement</label>
        <select
          id="status"
          value={statusValue}
          onChange={(e) => setStatusValue(e.target.value as RequestStatus)}
        >
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REQUEST_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="hint">
          Repasser une demande à « Acceptée » revérifie automatiquement la disponibilité du
          vélo.
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy || statusValue === status}
        onClick={() => run({ status: statusValue }, "Statut mis à jour.")}
      >
        Mettre à jour le statut
      </button>

      <hr />
      <div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Supprime la demande entièrement, sans laisser de trace.
        </p>
        <button type="button" className="btn btn-ghost btn-icon-danger" disabled={busy} onClick={del}>
          🗑️ Supprimer la demande
        </button>
      </div>
    </div>
  );
}
