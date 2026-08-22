"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "./apiClient";

export function DeleteOrderButton({
  orderId,
  orderNumber,
  redirectTo,
  label,
}: {
  orderId: string;
  orderNumber: string;
  /** Après suppression réussie : où renvoyer l'admin (ex. depuis la page détail). */
  redirectTo?: string;
  /** Texte affiché à côté de l'icône (omis dans la liste, pour rester compact). */
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    const confirmed = window.confirm(
      `Supprimer définitivement la commande ${orderNumber} ?\n\nCette action est irréversible : toutes ses informations (client, adresse, articles, historique, paiement) disparaîtront complètement. Si elle était payée et pas déjà annulée, le stock correspondant sera remis en rayon.`,
    );
    if (!confirmed) return;

    setBusy(true);
    const result = await apiCall(`/api/admin/orders/${orderId}`, "DELETE");
    setBusy(false);

    if (!result.ok) {
      window.alert(result.message);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  };

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm btn-icon-danger${label ? "" : " btn-icon"}`}
      disabled={busy}
      onClick={onClick}
      title={`Supprimer la commande ${orderNumber}`}
      aria-label={label ? undefined : `Supprimer la commande ${orderNumber}`}
    >
      🗑️{label ? ` ${busy ? "Suppression…" : label}` : null}
    </button>
  );
}
