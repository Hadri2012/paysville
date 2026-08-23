import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ProductPurchase } from "@/components/ProductPurchase";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewList } from "@/components/ReviewList";
import { ReviewThemes } from "@/components/ReviewThemes";
import { RatingSummary } from "@/components/Stars";
import { suggestionsFor } from "@/lib/aiRecommendations";
import { formatPrice } from "@/lib/money";
import {
  approvedReviews,
  frequentThemes,
  publicReviewView,
  summarize,
} from "@/lib/reviews";
import { findProductByHandle, toPublicProduct } from "@/lib/shop";
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
  const reviews = approvedReviews(state, product.id);
  const rating = summarize(reviews);
  // Le nom du produit est écarté : il revient dans presque tous les avis et ne
  // distinguerait rien.
  const themes = frequentThemes(reviews, `${product.name} ${product.category}`);
  const suggestions = await suggestionsFor(state, product);

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
              <div className="product-title-row">
                <h1 style={{ marginTop: 6 }}>{product.name}</h1>
                <FavoriteButton
                  productId={product.id}
                  name={product.name}
                  className="fav-btn-inline"
                />
              </div>
              <RatingSummary average={rating.average} count={rating.count} />
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

        {suggestions.length > 0 ? (
          <section>
            <h2>Vous aimerez aussi</h2>
            <div className="product-grid">
              {suggestions.map(({ product: item, reason }) => (
                <article key={item.id} className="product-card">
                  <div className="product-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                    {!item.inStock ? (
                      <span className="badge badge-danger">Rupture de stock</span>
                    ) : null}
                    <FavoriteButton productId={item.id} name={item.name} />
                  </div>
                  <div className="product-body">
                    <span className="product-sku">{item.sku}</span>
                    <h3 className="product-name">
                      <Link href={`/produit/${item.slug}`}>{item.name}</Link>
                    </h3>
                    {reason ? <p className="suggestion-reason">{reason}</p> : null}
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

        <section className="review-section">
          <div className="page-head">
            <div>
              <h2 style={{ marginBottom: 4 }}>Avis clients</h2>
              <RatingSummary average={rating.average} count={rating.count} />
            </div>
          </div>

          <ReviewThemes themes={themes} total={reviews.length} />

          <div className="review-layout">
            <div>
              <ReviewList
                reviews={reviews.map(publicReviewView)}
                shopName={state.settings.shopName}
              />
            </div>
            <aside className="card">
              <h3 className="card-title">Donner mon avis</h3>
              <ReviewForm productId={product.id} />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
