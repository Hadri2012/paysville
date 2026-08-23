"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddToCartButton } from "@/components/AddToCartButton";
import { useCart } from "@/components/CartProvider";
import { readStoredPromo, storePromo } from "@/lib/clientPromo";
import { formatPrice } from "@/lib/money";
import type { PublicProduct, Quote } from "@/lib/shop";

export default function CartPage() {
  const { items, setQuantity, remove, hydrated, notify } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [suggestions, setSuggestions] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    // Code promo mémorisé dans localStorage : lecture après montage obligatoire
    // (indisponible au rendu serveur, sinon erreur d'hydratation).
    const stored = readStoredPromo();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec un stockage externe
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
      setSuggestions((data.suggestions ?? []) as PublicProduct[]);
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
      // Panier vidé : on efface le devis serveur devenu caduc.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remise à zéro après vidage du panier
      setQuote(null);
      setSuggestions([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [hydrated, items, promoCode, refresh]);

  // Le serveur fait autorité : on aligne le panier local sur ses corrections.
  useEffect(() => {
    if (!quote || quote.issues.length === 0) return;
    for (const issue of quote.issues) {
      const current = items.find(
        (item) =>
          item.productId === issue.productId && (item.colorId ?? null) === issue.colorId,
      );
      if (!current) continue;
      if (issue.quantity <= 0) remove(issue.productId, issue.colorId);
      else if (current.quantity !== issue.quantity) {
        setQuantity(issue.productId, issue.quantity, issue.colorId);
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
                  <li key={`${issue.productId}-${issue.colorId ?? ""}-${issue.code}`}>
                    {issue.message}
                  </li>
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
                <div className="cart-line" key={`${line.productId}:${line.colorId ?? ""}`}>
                  <div className="cart-line-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={line.imageUrl} alt={line.name} />
                  </div>

                  <div className="cart-line-info">
                    <div className="cart-line-title">
                      <Link href={`/produit/${line.slug}`}>{line.name}</Link>
                    </div>
                    <div className="product-sku">{line.sku}</div>
                    {line.colorName ? (
                      <div className="small muted">Couleur : {line.colorName}</div>
                    ) : null}
                    <div className="small muted">
                      {line.kind === "digital"
                        ? formatPrice(line.unitPriceCents, currency)
                        : `${formatPrice(line.unitPriceCents, currency)} l'unité`}
                    </div>
                    {line.kind === "digital" ? (
                      <span className="badge badge-info">
                        Fichier — téléchargement immédiat
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 6, paddingLeft: 0 }}
                      onClick={() => remove(line.productId, line.colorId)}
                    >
                      Supprimer
                    </button>
                  </div>

                  <div className="cart-line-right">
                    {/* Un fichier s'achète une fois : le sélecteur de quantité
                        n'aurait rien à régler. */}
                    {line.kind === "digital" ? (
                      <span className="small muted">1 exemplaire</span>
                    ) : (
                      <div className="qty">
                        <button
                          type="button"
                          aria-label={`Diminuer la quantité de ${line.name}`}
                          onClick={() =>
                            setQuantity(line.productId, line.quantity - 1, line.colorId)
                          }
                        >
                          −
                        </button>
                        <span className="value">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Augmenter la quantité de ${line.name}`}
                          disabled={line.quantity >= line.available}
                          onClick={() =>
                            setQuantity(line.productId, line.quantity + 1, line.colorId)
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
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
                <>
                  <p className="small" style={{ color: "var(--success)" }}>
                    Code « {quote.promoCode} » appliqué.{" "}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearPromo}>
                      Retirer
                    </button>
                  </p>
                  {/* Le panier ne connaît pas encore l'e-mail : on prévient ici plutôt
                      que de laisser le refus tomber au moment de payer. */}
                  {quote.promoOncePerCustomer ? (
                    <p className="small muted">
                      Ce code est valable une fois par client. Il sera vérifié avec
                      votre adresse e-mail au moment de la commande.
                    </p>
                  ) : null}
                </>
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
              <span>{quote?.digitalOnly ? "Remise" : "Livraison"}</span>
              <span className="muted small">
                {quote?.digitalOnly
                  ? "Téléchargement immédiat"
                  : "Calculée après votre adresse"}
              </span>
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

        {suggestions.length > 0 ? (
          <section>
            <h2>Complétez votre panier</h2>
            <p className="muted" style={{ marginTop: -8 }}>
              Ce que d&apos;autres clients ont commandé avec ces articles.
            </p>
            <div className="cart-suggestions">
              {suggestions.map((product) => (
                <article key={product.id} className="cart-suggestion">
                  <Link href={`/produit/${product.slug}`} className="cart-suggestion-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={product.name} loading="lazy" />
                  </Link>
                  <div className="cart-suggestion-body">
                    <Link href={`/produit/${product.slug}`}>{product.name}</Link>
                    <div className="product-price">
                      {formatPrice(product.priceCents, currency)}
                    </div>
                    {/* Un produit à couleurs a besoin de la fiche produit pour
                        choisir laquelle : l'ajout rapide n'aurait pas de sens ici. */}
                    {product.colors.length > 0 ? (
                      <Link
                        href={`/produit/${product.slug}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Voir le produit
                      </Link>
                    ) : (
                      <AddToCartButton
                        productId={product.id}
                        name={product.name}
                        available={product.available}
                        className="btn btn-secondary btn-sm"
                        label="Ajouter"
                      />
                    )}
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
