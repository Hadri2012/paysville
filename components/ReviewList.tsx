import type { PublicReview } from "@/lib/reviews";
import { ReviewVotes } from "./ReviewVotes";
import { Stars } from "./Stars";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    dateStyle: "long",
    timeZone: "Europe/Brussels",
  });
}

export function ReviewList({
  reviews,
  shopName,
}: {
  reviews: PublicReview[];
  shopName: string;
}) {
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
            <span className="sr-only">{review.rating} sur 5</span>
            {review.verified ? (
              <span
                className="badge badge-success"
                title="Une commande payée contenant ce produit a été passée avec l'adresse e-mail de l'auteur."
              >
                ✓ Achat vérifié
              </span>
            ) : null}
            <span className="small muted">{formatDate(review.createdAt)}</span>
          </div>

          <p className="review-body">{review.comment}</p>

          {review.reply ? (
            <div className="review-reply">
              <div className="small">
                <strong>Réponse de {shopName}</strong>{" "}
                <span className="muted">· {formatDate(review.reply.at)}</span>
              </div>
              <p className="review-body">{review.reply.text}</p>
            </div>
          ) : null}

          <ReviewVotes
            reviewId={review.id}
            helpfulYes={review.helpfulYes}
            helpfulNo={review.helpfulNo}
          />
        </li>
      ))}
    </ul>
  );
}
