import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPurchase } from "@/components/ProductPurchase";
import { formatPrice } from "@/lib/money";
import { findProductByHandle, listPublicProducts, toPublicProduct } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const state = await readState();
  const product = findProductByHandle(state, slug);
  if (!product || !product.active || product.archived) {
    return { title: "Produit introuvable" };
  }
  return {
    title: product.name,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const state = await readState();
  const found = findProductByHandle(state, slug);
  if (!found || !found.active || found.archived) notFound();

  const product = toPublicProduct(state, found);
  const related = listPublicProducts(state)
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 4);

  return (
    <main className="page">
      <div className="container stack-lg">
        <nav className="breadcrumb" aria-label="Fil d'Ariane">
          <Link href="/">Accueil</Link> · <Link href="/boutique">Boutique</Link> ·{" "}
          <span>{product.name}</span>
        </nav>

        <div className="product-detail">
          <div className="product-detail-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imageUrl} alt={product.name} width={900} height={900} />
          </div>

          <div className="stack">
            <div>
              <span className="product-sku">Référence {product.sku}</span>
              <h1 style={{ marginTop: 6 }}>{product.name}</h1>
              <div className="price-tag">
                {formatPrice(product.priceCents, state.settings.currency)}
              </div>
            </div>

            <div>
              {product.inStock ? (
                <span className="badge badge-success badge-dot">
                  En stock — {product.available} disponible
                  {product.available > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="badge badge-danger badge-dot">Rupture de stock</span>
              )}
              {product.category ? (
                <span className="badge badge-info" style={{ marginLeft: 8 }}>
                  {product.category}
                </span>
              ) : null}
            </div>

            {product.description ? (
              <p style={{ color: "var(--ink-2)" }}>{product.description}</p>
            ) : null}

            <ProductPurchase
              productId={product.id}
              name={product.name}
              available={product.available}
            />

            <div className="panel small">
              <strong>Bon à savoir :</strong> le stock et le prix sont revérifiés par
              notre serveur au moment du paiement. Vous ne payez jamais un montant
              différent de celui affiché ici.
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <section>
            <h2>Dans la même catégorie</h2>
            <div className="product-grid">
              {related.map((item) => (
                <article key={item.id} className="product-card">
                  <div className="product-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                    {!item.inStock ? (
                      <span className="badge badge-danger">Rupture de stock</span>
                    ) : null}
                  </div>
                  <div className="product-body">
                    <span className="product-sku">{item.sku}</span>
                    <h3 className="product-name">
                      <Link href={`/produit/${item.slug}`}>{item.name}</Link>
                    </h3>
                    <div className="product-price">
                      {formatPrice(item.priceCents, state.settings.currency)}
                    </div>
                    <div className="product-actions" style={{ gridTemplateColumns: "1fr" }}>
                      <Link
                        href={`/produit/${item.slug}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Voir le produit
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
