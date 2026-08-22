"use client";

import { useCart } from "./CartProvider";

export function AddToCartButton({
  productId,
  name,
  disabled,
  quantity = 1,
  available,
  className = "btn btn-primary",
  label = "Ajouter au panier",
}: {
  productId: string;
  name: string;
  disabled?: boolean;
  quantity?: number;
  /** Stock disponible pour ce produit : borne le total ajoutable, panier compris. */
  available?: number;
  className?: string;
  label?: string;
}) {
  const { add, items } = useCart();

  if (disabled) {
    return (
      <button type="button" className={className} disabled aria-disabled="true">
        Indisponible
      </button>
    );
  }

  const inCart = items.find((item) => item.productId === productId)?.quantity ?? 0;
  const atMax = available !== undefined && inCart >= available;

  if (atMax) {
    return (
      <button type="button" className={className} disabled aria-disabled="true">
        Stock atteint
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => add(productId, quantity, name, available)}
    >
      {label}
    </button>
  );
}
