"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { readStoredPromo, storePromo } from "@/lib/clientPromo";
import { formatPrice } from "@/lib/money";
import type { Quote } from "@/lib/shop";

export default function CartPage() {
  const { items, setQuantity, remove, hydrated, notify } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const stored = readStoredPromo();
    setPromoCode(stored);
    setPromoInput(stored);
  }, []);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, promoCode }),
      });
      const data = await response.json();
      if (id !== requestId.current) return;
      if (!response.ok) {
        setError(data?.error?.message ?? "Impossible de recalculer le panier.");
        return;
      }
      setQuote(data.quote as Quote);
    } catch {
      if (id === requestId.current) {
        setError(
          "Connexion au serveur impossible. Vérifiez votre connexion internet puis réessayez.",
        );
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [items, promoCode]);

  useEffect(() => {
    if (!hydrated) return;
    if (items.length === 0) {
      setQuote(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [hydrated, items, promoCode, refresh]);

  // Le serveur fait autorité : on aligne le panier local sur ses corrections.
  useEffect(() => {
    if (!quote || quote.issues.length === 0) return;
    for (const issue of quote.issues) {
      const current = items.find((item) => item.productId === issue.productId);
      if (!current) continue;
      if (issue.quantity <= 0) remove(issue.productId);
      else if (current.quantity !== issue.quantity) {
        setQuantity(issue.productId, issue.quantity);
      }
    }
  }, [quote, items, remove, setQuantity]);

  const applyPromo = (event: React.FormEvent) => {
    event.preventDefault();
    const code = promoInput.trim().toUpperCase();
    setPromoCode(code);
    storePromo(code);
    if (!code) notify("Code promotionnel retiré");
  };

  const clearPromo = () => {
    setPromoInput("");
    setPromoCode("");
    storePromo("");
  };

  if (!hydrated) {
    return (
      <main className="page">
        <div className="container">
          <h1>Mon panier</h1>
          <div className="skeleton" style={{ height: 220 }} />
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="page">
        <div className="container">
          <h1>Mon panier</h1>
          <div className="empty-state">
            <h2>Votre panier est vide</h2>
            <p>Parcourez la boutique pour y ajouter vos premiers objets.</p>
            <Link href="/boutique" className="btn btn-primary" style={{ marginTop: 14 }}>
              Aller à la boutique
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const currency = quote?.currency ?? "EUR";
  const canOrder = Boolean(quote && quote.lines.length > 0 && !error);

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="page-head">
          <div>
            <h1>Mon panier</h1>
            <p>Les prix et les stocks sont vérifiés par notre serveur.</p>
          </div>
          <Link href="/boutique" className="btn btn-ghost btn-sm">
            ← Continuer mes achats
          </Link>
        </div>

        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        {quote && quote.issues.length > 0 ? (
          <div className="alert alert-warning" role="status">
            <div>
              <strong>Votre panier a été mis à jour :</strong>
              <ul>
                {quote.issues.map((issue) => (
                  <li key={`${issue.productId}-${issue.code}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="cart-layout">
          <section className="card">
            {loading && !quote ? (
              <div className="skeleton" style={{ height: 180 }} />
            ) : (
              (quote?.lines ?? []).map((line) => (
                <div className="cart-line" key={line.productId}>
                  <div className="cart-line-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={line.imageUrl} alt={line.name} />
                  </div>

                  <div className="cart-line-info">
                    <div className="cart-line-title">
                      <Link href={`/produit/${line.slug}`}>{line.name}</Link>
                    </div>
                    <div className="product-sku">{line.sku}</div>
                    <div className="small muted">
                      {formatPrice(line.unitPriceCents, currency)} l&apos;unité
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 6, paddingLeft: 0 }}
                      onClick={() => remove(line.productId)}
                    >
                      Supprimer
                    </button>
                  </div>

                  <div className="cart-line-right">
                    <div className="qty">
                      <button
                        type="button"
                        aria-label={`Diminuer la quantité de ${line.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="value">{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Augmenter la quantité de ${line.name}`}
                        disabled={line.quantity >= line.available}
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <strong>{formatPrice(line.lineTotalCents, currency)}</strong>
                  </div>
                </div>
              ))
            )}
          </section>

          <aside className="card summary">
            <h2 className="card-title">Récapitulatif</h2>

            <form className="stack" onSubmit={applyPromo} style={{ marginBottom: 16 }}>
              <div className="field">
                <label htmlFor="promo">Code promotionnel</label>
                <div className="inline-form">
                  <input
                    id="promo"
                    type="text"
                    value={promoInput}
                    onChange={(event) => setPromoInput(event.target.value)}
                    placeholder="Ex. BIENVENUE"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn btn-secondary">
                    Appliquer
                  </button>
                </div>
              </div>
              {quote?.promoError ? (
                <p className="field-error">{quote.promoError}</p>
              ) : null}
              {quote?.promoCode ? (
                <p className="small" style={{ color: "var(--success)" }}>
                  Code « {quote.promoCode} » appliqué.{" "}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearPromo}>
                    Retirer
                  </button>
                </p>
              ) : null}
            </form>

            <div className="summary-row">
              <span>Sous-total</span>
              <strong>{formatPrice(quote?.subtotalCents ?? 0, currency)}</strong>
            </div>
            {quote && quote.discountCents > 0 ? (
              <div className="summary-row summary-discount">
                <span>Remise</span>
                <strong>− {formatPrice(quote.discountCents, currency)}</strong>
              </div>
            ) : null}
            <div className="summary-row">
              <span>Livraison</span>
              <span className="muted small">Calculée après votre adresse</span>
            </div>
            <div className="summary-row summary-total">
              <span>Total</span>
              <span>
                {formatPrice(
                  Math.max(0, (quote?.subtotalCents ?? 0) - (quote?.discountCents ?? 0)),
                  currency,
                )}
              </span>
            </div>

            <Link
              href="/commande"
              className="btn btn-primary btn-block btn-lg"
              style={{ marginTop: 18 }}
              aria-disabled={!canOrder}
              onClick={(event) => {
                if (!canOrder) event.preventDefault();
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Mise à jour…
                </>
              ) : (
                "Passer la commande"
              )}
            </Link>
            <p className="small muted center" style={{ marginTop: 10 }}>
              Paiement sécurisé par Stripe
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
