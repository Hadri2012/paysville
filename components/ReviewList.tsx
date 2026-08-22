import type { PublicReview } from "@/lib/reviews";
import { Stars } from "./Stars";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    dateStyle: "long",
    timeZone: "Europe/Brussels",
  });
}

export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) {
    return (
      <p className="muted">
        Aucun avis pour le moment. Soyez la première personne à donner le vôtre.
      </p>
    );
  }

  return (
    <ul className="review-list">
      {reviews.map((review) => (
        <li key={review.id} className="review">
          <div className="review-head">
            <strong>{review.author}</strong>
            <Stars value={review.rating} size="0.9rem" />
            <span className="small muted">{formatDate(review.createdAt)}</span>
            <span className="sr-only">{review.rating} sur 5</span>
          </div>
          <p className="review-body">{review.comment}</p>
        </li>
      ))}
    </ul>
  );
}
