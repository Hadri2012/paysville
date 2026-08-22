import Link from "next/link";
import { formatPrice } from "@/lib/money";
import type { PublicProduct } from "@/lib/shop";
import { AddToCartButton } from "./AddToCartButton";

export function ProductCard({
  product,
  currency,
  lowStockThreshold,
}: {
  product: PublicProduct;
  currency: string;
  lowStockThreshold: number;
}) {
  const low = product.inStock && product.available <= lowStockThreshold;

  return (
    <article className="product-card">
      <div className="product-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          width={600}
          height={600}
        />
        {!product.inStock ? (
          <span className="badge badge-danger">Rupture de stock</span>
        ) : low ? (
          <span className="badge badge-warning">
            Plus que {product.available} en stock
          </span>
        ) : null}
      </div>

      <div className="product-body">
        <span className="product-sku">{product.sku}</span>
        <h3 className="product-name">
          <Link href={`/produit/${product.slug}`}>{product.name}</Link>
        </h3>
        {product.description ? (
          <p className="product-desc">{product.description}</p>
        ) : null}
        <div className="product-price">{formatPrice(product.priceCents, currency)}</div>
        <div className="product-actions">
          <Link href={`/produit/${product.slug}`} className="btn btn-secondary btn-sm">
            Voir le produit
          </Link>
          <AddToCartButton
            productId={product.id}
            name={product.name}
            disabled={!product.inStock}
            className="btn btn-primary btn-sm"
            label="Ajouter"
          />
        </div>
      </div>
    </article>
  );
}
