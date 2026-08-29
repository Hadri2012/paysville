"use client";

import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatLocalDisplay } from "@/lib/datetime";
import type { RequestStatus } from "@/lib/types";

interface TrackedRequest {
  number: string;
  bikeKind: string;
  bikeName: string;
  firstName: string;
  lastName: string;
  startAt: string;
  endAt: string;
  status: RequestStatus;
  adminComment: string;
  message: string;
  createdAt: string;
}

export default function TrackingPage() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<TrackedRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/requests/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "Aucune demande ne correspond à ces informations.");
        return;
      }
      setResult(data.request as TrackedRequest);
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
          <h1>Suivi de demande</h1>
          <p className="muted">
            Renseignez votre numéro de demande et l&apos;adresse e-mail utilisée. Les deux
            informations sont nécessaires : personne ne peut consulter votre demande en
            devinant simplement son numéro.
          </p>
        </div>

        <form className="card stack" onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="number">Numéro de demande</label>
              <input
                id="number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="VL-2026-7K3F9Q"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="email">Adresse e-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                "Retrouver ma demande"
              )}
            </button>
          </div>
        </form>

        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <section className="card stack">
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="small muted">Demande</div>
                <h2 className="mono" style={{ margin: 0 }}>
                  {result.number}
                </h2>
              </div>
              <StatusBadge status={result.status} large />
            </div>
            <dl className="kv">
              <div>
                <dt>Client</dt>
                <dd>
                  {result.firstName} {result.lastName}
                </dd>
              </div>
              <div>
                <dt>Vélo</dt>
                <dd>{result.bikeName}</dd>
              </div>
              <div>
                <dt>Début</dt>
                <dd>{formatLocalDisplay(result.startAt)}</dd>
              </div>
              <div>
                <dt>Fin</dt>
                <dd>{formatLocalDisplay(result.endAt)}</dd>
              </div>
            </dl>
            {result.adminComment ? (
              <div className="notice-box">
                <strong>Message du propriétaire :</strong> {result.adminComment}
              </div>
            ) : null}
          </section>
        ) : null}

        <p className="small muted">
          Un problème avec votre demande ? Contactez-nous en précisant votre numéro de
          demande. <Link href="/">Retour à l&apos;accueil</Link>
        </p>
      </div>
    </main>
  );
}
