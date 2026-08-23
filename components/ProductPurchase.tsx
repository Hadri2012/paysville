"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "./CartProvider";

export interface PurchaseColorOption {
  id: string;
  name: string;
  hex: string;
}

export function ProductPurchase({
  productId,
  name,
  available,
  kind = "physical",
  colors = [],
  maxPerOrder = 20,
}: {
  productId: string;
  name: string;
  available: number;
  kind?: "physical" | "digital";
  /** Couleurs au choix, définies par la boutique. Vide = pas de sélecteur. */
  colors?: PurchaseColorOption[];
  maxPerOrder?: number;
}) {
  const { add, items } = useCart();
  const [selectedColorId, setSelectedColorId] = useState<string | null>(colors[0]?.id ?? null);
  const selectedColor = colors.find((color) => color.id === selectedColorId) ?? null;
  const inCart =
    items.find(
      (item) => item.productId === productId && (item.colorId ?? null) === selectedColorId,
    )?.quantity ?? 0;
  // Ce qui est déjà dans le panier compte dans la limite : sinon on pourrait la
  // dépasser en ajoutant plusieurs fois depuis la fiche produit.
  const max = Math.max(0, Math.min(available, maxPerOrder) - inCart);
  const digital = kind === "digital";

  // Défaut corrigé : la quantité que l'utilisateur a choisie (`wantedQuantity`)
  // et celle réellement affichée/ajoutable (`quantity`) sont deux choses
  // distinctes — la seconde est systématiquement recalée sur `max` à chaque
  // rendu, plutôt que corrigée après coup par un effet. Avant ce changement,
  // choisir une grande quantité puis en ajouter une partie au panier (ce qui
  // réduit `max`) laissait le curseur affiché sur son ancienne valeur, prêt à
  // dépasser silencieusement ce qu'il restait à ajouter.
  const [wantedQuantity, setWantedQuantity] = useState(1);
  const quantity = Math.min(Math.max(wantedQuantity, 1), Math.max(max, 1));

  // Une couleur différente repart sur une quantité de 1 : le nombre choisi
  // pour l'une n'a pas de raison de rester pour l'autre. Fait dans le même
  // geste que le changement de couleur, pas après coup.
  const selectColor = (id: string) => {
    setSelectedColorId(id);
    setWantedQuantity(1);
  };

  if (max === 0) {
    return (
      <div className="stack">
        <div className="alert alert-error" role="status">
          {inCart > 0
            ? digital
              ? "Ce fichier est déjà dans votre panier : un seul exemplaire suffit."
              : "Vous avez déjà tout le stock disponible de ce produit dans votre panier."
            : digital
              ? "Ce fichier n'est pas encore disponible au téléchargement."
              : "Ce produit est actuellement en rupture de stock et ne peut pas être commandé."}
        </div>
        <Link href={inCart > 0 ? "/panier" : "/boutique"} className="btn btn-secondary">
          {inCart > 0 ? "Voir le panier" : "Voir les autres produits"}
        </Link>
      </div>
    );
  }

  // Un fichier s'achète une fois : pas de sélecteur de quantité à proposer.
  if (digital) {
    return (
      <div className="stack">
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => add(productId, 1, name, available)}
          >
            Ajouter au panier
          </button>
          <Link href="/panier" className="btn btn-secondary btn-lg">
            Voir le panier
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      {colors.length > 0 ? (
        <div className="field">
          <span className="field-label">
            Couleur{selectedColor ? ` : ${selectedColor.name}` : ""}
          </span>
          <div className="color-swatches" role="radiogroup" aria-label="Choisir une couleur">
            {colors.map((color) => (
              <button
                key={color.id}
                type="button"
                role="radio"
                aria-checked={color.id === selectedColorId}
                aria-label={color.name}
                title={color.name}
                className={`color-swatch${color.id === selectedColorId ? " selected" : ""}`}
                style={{ backgroundColor: color.hex }}
                onClick={() => selectColor(color.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="field" style={{ maxWidth: 200 }}>
        <label htmlFor="quantity">Quantité</label>
        <div className="qty">
          <button
            type="button"
            onClick={() => setWantedQuantity((value) => Math.max(1, value - 1))}
            disabled={quantity <= 1}
            aria-label="Diminuer la quantité"
          >
            −
          </button>
          <span className="value" id="quantity" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setWantedQuantity((value) => Math.min(max, value + 1))}
            disabled={quantity >= max}
            aria-label="Augmenter la quantité"
          >
            +
          </button>
        </div>
        <span className="hint">
          {max} exemplaire{max > 1 ? "s" : ""} disponible{max > 1 ? "s" : ""}
        </span>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => add(productId, quantity, name, available, selectedColorId)}
        >
          Ajouter au panier
        </button>
        <Link href="/panier" className="btn btn-secondary btn-lg">
          Voir le panier
        </Link>
      </div>
    </div>
  );
}
