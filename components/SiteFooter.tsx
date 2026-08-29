import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>VéloLoc</h4>
            <p className="small muted" style={{ margin: 0 }}>
              Location de vélo normal et de vélo électrique, sur demande. Chaque demande
              est étudiée puis acceptée ou refusée par le propriétaire.
            </p>
          </div>
          <div>
            <h4>Liens utiles</h4>
            <ul className="footer-links">
              <li>
                <Link href="/">Accueil</Link>
              </li>
              <li>
                <Link href="/suivi">Suivre ma demande</Link>
              </li>
              <li>
                <Link href="/admin/login">Administration</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} VéloLoc</span>
          <span>Aucun paiement en ligne — location sur demande uniquement.</span>
        </div>
      </div>
    </footer>
  );
}
