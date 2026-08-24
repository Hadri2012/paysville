import { SHOP_MONOGRAM } from "@/lib/brand";

/**
 * Page affichée quand la boutique ne peut pas démarrer faute de configuration.
 *
 * Elle remplace le contenu du site, sur toutes les pages : sans stockage, il
 * n'y a ni catalogue, ni panier, ni administration — rien à montrer. Elle prend
 * la place de la page d'erreur générique, qui disait seulement « Une erreur est
 * survenue » là où le problème est connu, nommé, et se règle en quelques clics.
 *
 * Elle ne divulgue rien : ni valeur de variable, ni trace technique, seulement
 * le nom du réglage manquant et la marche à suivre — ce qu'un hébergeur affiche
 * de toute façon sur un déploiement qui n'a pas encore de base.
 */
export function SetupNotice({ reason }: { reason: string }) {
  return (
    <main className="page">
      <div className="container page-narrow stack-lg">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--brand)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {SHOP_MONOGRAM}
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Configuration à terminer</h1>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              La boutique n&apos;est pas encore reliée à une base de données.
            </p>
          </div>
        </div>

        <div className="alert alert-warning">{reason}</div>

        <section>
          <h2 style={{ fontSize: 18 }}>Marche à suivre sur Vercel</h2>
          <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
            <li>
              Ouvrez le projet, onglet <strong>Storage</strong>, puis{" "}
              <strong>Create Database</strong> → <strong>Postgres</strong>.
            </li>
            <li>
              Cliquez sur <strong>Connect</strong> pour rattacher la base au projet :
              Vercel renseigne alors <code>DATABASE_URL</code> tout seul.
            </li>
            <li>
              Si vous utilisez une base hébergée ailleurs, ajoutez plutôt{" "}
              <code>DATABASE_URL</code> à la main dans <strong>Settings</strong> →{" "}
              <strong>Environment Variables</strong>.
            </li>
            <li>
              <strong>Redéployez</strong> : les variables d&apos;environnement ne sont
              lues qu&apos;au déploiement.
            </li>
          </ol>
        </section>

        <section>
          <h2 style={{ fontSize: 18 }}>Pourquoi c&apos;est obligatoire</h2>
          <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            Sur Vercel, le disque est remis à zéro à chaque déploiement et n&apos;est
            même pas inscriptible pendant l&apos;exécution. Sans base de données, les
            commandes, les stocks et le compte administrateur disparaîtraient à la
            première mise en ligne suivante. La boutique préfère refuser de démarrer
            plutôt que d&apos;encaisser une commande qu&apos;elle perdra.
          </p>
          <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            En développement local, rien de tout cela n&apos;est nécessaire : le
            fichier <code>.data/hadrishop.json</code> fait office de base.
          </p>
        </section>
      </div>
    </main>
  );
}
