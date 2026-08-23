"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Stars } from "@/components/Stars";
import { MAX_REPLY_LENGTH } from "@/lib/types";
import { apiCall } from "./apiClient";

export interface AdminReviewRow {
  id: string;
  productName: string;
  productSlug: string;
  author: string;
  rating: number;
  comment: string;
  flagged: boolean;
  verified: boolean;
  reply: { text: string; at: string } | null;
  helpfulYes: number;
  helpfulNo: number;
  photos: string[];
  reports: number;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
}

/**
 * Réponse publique de la boutique sous un avis. Le brouillon est local au composant :
 * tant qu'il n'est pas enregistré, rien n'est envoyé — et « Retirer » remet l'avis
 * sans réponse plutôt que d'enregistrer un texte vide.
 */
function ReplyEditor({
  review,
  busy,
  onSave,
}: {
  review: AdminReviewRow;
  busy: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(review.reply?.text ?? "");
  const [open, setOpen] = useState(Boolean(review.reply));

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        💬 Répondre
      </button>
    );
  }

  const unchanged = draft.trim() === (review.reply?.text ?? "");

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <div className="field">
        <label htmlFor={`reply-${review.id}`}>
          Réponse publique {review.reply ? `(publiée le ${formatDate(review.reply.at)})` : ""}
        </label>
        <textarea
          id={`reply-${review.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_REPLY_LENGTH}
          rows={3}
          placeholder="Merci pour votre retour…"
        />
        <span className="hint">
          Visible par tout le monde sous l&apos;avis. {MAX_REPLY_LENGTH} caractères
          maximum.
        </span>
      </div>
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy || unchanged || draft.trim().length === 0}
          onClick={() => onSave(draft.trim())}
        >
          Enregistrer la réponse
        </button>
        {review.reply ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon-danger"
            disabled={busy}
            onClick={() => {
              setDraft("");
              onSave("");
            }}
          >
            Retirer la réponse
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              setDraft("");
              setOpen(false);
            }}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}

export function ReviewsManager({ reviews }: { reviews: AdminReviewRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(id);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setError(result.message ?? "Opération impossible.");
      return;
    }
    router.refresh();
  };

  const setFlagged = (id: string, flagged: boolean) =>
    run(id, () => apiCall(`/api/admin/reviews/${id}`, "PATCH", { flagged }));

  const setReply = (id: string, reply: string) =>
    run(id, () => apiCall(`/api/admin/reviews/${id}`, "PATCH", { reply }));

  const clearReports = (id: string) =>
    run(id, () => apiCall(`/api/admin/reviews/${id}`, "PATCH", { clearReports: true }));

  const removePhotos = (id: string) => {
    if (!window.confirm("Retirer les photos de cet avis ? Le texte est conservé.")) return;
    return run(id, () => apiCall(`/api/admin/reviews/${id}`, "PATCH", { removePhotos: true }));
  };

  const remove = (id: string, author: string) => {
    if (
      !window.confirm(
        `Supprimer définitivement l'avis de ${author} ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    return run(id, () => apiCall(`/api/admin/reviews/${id}`, "DELETE"));
  };

  if (reviews.length === 0) {
    return <div className="empty-state">Aucun avis pour le moment.</div>;
  }

  return (
    <div className="stack">
      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {reviews.map((review) => (
        <article key={review.id} className="card admin-review">
          <div className="admin-review-head">
            <div>
              <strong>{review.author}</strong> ·{" "}
              <a href={`/produit/${review.productSlug}`} target="_blank" rel="noreferrer">
                {review.productName}
              </a>
              <div className="small muted">
                <Stars value={review.rating} size="0.85rem" /> {review.rating}/5 ·{" "}
                {formatDate(review.createdAt)}
                {review.helpfulYes + review.helpfulNo > 0
                  ? ` · ${review.helpfulYes} utile / ${review.helpfulNo} pas utile`
                  : null}
              </div>
            </div>
            <div className="btn-row">
              {review.reports > 0 ? (
                <span className="badge badge-danger">
                  {review.reports} signalement{review.reports > 1 ? "s" : ""}
                </span>
              ) : null}
              {review.verified ? (
                <span className="badge badge-info">✓ Achat vérifié</span>
              ) : null}
              <span className={`badge ${review.flagged ? "badge-danger" : "badge-success"}`}>
                {review.flagged ? "Marqué comme spam" : "Publié"}
              </span>
            </div>
          </div>

          <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{review.comment}</p>

          {review.photos.length > 0 ? (
            <ul className="review-photos">
              {review.photos.map((photo, index) => (
                <li key={photo.slice(-24) + index}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={`Photo ${index + 1} de ${review.author}`} />
                </li>
              ))}
            </ul>
          ) : null}

          <div className="btn-row">
            {review.flagged ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === review.id}
                onClick={() => setFlagged(review.id, false)}
              >
                Débloquer
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === review.id}
                onClick={() => setFlagged(review.id, true)}
              >
                Marquer comme spam
              </button>
            )}
            {review.reports > 0 ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy === review.id}
                onClick={() => clearReports(review.id)}
              >
                Signalements traités
              </button>
            ) : null}
            {review.photos.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon-danger"
                disabled={busy === review.id}
                onClick={() => removePhotos(review.id)}
              >
                Retirer les photos
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon-danger"
              disabled={busy === review.id}
              onClick={() => remove(review.id, review.author)}
            >
              🗑️ Supprimer
            </button>
          </div>

          <ReplyEditor
            review={review}
            busy={busy === review.id}
            onSave={(text) => setReply(review.id, text)}
          />
        </article>
      ))}
    </div>
  );
}
