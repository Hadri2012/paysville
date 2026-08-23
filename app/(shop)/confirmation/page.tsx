import type { Metadata } from "next";
import Link from "next/link";
import { timingSafeEqual } from "crypto";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ClearCartOnMount } from "@/components/ClearCartOnMount";
import { OrderDetails } from "@/components/OrderDetails";
import { publicOrderView } from "@/lib/orders";
import { syncOrderFromStripe } from "@/lib/payments";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmation de commande",
  robots: { index: false, follow: false },
};

function tokenMatches(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ commande?: string; token?: string }>;
}) {
  const { commande, token } = await searchParams;

  if (!commande || !token) {
    return <MissingOrder />;
  }

  // La confirmation vient de Stripe (webhook signé ou vérification serveur de la
  // session) — jamais du simple fait d'avoir atteint cette page.
  const order = await syncOrderFromStripe(commande.trim().toUpperCase());
  if (!order || !tokenMatches(order.accessToken, token)) {
    return <MissingOrder />;
  }

  const paid = order.paymentStatus === "paid";
  const failed = order.paymentStatus === "failed" || order.paymentStatus === "canceled";

  return (
    <main className="page">
      <div className="container page-narrow stack-lg">
        {paid ? <ClearCartOnMount /> : null}
        {!paid && !failed ? <AutoRefresh /> : null}

        {paid ? (
          <div className="card center" style={{ background: "var(--success-soft)", borderColor: "#abefc6" }}>
            <div style={{ fontSize: "2.4rem" }} aria-hidden="true">
              🎉
            </div>
            <h1 style={{ marginBottom: 6 }}>Merci pour votre commande !</h1>
            <p style={{ margin: 0 }}>
              Votre paiement a bien été confirmé. Conservez votre numéro de commande{" "}
              <strong className="mono">{order.number}</strong> : il vous permet de suivre
              votre commande à tout moment.
            </p>
          </div>
        ) : failed ? (
          <div className="alert alert-error" role="alert">
            <div>
              <strong>Le paiement n&apos;a pas abouti.</strong> Votre commande{" "}
              <span className="mono">{order.number}</span> a été annulée et les articles
              ont été remis en stock. Vous pouvez repasser commande quand vous le
              souhaitez.
            </div>
          </div>
        ) : (
          <div className="alert alert-info" role="status">
            <div>
              <strong>Paiement en cours de vérification…</strong> Nous attendons la
              confirmation définitive de Stripe. Cette page se met à jour automatiquement.
            </div>
          </div>
        )}

        <OrderDetails order={publicOrderView(order, await readState())} />

        <div className="panel small">
          <p>
            Un récapitulatif est disponible à tout moment depuis la page{" "}
            <Link href="/suivi">Suivi de commande</Link> avec votre numéro de commande et
            votre adresse e-mail.
          </p>
          <p style={{ marginBottom: 0 }}>
            Hadrishop ne conserve aucune donnée bancaire : le paiement a été traité par
            Stripe.
          </p>
        </div>

        <div className="btn-row">
          <Link href="/boutique" className="btn btn-secondary">
            Retour à la boutique
          </Link>
          <Link href="/suivi" className="btn btn-ghost">
            Suivre ma commande
          </Link>
        </div>
      </div>
    </main>
  );
}

function MissingOrder() {
  return (
    <main className="page">
      <div className="container page-narrow">
        <div className="empty-state">
          <h2>Commande introuvable</h2>
          <p>
            Ce lien de confirmation n&apos;est pas valide. Utilisez la page de suivi avec
            votre numéro de commande et votre adresse e-mail.
          </p>
          <Link href="/suivi" className="btn btn-primary" style={{ marginTop: 14 }}>
            Suivre ma commande
          </Link>
        </div>
      </div>
    </main>
  );
}
