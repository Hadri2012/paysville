import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="page">
      <div className="container">
        <div className="empty-state">
          <h2>Produit introuvable</h2>
          <p>
            Ce produit n&apos;existe plus ou n&apos;est plus proposé à la vente chez
            Hadrishop.
          </p>
          <Link href="/boutique" className="btn btn-primary" style={{ marginTop: 14 }}>
            Retour à la boutique
          </Link>
        </div>
      </div>
    </main>
  );
}
