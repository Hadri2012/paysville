"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "./apiClient";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  isPayOnDeliveryMethod,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/types";

export function OrderStatusEditor({
  orderId,
  status,
  adminNote,
  paymentMethod,
  paymentStatus,
}: {
  orderId: string;
  status: OrderStatus;
  adminNote: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}) {
  const router = useRouter();
  const [value, setValue] = useState<OrderStatus>(status);
  const [note, setNote] = useState(adminNote);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const save = async (payload: Record<string, unknown>, text: string) => {
    setBusy(true);
    setMessage(null);
    const result = await apiCall(`/api/admin/orders/${orderId}`, "PATCH", payload);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text });
    router.refresh();
  };

  return (
    <div className="stack">
      {message ? (
        <div
          className={`alert alert-${message.tone === "success" ? "success" : "error"}`}
          role="status"
        >
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="status">Statut de la commande</label>
        <select
          id="status"
          value={value}
          onChange={(event) => setValue(event.target.value as OrderStatus)}
        >
          {ORDER_STATUSES.map((option) => (
            <option key={option} value={option}>
              {ORDER_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <span className="hint">
          Passer une commande payée en « Annulée » ou « Remboursée » remet
          automatiquement les articles en stock.
        </span>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || value === status}
        onClick={() => save({ status: value }, "Statut mis à jour.")}
      >
        {busy ? "…" : "Mettre à jour le statut"}
      </button>

      {isPayOnDeliveryMethod(paymentMethod) &&
      paymentStatus === "pending" &&
      status !== "canceled" &&
      status !== "refunded" ? (
        <div className="field">
          <span className="hint" style={{ display: "block", marginBottom: 8 }}>
            {paymentMethod === "card_on_delivery"
              ? "Réglée par carte à la livraison, pas encore encaissée."
              : "Réglée en espèces, pas encore encaissée."}{" "}
            Passer la commande à « Livrée » l&apos;enregistre automatiquement ; utilisez ce
            bouton si le paiement est enregistré à un autre moment de la tournée.
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() =>
              save(
                { markDeliveryPaymentCollected: true },
                paymentMethod === "card_on_delivery"
                  ? "Paiement par carte enregistré."
                  : "Paiement en espèces enregistré.",
              )
            }
          >
            {paymentMethod === "card_on_delivery"
              ? "Marquer le paiement comme encaissé"
              : "Marquer les espèces comme encaissées"}
          </button>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="adminNote">Note interne (non visible par le client)</label>
        <textarea
          id="adminNote"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
        />
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy || note === adminNote}
        onClick={() => save({ adminNote: note }, "Note enregistrée.")}
      >
        Enregistrer la note
      </button>
    </div>
  );
}
