"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { readStoredPromo } from "@/lib/clientPromo";
import { formatPrice } from "@/lib/money";
import type { Quote } from "@/lib/shop";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  streetNumber: string;
  complement: string;
  postalCode: string;
  city: string;
  country: string;
  note: string;
  terms: boolean;
  marketing: boolean;
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  street: "",
  streetNumber: "",
  complement: "",
  postalCode: "",
  city: "",
  country: "Belgique",
  note: "",
  terms: false,
  marketing: false,
};

const DRAFT_KEY = "hadrishop.checkout.v1";

function CheckoutForm() {
  const { items, hydrated } = useCart();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("paiement") === "annule";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    setPromoCode(readStoredPromo());
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<FormState>;
        setForm((current) => ({
          ...current,
          ...draft,
          terms: false,
          marketing: Boolean(draft.marketing),
        }));
      }
    } catch {
      /* brouillon illisible : on repart d'un formulaire vide */
    }
  }, []);

  // Brouillon local (confort utilisateur) — aucune donnée sensible n'y figure.
  useEffect(() => {
    try {
      const { terms: _terms, ...rest } = form;
      void _terms;
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
    } catch {
      /* stockage indisponible */
    }
  }, [form]);

  const refreshQuote = useCallback(
    async (postalCode: string, city: string) => {
      if (items.length === 0) {
        setQuote(null);
        setQuoteLoading(false);
        return;
      }
      const id = ++requestId.current;
      setQuoteLoading(true);
      try {
        const response = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, promoCode, postalCode, city }),
        });
        const data = await response.json();
        if (id !== requestId.current) return;
        if (response.ok) setQuote(data.quote as Quote);
      } catch {
        /* le récapitulatif reste sur sa dernière valeur connue */
      } finally {
        if (id === requestId.current) setQuoteLoading(false);
      }
    },
    [items, promoCode],
  );

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void refreshQuote(form.postalCode.trim(), form.city.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [hydrated, form.postalCode, form.city, refreshQuote]);

  const update = (key: keyof FormState) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const target = event.target;
    const value =
      target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!form.terms) {
      setError("Vous devez accepter les conditions générales de vente pour commander.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items, promoCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        const details = data?.error?.details;
        if (details && typeof details === "object") {
          setFieldErrors(details as Record<string, string>);
        }
        setError(data?.error?.message ?? "La commande n'a pas pu être créée.");
        setSubmitting(false);
        return;
      }

      // Redirection vers la page de paiement hébergée par Stripe.
      window.location.href = data.url as string;
    } catch {
      setError(
        "Impossible de contacter le serveur. Aucun montant n'a été débité, merci de réessayer.",
      );
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="container">
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>Votre panier est vide</h2>
          <p>Ajoutez au moins un produit avant de passer commande.</p>
          <Link href="/boutique" className="btn btn-primary" style={{ marginTop: 14 }}>
            Aller à la boutique
          </Link>
        </div>
      </div>
    );
  }

  const currency = quote?.currency ?? "EUR";
  const shippingKnown = quote?.shippingCovered === true;

  return (
    <div className="container stack-lg">
      <div className="page-head">
        <div>
          <h1>Finaliser ma commande</h1>
          <p>Vos informations servent uniquement à préparer et livrer votre commande.</p>
        </div>
      </div>

      {canceled ? (
        <div className="alert alert-warning" role="status">
          Le paiement a été annulé. Votre panier est intact, vous pouvez réessayer quand
          vous voulez — aucun montant n&apos;a été débité.
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <form className="cart-layout" onSubmit={submit} noValidate>
        <div className="stack">
          <section className="card">
            <fieldset>
              <legend>Vos coordonnées</legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="firstName">Prénom *</label>
                  <input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={update("firstName")}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    required
                  />
                  {fieldErrors.firstName ? (
                    <span className="field-error">{fieldErrors.firstName}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="lastName">Nom *</label>
                  <input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={update("lastName")}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    required
                  />
                  {fieldErrors.lastName ? (
                    <span className="field-error">{fieldErrors.lastName}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="email">Adresse e-mail *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={update("email")}
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                  <span className="hint">
                    Nécessaire pour la confirmation et le suivi de commande.
                  </span>
                  {fieldErrors.email ? (
                    <span className="field-error">{fieldErrors.email}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="phone">Téléphone *</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    required
                  />
                  {fieldErrors.phone ? (
                    <span className="field-error">{fieldErrors.phone}</span>
                  ) : null}
                </div>
              </div>
            </fieldset>
          </section>

          <section className="card">
            <fieldset>
              <legend>Adresse de livraison</legend>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="street">Rue *</label>
                  <input
                    id="street"
                    name="street"
                    autoComplete="address-line1"
                    value={form.street}
                    onChange={update("street")}
                    aria-invalid={Boolean(fieldErrors.street)}
                    required
                  />
                  {fieldErrors.street ? (
                    <span className="field-error">{fieldErrors.street}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="streetNumber">Numéro *</label>
                  <input
                    id="streetNumber"
                    name="streetNumber"
                    value={form.streetNumber}
                    onChange={update("streetNumber")}
                    aria-invalid={Boolean(fieldErrors.streetNumber)}
                    required
                  />
                  {fieldErrors.streetNumber ? (
                    <span className="field-error">{fieldErrors.streetNumber}</span>
                  ) : null}
                </div>

                <div className="field field-full">
                  <label htmlFor="complement">Complément d&apos;adresse (facultatif)</label>
                  <input
                    id="complement"
                    name="complement"
                    autoComplete="address-line2"
                    value={form.complement}
                    onChange={update("complement")}
                    placeholder="Boîte, étage, digicode…"
                  />
                </div>

                <div className="field">
                  <label htmlFor="postalCode">Code postal *</label>
                  <input
                    id="postalCode"
                    name="postalCode"
                    autoComplete="postal-code"
                    inputMode="numeric"
                    value={form.postalCode}
                    onChange={update("postalCode")}
                    aria-invalid={Boolean(fieldErrors.postalCode)}
                    required
                  />
                  {fieldErrors.postalCode ? (
                    <span className="field-error">{fieldErrors.postalCode}</span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="city">Ville / village *</label>
                  <input
                    id="city"
                    name="city"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={update("city")}
                    aria-invalid={Boolean(fieldErrors.city)}
                    required
                  />
                  {fieldErrors.city ? (
                    <span className="field-error">{fieldErrors.city}</span>
                  ) : null}
                </div>

                <div className="field field-full">
                  <label htmlFor="country">Pays *</label>
                  <input
                    id="country"
                    name="country"
                    autoComplete="country-name"
                    value={form.country}
                    onChange={update("country")}
                    aria-invalid={Boolean(fieldErrors.country)}
                    required
                  />
                  {fieldErrors.country ? (
                    <span className="field-error">{fieldErrors.country}</span>
                  ) : null}
                </div>
              </div>

              {quote?.shippingCovered === false ? (
                <div className="alert alert-error" style={{ marginTop: 14 }} role="alert">
                  <div>
                    {quote.shippingMessage}{" "}
                    <Link href="/livraison">Voir les communes desservies</Link>
                  </div>
                </div>
              ) : null}
              {shippingKnown ? (
                <div className="alert alert-success" style={{ marginTop: 14 }} role="status">
                  Nous livrons bien à cette adresse.
                </div>
              ) : null}
            </fieldset>
          </section>

          <section className="card">
            <fieldset>
              <legend>Remarque et validation</legend>
              <div className="field">
                <label htmlFor="note">Remarque sur la commande (facultatif)</label>
                <textarea
                  id="note"
                  name="note"
                  value={form.note}
                  onChange={update("note")}
                  maxLength={500}
                  placeholder="Horaire de passage souhaité, précision de livraison…"
                />
              </div>

              <div className="stack" style={{ marginTop: 16 }}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.terms}
                    onChange={update("terms")}
                    required
                  />
                  <span>
                    J&apos;accepte les{" "}
                    <Link href="/cgv" target="_blank">
                      conditions générales de vente
                    </Link>{" "}
                    *
                  </span>
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={form.marketing}
                    onChange={update("marketing")}
                  />
                  <span>
                    Je souhaite être informé(e) des nouveautés Hadrishop (facultatif).
                  </span>
                </label>

                <p className="small muted">
                  Vos données sont traitées conformément à notre{" "}
                  <Link href="/confidentialite">politique de confidentialité</Link>.
                  Le paiement est réalisé sur une page sécurisée Stripe : Hadrishop ne
                  reçoit jamais votre numéro de carte.
                </p>
              </div>
            </fieldset>
          </section>
        </div>

        <aside className="card summary">
          <h2 className="card-title">Votre commande</h2>

          <div className="stack" style={{ marginBottom: 14 }}>
            {(quote?.lines ?? []).map((line) => (
              <div
                key={line.productId}
                style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
              >
                <span className="small">
                  {line.quantity} × {line.name}
                </span>
                <strong className="small nowrap">
                  {formatPrice(line.lineTotalCents, currency)}
                </strong>
              </div>
            ))}
          </div>

          <div className="summary-row">
            <span>Sous-total</span>
            <strong>{formatPrice(quote?.subtotalCents ?? 0, currency)}</strong>
          </div>
          {quote && quote.discountCents > 0 ? (
            <div className="summary-row summary-discount">
              <span>Remise {quote.promoCode ? `(${quote.promoCode})` : ""}</span>
              <strong>− {formatPrice(quote.discountCents, currency)}</strong>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Livraison</span>
            <strong>
              {shippingKnown ? (
                quote!.shippingCents > 0 ? (
                  formatPrice(quote!.shippingCents, currency)
                ) : (
                  "Offerte"
                )
              ) : (
                <span className="muted small">Indiquez votre adresse</span>
              )}
            </strong>
          </div>
          <div className="summary-row summary-total">
            <span>Total</span>
            <span>
              {formatPrice(
                shippingKnown
                  ? (quote?.totalCents ?? 0)
                  : Math.max(0, (quote?.subtotalCents ?? 0) - (quote?.discountCents ?? 0)),
                currency,
              )}
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: 18 }}
            disabled={submitting || quoteLoading || quote?.shippingCovered === false}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" /> Redirection vers Stripe…
              </>
            ) : (
              "Payer avec Stripe"
            )}
          </button>

          <p className="small muted center" style={{ marginTop: 10 }}>
            Le montant final est recalculé par notre serveur avant le paiement.
          </p>
          <p className="center" style={{ marginTop: 8 }}>
            <Link href="/panier" className="btn btn-ghost btn-sm">
              ← Modifier mon panier
            </Link>
          </p>
        </aside>
      </form>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <main className="page">
      <Suspense
        fallback={
          <div className="container">
            <div className="skeleton" style={{ height: 320 }} />
          </div>
        }
      >
        <CheckoutForm />
      </Suspense>
    </main>
  );
}
