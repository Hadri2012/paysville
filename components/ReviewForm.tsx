"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReviewPhotoPicker } from "./ReviewPhotoPicker";

/**
 * Formulaire de dépôt d'avis. L'avis est publié immédiatement, sauf si le filtre
 * automatique le retient — auquel cas le message le dit, puisque l'auteur ne le
 * retrouverait pas dans la liste.
 *
 * L'e-mail est facultatif : il ne sert qu'à retrouver une commande payée portant ce
 * produit, pour afficher la mention « achat vérifié ». Le serveur ne l'enregistre pas.
 */
export function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [author, setAuthor] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, author, email, rating, comment, photos }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({
          tone: "error",
          text: data?.error?.message ?? "Votre avis n'a pas pu être envoyé.",
        });
        return;
      }
      setMessage({
        tone: "success",
        text: data.message ?? "Merci ! Votre avis a bien été enregistré.",
      });
      setAuthor("");
      setEmail("");
      setComment("");
      setPhotos([]);
      setRating(5);
      // Publié immédiatement : la liste au-dessus doit le montrer sans rechargement.
      if (!data.pending) router.refresh();
    } catch {
      setMessage({
        tone: "error",
        text: "Connexion au serveur impossible. Réessayez dans un instant.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      {message ? (
        <div className={`alert alert-${message.tone}`} role="status">
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="review-author">Votre prénom</label>
        <input
          id="review-author"
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          maxLength={60}
          required
          autoComplete="given-name"
        />
      </div>

      <div className="field">
        <label htmlFor="review-email">Adresse e-mail de votre commande</label>
        <input
          id="review-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={160}
          autoComplete="email"
          placeholder="facultatif"
        />
        <span className="hint">
          Si une commande payée à cette adresse contient ce produit, votre avis
          portera la mention « achat vérifié ». L&apos;adresse n&apos;est ni affichée
          ni conservée.
        </span>
      </div>

      <fieldset className="field rating-picker">
        <legend>Votre note</legend>
        <div className="rating-choices">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={rating >= value ? "chosen" : undefined}>
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
              />
              <span aria-hidden="true">★</span>
              <span className="sr-only">
                {value} étoile{value > 1 ? "s" : ""}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="review-comment">Votre avis</label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1500}
          minLength={10}
          required
          rows={4}
          placeholder="Qu'avez-vous pensé de ce produit ?"
        />
        <span className="hint">Au moins 10 caractères.</span>
      </div>

      <ReviewPhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Envoi…" : "Publier mon avis"}
      </button>
      <p className="small muted" style={{ margin: 0 }}>
        Votre avis est publié immédiatement. Merci de rester correct : les propos
        injurieux sont filtrés automatiquement.
      </p>
    </form>
  );
}
