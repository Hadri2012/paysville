"use client";

import { useCart } from "./CartProvider";

export function AddToCartButton({
  productId,
  name,
  disabled,
  quantity = 1,
  className = "btn btn-primary",
  label = "Ajouter au panier",
}: {
  productId: string;
  name: string;
  disabled?: boolean;
  quantity?: number;
  className?: string;
  label?: string;
}) {
  const { add } = useCart();

  if (disabled) {
    return (
      <button type="button" className={className} disabled aria-disabled="true">
        Indisponible
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => add(productId, quantity, name)}
    >
      {label}
    </button>
  );
}
