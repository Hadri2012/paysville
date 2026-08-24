"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { OrderDetails } from "@/components/OrderDetails";
import { OrderHistory } from "@/components/OrderHistory";
import type { OrderHistoryEntry } from "@/lib/history";
import type { PublicOrderView } from "@/lib/orders";

/**
 * Suivi de commande, et historique du client.
 *
 * L'historique s'obtient avec la même preuve que le suivi lui-même (un numéro
 * de commande et l'e-mail qui va avec) : la boutique n'a pas de comptes
 * clients, et une adresse e-mail seule ne doit jamais suffire à dérouler les
 * commandes de quelqu'un. Voir `app/api/orders/history/route.ts`.
 */
export default function TrackingPage() {
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<PublicOrderView | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingNumber, setOpeningNumber] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  /** Détail d'une commande, à partir du couple numéro + e-mail déjà saisi. */
  const fetchOrder = async (orderNumber: string): Promise<PublicOrderView> => {
    const response = await fetch("/api/orders/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: orderNumber, email }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        data?.error?.message ?? "Aucune commande ne correspond à ces informations.",
      );
    }
    return data.order as PublicOrderView;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);
    setHistory([]);
    try {
      const found = await fetchOrder(number);
      setOrder(found);

      // L'historique est un bonus : s'il échoue, le suivi reste affiché plutôt
      // que de faire disparaître la commande que le client vient de retrouver.
      try {
        const response = await fetch("/api/orders/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number, email }),
        });
        const data = await response.json();
        if (response.ok) setHistory(data.orders as OrderHistoryEntry[]);
      } catch {
        /* historique indisponible : le suivi suffit */
      }
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Connexion impossible. Merci de réessayer dans un instant.",
      );
    } finally {
      setLoading(false);
    }
  };

  /** Ouvre une autre commande de l'historique, sans ressaisir l'e-mail. */
  const openOrder = async (orderNumber: string) => {
    setOpeningNumber(orderNumber);
    setError(null);
    try {
      setOrder(await fetchOrder(orderNumber));
      // Le détail est plus haut dans la page : sans ce rappel, le clic
      // paraîtrait sans effet depuis le bas de l'historique.
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Connexion impossible. Merci de réessayer dans un instant.",
      );
    } finally {
      setOpeningNumber(null);
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

        {/*
          Le détail précède l'historique : la page sert d'abord à retrouver LA
          commande qu'on cherche. L'historique vient ensuite, comme un second
          temps — et ouvrir une de ses lignes ramène le regard vers le détail,
          qui se trouve alors plus haut dans la page.
        */}
        <div ref={detailsRef}>
          {order ? <OrderDetails key={order.number} order={order} /> : null}
        </div>

        {history.length > 0 ? (
          <OrderHistory
            entries={history}
            currentNumber={order?.number ?? null}
            loadingNumber={openingNumber}
            onOpen={openOrder}
          />
        ) : null}

        <p className="small muted">
          Un problème avec votre commande ? Contactez-nous en précisant votre numéro de
          commande. <Link href="/cgv">Conditions générales de vente</Link>.
        </p>
      </div>
    </main>
  );
}
