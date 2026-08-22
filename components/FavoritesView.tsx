"use client";

import Link from "next/link";
import type { ReviewSummary } from "@/lib/reviews";
import type { PublicProduct } from "@/lib/shop";
import { useFavorites } from "./FavoritesProvider";
import { ProductCard } from "./ProductCard";

export function FavoritesView({
  products,
  currency,
  lowStockThreshold,
  ratings,
}: {
  products: PublicProduct[];
  currency: string;
  lowStockThreshold: number;
  ratings: Record<string, ReviewSummary>;
}) {
  const { ids, hydrated, clear, count } = useFavorites();

  // L'ordre suit celui de la liste de souhaits (le plus récemment ajouté d'abord),
  // pas celui du catalogue.
  const byId = new Map(products.map((product) => [product.id, product]));
  const favorites = ids
    .map((id) => byId.get(id))
    .filter((product): product is PublicProduct => Boolean(product));

  if (!hydrated) {
    return (
      <main className="page">
        <div className="container">
          <h1>Mes favoris</h1>
          <div className="skeleton" style={{ height: 220 }} />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="page-head">
          <div>
            <h1>Mes favoris</h1>
            <p>
              {count === 0
                ? "Votre liste est vide."
                : `${count} produit${count > 1 ? "s" : ""} mis de côté. Cette liste est enregistrée dans ce navigateur.`}
            </p>
          </div>
          {count > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              Tout retirer
            </button>
          ) : null}
        </div>

        {favorites.length === 0 ? (
          <div className="empty-state">
            <h2>Aucun favori pour l&apos;instant</h2>
            <p>
              Cliquez sur le cœur d&apos;un produit pour le retrouver ici plus tard.
            </p>
            <Link href="/boutique" className="btn btn-primary" style={{ marginTop: 14 }}>
              Parcourir la boutique
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {favorites.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={currency}
                lowStockThreshold={lowStockThreshold}
                rating={ratings[product.id]}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
