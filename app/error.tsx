"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Erreur serveur ou rendu : message clair pour le client, aucune trace technique.
 * Le détail reste dans les journaux du serveur.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[hadrishop] erreur d'affichage", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="page">
      <div className="container page-narrow">
        <div className="empty-state">
          <h2>Une erreur est survenue</h2>
          <p>
            Nous n&apos;avons pas pu afficher cette page. Aucun paiement n&apos;a été
            effectué. Merci de réessayer dans un instant.
          </p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={reset}>
              Réessayer
            </button>
            <Link href="/" className="btn btn-secondary">
              Retour à l&apos;accueil
            </Link>
          </div>
          {/* Le `digest` n'est pas une trace technique : c'est l'empreinte que le
              serveur inscrit à côté de l'erreur complète dans ses journaux. Sans
              lui, retrouver la bonne ligne dans les journaux d'un hébergement
              tient de la fouille. Il ne révèle rien de l'erreur elle-même. */}
          {error.digest ? (
            <p style={{ marginTop: 20, fontSize: 12, opacity: 0.7 }}>
              Référence à communiquer : <code>{error.digest}</code>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
