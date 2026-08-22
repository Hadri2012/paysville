import Link from "next/link";

export function SiteFooter({ contactEmail }: { contactEmail?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="logo" style={{ marginBottom: 10 }}>
              <span className="logo-mark" aria-hidden="true">
                HS
              </span>
              Hadrishop
            </Link>
            <p className="muted small" style={{ maxWidth: "34ch" }}>
              Petite boutique d&apos;objets utiles imprimés en 3D, livrés en main propre
              dans les communes desservies.
            </p>
          </div>

          <div>
            <h4>Boutique</h4>
            <ul className="footer-links">
              <li>
                <Link href="/boutique">Tous les produits</Link>
              </li>
              <li>
                <Link href="/panier">Mon panier</Link>
              </li>
              <li>
                <Link href="/suivi">Suivre ma commande</Link>
              </li>
              <li>
                <Link href="/livraison">Zone de livraison</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Informations</h4>
            <ul className="footer-links">
              <li>
                <Link href="/cgv">Conditions générales de vente</Link>
              </li>
              <li>
                <Link href="/confidentialite">Politique de confidentialité</Link>
              </li>
              <li>
                <Link href="/admin">Administration</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <ul className="footer-links">
              {contactEmail ? (
                <li>
                  <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </li>
              ) : (
                <li className="muted small">
                  Adresse de contact à renseigner dans l&apos;administration.
                </li>
              )}
              <li className="muted small">Paiement sécurisé par Stripe</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} Hadrishop. Tous droits réservés.</span>
          <span>Aucune donnée bancaire n&apos;est stockée par Hadrishop.</span>
        </div>
      </div>
    </footer>
  );
}
