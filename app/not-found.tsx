import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="container page-narrow">
        <div className="empty-state">
          <h2>Page introuvable</h2>
          <p>
            La page que vous cherchez n&apos;existe pas ou a été déplacée.
          </p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <Link href="/" className="btn btn-primary">
              Retour à l&apos;accueil
            </Link>
            <Link href="/suivi" className="btn btn-secondary">
              Suivre ma demande
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
