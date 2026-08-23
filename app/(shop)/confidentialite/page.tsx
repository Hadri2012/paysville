import type { Metadata } from "next";
import Link from "next/link";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Comment Hadrishop collecte et protège vos données personnelles.",
};

export default async function PrivacyPage() {
  const state = await readState();
  const { legal, contactEmail } = state.settings;
  const contact = contactEmail || legal.email;

  return (
    <main className="page">
      <div className="container page-narrow prose stack">
        <h1>Politique de confidentialité</h1>
        <p className="muted small">
          Dernière mise à jour : {new Date().toLocaleDateString("fr-BE")}
        </p>

        <p>
          Hadrishop attache de l&apos;importance à la protection de vos données. Cette page
          explique quelles données sont collectées, pourquoi, et comment elles sont
          protégées.
        </p>

        <h2>1. Responsable du traitement</h2>
        <p>
          {legal.companyName || "[Dénomination à compléter dans l'administration]"}
          {legal.address ? (
            <>
              <br />
              {legal.address}
            </>
          ) : null}
          {contact ? (
            <>
              <br />
              Contact : <a href={`mailto:${contact}`}>{contact}</a>
            </>
          ) : null}
        </p>

        <h2>2. Données collectées</h2>
        <p>Pour traiter une commande, Hadrishop collecte uniquement :</p>
        <ul>
          <li>votre prénom et votre nom ;</li>
          <li>votre adresse e-mail ;</li>
          <li>votre numéro de téléphone ;</li>
          <li>
            votre adresse de livraison (rue, numéro, complément, code postal, commune,
            pays) — facultative si votre commande ne contient que des fichiers
            téléchargeables, puisqu&apos;il n&apos;y a rien à expédier ;
          </li>
          <li>le contenu de votre commande et votre remarque éventuelle ;</li>
          <li>l&apos;identifiant technique de la transaction Stripe.</li>
        </ul>
        <p>
          Les téléchargements de fichiers achetés ne donnent lieu à aucun profilage :
          Hadrishop ne tient pas de journal nominatif des téléchargements et ne mesure ni
          leur nombre ni leur date par client.
        </p>
        <p>
          <strong>
            Aucune donnée bancaire n&apos;est collectée ni stockée par Hadrishop.
          </strong>{" "}
          Les numéros de carte sont saisis directement sur les pages sécurisées de Stripe.
        </p>

        <h2>3. Finalités</h2>
        <ul>
          <li>traiter, préparer et livrer votre commande ;</li>
          <li>vous permettre de suivre votre commande ;</li>
          <li>respecter les obligations comptables et légales du vendeur ;</li>
          <li>
            vous envoyer, uniquement si vous l&apos;avez explicitement accepté, des
            informations sur les nouveautés (case facultative, décochée par défaut).
          </li>
        </ul>

        <h2>4. Base légale</h2>
        <p>
          Le traitement repose sur l&apos;exécution du contrat de vente, sur le respect
          d&apos;obligations légales, et — pour les communications facultatives — sur votre
          consentement, révocable à tout moment.
        </p>

        <h2>5. Destinataires</h2>
        <p>
          Vos données ne sont ni vendues ni cédées. Elles sont accessibles au vendeur et à
          Stripe, notre prestataire de paiement, uniquement dans la mesure nécessaire au
          traitement du paiement.
        </p>

        <h2>6. Sécurité</h2>
        <ul>
          <li>toutes les données sont validées et traitées côté serveur ;</li>
          <li>
            l&apos;accès à l&apos;administration est protégé par une authentification ; les
            mots de passe ne sont jamais stockés en clair ;
          </li>
          <li>
            une commande n&apos;est consultable qu&apos;avec son numéro <em>et</em>{" "}
            l&apos;adresse e-mail utilisée lors de l&apos;achat ;
          </li>
          <li>
            les fichiers achetés ne sont remis qu&apos;à une commande effectivement payée,
            au moyen d&apos;un lien portant un jeton d&apos;accès propre à cette commande :
            connaître le nom d&apos;un fichier ne permet jamais de le télécharger ;
          </li>
          <li>le site est servi en HTTPS en production.</li>
        </ul>

        <h2>7. Cookies et stockage local</h2>
        <p>
          Hadrishop n&apos;utilise aucun cookie publicitaire ni traceur analytique. Sont
          utilisés uniquement : le stockage local de votre navigateur pour conserver votre
          panier, et un cookie strictement nécessaire pour la session
          d&apos;administration.
        </p>

        <h2>8. Durée de conservation</h2>
        <p>
          Les données de commande sont conservées le temps nécessaire au traitement de la
          commande et à la durée légale de conservation des documents commerciaux.
        </p>

        <h2>9. Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement,
          de limitation et d&apos;opposition sur vos données. Pour l&apos;exercer,
          contactez le responsable du traitement indiqué au point 1
          {contact ? (
            <>
              {" "}
              à l&apos;adresse <a href={`mailto:${contact}`}>{contact}</a>
            </>
          ) : null}
          .
        </p>

        <p>
          Voir aussi nos{" "}
          <Link href="/cgv">conditions générales de vente</Link>.
        </p>
      </div>
    </main>
  );
}
