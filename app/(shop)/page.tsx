import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { deliveryAreas, listPublicProducts } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const state = await readState();
  const products = listPublicProducts(state);
  const highlights = products.slice(0, 8);
  const areas = deliveryAreas(state);
  const cities = areas.flatMap((area) => area.cities);

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="eyebrow">Fabriqué et livré localement</span>
            <h1>Des petits objets utiles, bien pensés, à petit prix.</h1>
            <p className="lead">
              Hadrishop est une petite boutique en ligne : porte-casque, porte-clés,
              rangements, supports de manettes… Des objets imprimés en 3D, vendus à
              l&apos;unité et livrés directement près de chez vous.
            </p>
            <div className="btn-row" style={{ marginTop: 24 }}>
              <Link href="/boutique" className="btn btn-primary btn-lg">
                Découvrir la boutique
              </Link>
              <Link href="/suivi" className="btn btn-secondary btn-lg">
                Suivre ma commande
              </Link>
            </div>
          </div>

          <aside className="hero-card">
            <h3 style={{ marginBottom: 12 }}>Commander chez Hadrishop</h3>
            <ul>
              <li>Paiement 100 % sécurisé par Stripe.</li>
              <li>
                Stock réel affiché : ce que vous voyez est réellement disponible.
              </li>
              <li>
                Livraison{" "}
                {cities.length > 0 ? (
                  <>dans {cities.slice(0, 3).join(", ")}</>
                ) : (
                  <>dans les communes desservies</>
                )}
                .
              </li>
              <li>Un numéro de commande pour suivre votre colis à tout moment.</li>
            </ul>
          </aside>
        </div>
      </section>

      <main className="page">
        <div className="container stack-lg">
          <section>
            <div className="page-head">
              <div>
                <h2>Nos produits</h2>
                <p>Une sélection d&apos;objets prêts à partir.</p>
              </div>
              <Link href="/boutique" className="btn btn-secondary btn-sm">
                Voir tout le catalogue
              </Link>
            </div>

            {highlights.length === 0 ? (
              <div className="empty-state">
                <h2>Le catalogue arrive bientôt</h2>
                <p>Aucun produit n&apos;est actuellement en vente.</p>
              </div>
            ) : (
              <div className="product-grid">
                {highlights.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    currency={state.settings.currency}
                    lowStockThreshold={state.settings.lowStockThreshold}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="feature-grid">
            <div className="feature">
              <div className="icon" aria-hidden="true">
                🔒
              </div>
              <h3>Paiement sécurisé</h3>
              <p>
                Le paiement est traité par Stripe. Hadrishop ne voit ni ne conserve
                aucune donnée bancaire.
              </p>
            </div>
            <div className="feature">
              <div className="icon" aria-hidden="true">
                📦
              </div>
              <h3>Stock vérifié</h3>
              <p>
                Le stock est contrôlé par le serveur au moment du paiement : pas de
                mauvaise surprise après la commande.
              </p>
            </div>
            <div className="feature">
              <div className="icon" aria-hidden="true">
                📍
              </div>
              <h3>Livraison locale</h3>
              <p>
                {cities.length > 0
                  ? `Nous livrons à ${cities.join(", ")}.`
                  : "Les communes desservies sont indiquées sur la page Livraison."}
              </p>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
