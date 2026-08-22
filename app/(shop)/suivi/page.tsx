"use client";

import Link from "next/link";
import { useState } from "react";
import { OrderDetails } from "@/components/OrderDetails";
import type { PublicOrderView } from "@/lib/orders";

export default function TrackingPage() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const response = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "Aucune commande ne correspond à ces informations.");
        return;
      }
      setOrder(data.order as PublicOrderView);
    } catch {
      setError("Connexion impossible. Merci de réessayer dans un instant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <div className="container page-narrow stack-lg">
        <div>
          <h1>Suivi de commande</h1>
          <p className="muted">
            Renseignez votre numéro de commande et l&apos;adresse e-mail utilisée lors de
            l&apos;achat. Les deux informations sont nécessaires : personne ne peut
            consulter votre commande en devinant simplement son numéro.
          </p>
        </div>

        <form className="card stack" onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="number">Numéro de commande</label>
              <input
                id="number"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="HAD-2026-000001"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="email">Adresse e-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Recherche…
                </>
              ) : (
                "Retrouver ma commande"
              )}
            </button>
          </div>
        </form>

        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        {order ? <OrderDetails order={order} /> : null}

        <p className="small muted">
          Un problème avec votre commande ? Contactez-nous en précisant votre numéro de
          commande. <Link href="/cgv">Conditions générales de vente</Link>.
        </p>
      </div>
    </main>
  );
}
