import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { listPublicProducts } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Boutique",
  description:
    "Tous les objets disponibles chez Hadrishop : rangements, supports, porte-clés et accessoires imprimés en 3D.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string }>;
}) {
  const { categorie } = await searchParams;
  const state = await readState();
  const products = listPublicProducts(state);

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "fr"),
  );
  const selected = categorie && categories.includes(categorie) ? categorie : null;
  const visible = selected ? products.filter((p) => p.category === selected) : products;

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="page-head">
          <div>
            <h1>Boutique Hadrishop</h1>
            <p>
              {products.length} produit{products.length > 1 ? "s" : ""} au catalogue.
              Les quantités affichées sont les stocks réellement disponibles.
            </p>
          </div>
        </div>

        {categories.length > 0 ? (
          <nav className="btn-row" aria-label="Filtrer par catégorie">
            <Link
              href="/boutique"
              className={`btn btn-sm ${selected ? "btn-secondary" : "btn-primary"}`}
            >
              Tout
            </Link>
            {categories.map((category) => (
              <Link
                key={category}
                href={`/boutique?categorie=${encodeURIComponent(category)}`}
                className={`btn btn-sm ${
                  selected === category ? "btn-primary" : "btn-secondary"
                }`}
              >
                {category}
              </Link>
            ))}
          </nav>
        ) : null}

        {visible.length === 0 ? (
          <div className="empty-state">
            <h2>Aucun produit dans cette catégorie</h2>
            <p>Revenez bientôt, le catalogue évolue régulièrement.</p>
            <Link href="/boutique" className="btn btn-secondary" style={{ marginTop: 12 }}>
              Voir tout le catalogue
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={state.settings.currency}
                lowStockThreshold={state.settings.lowStockThreshold}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
