import type { ReviewTheme } from "@/lib/reviews";

/**
 * Points le plus souvent cités dans les avis d'un produit.
 *
 * Le comptage est brut, et l'affichage le dit : ce sont les mots qui reviennent, pas
 * un jugement de la boutique. On indique donc pour chacun le nombre d'avis qui
 * l'emploient, pour que le lecteur pèse lui-même — « finition » dans 8 avis sur 10
 * n'a pas le même poids que dans 2 sur 12.
 */
export function ReviewThemes({ themes, total }: { themes: ReviewTheme[]; total: number }) {
  if (themes.length === 0) return null;

  return (
    <div className="review-themes">
      <span className="small muted">Le plus souvent cité dans les {total} avis :</span>
      <ul>
        {themes.map((theme) => (
          <li key={theme.label}>
            <span className="review-theme-word">{theme.label}</span>
            <span className="review-theme-count">{theme.reviews}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
