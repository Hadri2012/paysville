/**
 * Note en étoiles. Purement visuel : l'information chiffrée est toujours donnée en
 * texte à côté (« 4,3 sur 5 »), pour rester lisible aux lecteurs d'écran comme aux
 * navigateurs qui ne rendraient pas les symboles.
 */
export function Stars({ value, size = "1rem" }: { value: number; size?: string }) {
  const rounded = Math.round(value);
  return (
    <span className="stars" style={{ fontSize: size }} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((step) => (
        <span key={step} className={step <= rounded ? "star-on" : "star-off"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Moyenne + nombre d'avis, avec l'équivalent textuel accessible. */
export function RatingSummary({
  average,
  count,
  size,
}: {
  average: number | null;
  count: number;
  size?: string;
}) {
  if (average === null || count === 0) return null;
  return (
    <span className="rating-summary">
      <Stars value={average} size={size} />
      <span className="small muted">
        {average.toFixed(1).replace(".", ",")} sur 5 ({count} avis)
      </span>
    </span>
  );
}
