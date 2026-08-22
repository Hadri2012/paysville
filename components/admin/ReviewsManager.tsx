"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Stars } from "@/components/Stars";
import { apiCall } from "./apiClient";

export interface AdminReviewRow {
  id: string;
  productName: string;
  productSlug: string;
  author: string;
  rating: number;
  comment: string;
  flagged: boolean;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
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
              </div>
            </div>
            <span className={`badge ${review.flagged ? "badge-danger" : "badge-success"}`}>
              {review.flagged ? "Marqué comme spam" : "Publié"}
            </span>
          </div>

          <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{review.comment}</p>

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
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon-danger"
              disabled={busy === review.id}
              onClick={() => remove(review.id, review.author)}
            >
              🗑️ Supprimer
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
