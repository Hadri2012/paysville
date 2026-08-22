"use client";

import { useCart } from "./CartProvider";
import { useFavorites } from "./FavoritesProvider";

/**
 * Bouton cœur d'ajout/retrait de la liste de souhaits.
 *
 * Avant l'hydratation, on affiche délibérément l'état « non favori » : le serveur
 * ne peut pas connaître le contenu du `localStorage`, et rendre autre chose
 * provoquerait une erreur d'hydratation React.
 */
export function FavoriteButton({
  productId,
  name,
  className = "",
}: {
  productId: string;
  name: string;
  className?: string;
}) {
  const { has, toggle, hydrated } = useFavorites();
  const { notify } = useCart();

  const active = hydrated && has(productId);
  const label = active ? `Retirer « ${name} » des favoris` : `Ajouter « ${name} » aux favoris`;

  return (
    <button
      type="button"
      className={`fav-btn${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => {
        const nowFavorite = toggle(productId);
        notify(
          nowFavorite ? `« ${name} » ajouté aux favoris` : `« ${name} » retiré des favoris`,
        );
      }}
    >
      <span aria-hidden="true">{active ? "♥" : "♡"}</span>
    </button>
  );
}
