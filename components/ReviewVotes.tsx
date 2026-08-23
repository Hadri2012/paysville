"use client";

import { useEffect, useState } from "react";

/**
 * Votes d'utilité sous un avis.
 *
 * Il n'y a pas de compte client sur la boutique : le navigateur retient les avis
 * déjà votés, ce qui suffit à ne pas reproposer le bouton à la même personne. Le
 * serveur borne la cadence de son côté. Un compteur indicatif ne demande pas
 * davantage — il aide à lire, il ne décide de rien.
 */

const STORAGE_KEY = "hadrishop.reviewVotes.v1";

type Ballot = Record<string, "yes" | "no">;

function readBallots(): Ballot {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Ballot;
  } catch {
    return {};
  }
}

function remember(reviewId: string, choice: "yes" | "no"): void {
  try {
    const ballots = readBallots();
    ballots[reviewId] = choice;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ballots));
  } catch {
    /* navigation privée ou stockage plein : le vote compte quand même côté serveur */
  }
}

export function ReviewVotes({
  reviewId,
  helpfulYes,
  helpfulNo,
}: {
  reviewId: string;
  helpfulYes: number;
  helpfulNo: number;
}) {
  const [counts, setCounts] = useState({ yes: helpfulYes, no: helpfulNo });
  const [voted, setVoted] = useState<"yes" | "no" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // `localStorage` n'existe pas au rendu serveur : lire avant le montage
    // produirait un rendu client différent (erreur d'hydratation React).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec un stockage externe
    setVoted(readBallots()[reviewId] ?? null);
  }, [reviewId]);

  const vote = async (choice: "yes" | "no") => {
    if (voted || busy) return;
    setBusy(true);
    // Affichage optimiste : le compteur bouge tout de suite, le serveur confirme.
    setVoted(choice);
    setCounts((current) => ({
      yes: current.yes + (choice === "yes" ? 1 : 0),
      no: current.no + (choice === "no" ? 1 : 0),
    }));
    remember(reviewId, choice);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful: choice === "yes" }),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data?.helpfulYes === "number" && typeof data?.helpfulNo === "number") {
          setCounts({ yes: data.helpfulYes, no: data.helpfulNo });
        }
      }
    } catch {
      /* le vote optimiste reste affiché : rien d'important ne dépend de ce compteur */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="review-votes">
      {counts.yes > 0 ? (
        <span className="small muted">
          {counts.yes} personne{counts.yes > 1 ? "s ont" : " a"} trouvé cet avis utile
          {counts.no > 0 ? `, ${counts.no} non` : ""}.
        </span>
      ) : (
        <span className="small muted">Cet avis vous a-t-il été utile ?</span>
      )}

      {voted ? (
        <span className="small muted">
          {voted === "yes" ? "Merci, votre vote est pris en compte." : "Merci pour votre retour."}
        </span>
      ) : (
        <span className="review-vote-buttons">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => vote("yes")}
          >
            👍 Utile
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => vote("no")}
          >
            👎 Pas utile
          </button>
        </span>
      )}
    </div>
  );
}
