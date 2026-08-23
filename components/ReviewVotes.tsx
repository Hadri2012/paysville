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
const REPORTED_KEY = "hadrishop.reviewReports.v1";

function readMap<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, T>;
  } catch {
    return {};
  }
}

function remember<T>(key: string, reviewId: string, value: T): void {
  try {
    const stored = readMap<T>(key);
    stored[reviewId] = value;
    window.localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    /* navigation privée ou stockage plein : l'action compte quand même côté serveur */
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
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // `localStorage` n'existe pas au rendu serveur : lire avant le montage
    // produirait un rendu client différent (erreur d'hydratation React).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec un stockage externe
    setVoted(readMap<"yes" | "no">(STORAGE_KEY)[reviewId] ?? null);
    setReported(Boolean(readMap<boolean>(REPORTED_KEY)[reviewId]));
  }, [reviewId]);

  const report = async () => {
    if (reported || busy) return;
    if (
      !window.confirm(
        "Signaler cet avis à la boutique ? Elle le relira et décidera de la suite.",
      )
    ) {
      return;
    }
    setBusy(true);
    setReported(true);
    remember(REPORTED_KEY, reviewId, true);
    try {
      await fetch(`/api/reviews/${reviewId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* le signalement est un geste ponctuel : pas de reprise automatique */
    } finally {
      setBusy(false);
    }
  };

  const vote = async (choice: "yes" | "no") => {
    if (voted || busy) return;
    setBusy(true);
    // Affichage optimiste : le compteur bouge tout de suite, le serveur confirme.
    setVoted(choice);
    setCounts((current) => ({
      yes: current.yes + (choice === "yes" ? 1 : 0),
      no: current.no + (choice === "no" ? 1 : 0),
    }));
    remember(STORAGE_KEY, reviewId, choice);
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

      <span className="review-vote-buttons">
        {voted ? (
          <span className="small muted">
            {voted === "yes"
              ? "Merci, votre vote est pris en compte."
              : "Merci pour votre retour."}
          </span>
        ) : (
          <>
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
          </>
        )}

        {reported ? (
          <span className="small muted">Avis signalé à la boutique.</span>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm review-report"
            disabled={busy}
            onClick={() => void report()}
            title="Signaler un avis inapproprié"
          >
            Signaler
          </button>
        )}
      </span>
    </div>
  );
}
