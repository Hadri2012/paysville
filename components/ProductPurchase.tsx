"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "./CartProvider";

export function ProductPurchase({
  productId,
  name,
  available,
  maxPerOrder = 20,
}: {
  productId: string;
  name: string;
  available: number;
  maxPerOrder?: number;
}) {
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const max = Math.max(0, Math.min(available, maxPerOrder));

  if (max === 0) {
    return (
      <div className="stack">
        <div className="alert alert-error" role="status">
          Ce produit est actuellement en rupture de stock et ne peut pas être commandé.
        </div>
        <Link href="/boutique" className="btn btn-secondary">
          Voir les autres produits
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: 200 }}>
        <label htmlFor="quantity">Quantité</label>
        <div className="qty">
          <button
            type="button"
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
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
            onClick={() => setQuantity((value) => Math.min(max, value + 1))}
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
          onClick={() => add(productId, quantity, name)}
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
