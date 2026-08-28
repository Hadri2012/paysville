import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice } from "@/lib/money";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: "Conditions générales de vente de la boutique Hadrishop.",
};

export default async function TermsPage() {
  const state = await readState();
  const {
    legal,
    currency,
    defaultShippingFeeCents,
    cashOnDeliveryEnabled,
    cashOnDeliveryMaxCents,
    cardOnDeliveryEnabled,
  } = state.settings;
  const zones = state.shippingZones.filter((zone) => zone.active);
  const incomplete = !legal.companyName || !legal.address || !legal.email;

  return (
    <main className="page">
      <div className="container page-narrow prose stack">
        <h1>Conditions générales de vente</h1>
        <p className="muted small">
          Dernière mise à jour : {new Date().toLocaleDateString("fr-BE")}
        </p>

        {incomplete ? (
          <div className="alert alert-warning">
            <div>
              Les informations légales du vendeur doivent encore être complétées dans
              l&apos;<Link href="/admin/parametres">administration Hadrishop</Link>{" "}
              (dénomination, adresse, e-mail de contact, numéro d&apos;entreprise).
            </div>
          </div>
        ) : null}

        <h2>1. Vendeur</h2>
        <p>
          La boutique en ligne Hadrishop est éditée par&nbsp;:
          <br />
          <strong>{legal.companyName || "[Dénomination à compléter]"}</strong>
          <br />
          {legal.address || "[Adresse à compléter]"}
          <br />
          {legal.email || "[Adresse e-mail à compléter]"}
          {legal.phone ? (
            <>
              <br />
              {legal.phone}
            </>
          ) : null}
          {legal.vatNumber ? (
            <>
              <br />
              Numéro d&apos;entreprise / TVA : {legal.vatNumber}
            </>
          ) : null}
        </p>

        <h2>2. Objet</h2>
        <p>
          Les présentes conditions régissent les ventes réalisées sur Hadrishop. Toute
          commande implique l&apos;acceptation sans réserve de ces conditions, matérialisée
          par la case à cocher obligatoire lors du paiement.
        </p>

        <h2>3. Produits et disponibilité</h2>
        <p>
          Hadrishop propose deux types de produits, clairement identifiés sur chaque
          fiche&nbsp;:
        </p>
        <ul>
          <li>
            <strong>les objets</strong>, imprimés puis expédiés ou remis en main propre
            dans la zone de livraison&nbsp;;
          </li>
          <li>
            <strong>les fichiers numériques</strong>, remis exclusivement par
            téléchargement (modèles 3D aux formats STL, 3MF, STEP, OBJ ou autres,
            documents, gabarits, archives). Aucun support physique n&apos;est envoyé.
          </li>
        </ul>
        <p>
          Les produits proposés sont décrits avec la plus grande exactitude possible. Les
          stocks affichés correspondent aux quantités réellement disponibles. Lors du
          passage en caisse, la disponibilité est réservée pendant{" "}
          {state.settings.reservationMinutes} minutes le temps du paiement ; passé ce
          délai sans paiement, les articles sont automatiquement remis en vente. Les
          fichiers numériques ne sont pas soumis à un stock : ils restent disponibles tant
          qu&apos;ils figurent au catalogue, et un même fichier n&apos;est vendu
          qu&apos;une fois par commande.
        </p>

        <h2 id="fichiers">3 bis. Fichiers numériques : remise et licence d&apos;usage</h2>
        <p>
          <strong>Remise.</strong> Dès la confirmation du paiement par Stripe, les
          fichiers achetés deviennent téléchargeables depuis la page de confirmation et
          depuis la page « Suivi de commande » (numéro de commande + adresse e-mail).
          Le téléchargement est possible autant de fois que nécessaire, sans limite de
          durée fixée à l&apos;avance ; en cas de retrait d&apos;un produit du catalogue,
          l&apos;acheteur dispose d&apos;un délai raisonnable pour récupérer ses fichiers
          et peut en demander une nouvelle mise à disposition en contactant le vendeur.
        </p>
        <p>
          <strong>Configuration nécessaire.</strong> Il appartient à l&apos;acheteur de
          vérifier, avant l&apos;achat, que les formats annoncés sur la fiche produit sont
          exploitables avec son matériel et ses logiciels. Le vendeur ne garantit pas le
          résultat d&apos;une impression réalisée par l&apos;acheteur, celui-ci dépendant
          de sa machine, de ses réglages et de son matériau.
        </p>
        <p>
          <strong>Licence d&apos;usage.</strong> L&apos;achat d&apos;un fichier ne
          transfère aucun droit de propriété intellectuelle. Il confère à
          l&apos;acheteur, à titre personnel et non exclusif, le droit&nbsp;:
        </p>
        <ul>
          <li>
            d&apos;utiliser le fichier pour son usage personnel ou interne, y compris pour
            réaliser des impressions&nbsp;;
          </li>
          <li>
            de conserver des copies de sauvegarde et de modifier le fichier pour ses
            propres besoins.
          </li>
        </ul>
        <p>Sont en revanche interdits, sauf accord écrit préalable du vendeur&nbsp;:</p>
        <ul>
          <li>
            la revente, le partage, la mise en ligne ou la redistribution du fichier, sous
            sa forme d&apos;origine ou modifiée&nbsp;;
          </li>
          <li>
            la vente d&apos;impressions issues du fichier à des fins commerciales, ainsi
            que toute exploitation commerciale du modèle&nbsp;;
          </li>
          <li>
            la revendication de la paternité du modèle ou son dépôt à titre de droit de
            propriété intellectuelle.
          </li>
        </ul>
        <p>
          Une licence commerciale peut être accordée sur demande, à l&apos;adresse de
          contact indiquée à l&apos;article 1.
        </p>

        <h2>4. Prix</h2>
        <p>
          Les prix sont indiqués en euros, toutes taxes comprises le cas échéant. Le
          montant définitif de chaque commande est calculé par notre serveur au moment du
          paiement : sous-total des articles, remise éventuelle, puis frais de livraison.
          Les frais de livraison standard s&apos;élèvent à{" "}
          {defaultShippingFeeCents > 0
            ? formatPrice(defaultShippingFeeCents, currency)
            : "0,00 € (livraison offerte)"}
          .
        </p>

        <h2>5. Commande</h2>
        <p>
          La commande suit les étapes suivantes : sélection des produits, vérification du
          panier, saisie des coordonnées et de l&apos;adresse de livraison, acceptation des
          présentes conditions, puis paiement. Chaque commande reçoit un numéro unique de
          la forme HAD-AAAA-NNNNNN.
        </p>

        <h2>6. Paiement</h2>
        <p>
          Le paiement s&apos;effectue en ligne via Stripe, prestataire de paiement
          sécurisé. Hadrishop n&apos;a jamais accès à vos données bancaires et n&apos;en
          conserve aucune. La commande n&apos;est considérée comme confirmée qu&apos;après
          confirmation du paiement par Stripe.
        </p>
        {cashOnDeliveryEnabled ? (
          <p>
            <strong>Espèces à la livraison.</strong> Pour une commande comportant une
            livraison physique, le règlement en espèces à la remise peut être choisi à la
            place du paiement par carte
            {cashOnDeliveryMaxCents !== null ? (
              <>
                {" "}
                , jusqu&apos;à {formatPrice(cashOnDeliveryMaxCents, currency)} de montant
                total
              </>
            ) : null}
            . La commande est alors ferme dès sa validation — les articles sont mis en
            préparation immédiatement — sans qu&apos;aucun montant ne soit prélevé en
            ligne : la somme indiquée est due en espèces, en main propre, au moment de la
            livraison.
          </p>
        ) : null}
        {cardOnDeliveryEnabled ? (
          <p>
            <strong>Carte à la livraison.</strong> Pour une commande comportant une
            livraison physique, le règlement par carte bancaire sur le terminal de
            paiement du livreur peut être choisi à la place du paiement en ligne. La
            commande est alors ferme dès sa validation — les articles sont mis en
            préparation immédiatement — sans qu&apos;aucun montant ne soit prélevé en
            ligne : la somme indiquée est due par carte, au moment de la livraison.
          </p>
        ) : null}

        <h2>7. Livraison</h2>
        <p>
          <strong>Fichiers numériques.</strong> Aucune livraison physique n&apos;a lieu et
          aucun frais de livraison n&apos;est facturé : la remise s&apos;effectue par
          téléchargement, dans les conditions de l&apos;article 3 bis. Une commande
          composée uniquement de fichiers peut être passée depuis n&apos;importe où, sans
          restriction géographique, et l&apos;adresse postale y est facultative.
        </p>
        <p>
          <strong>Objets.</strong> La livraison est assurée uniquement dans les communes
          desservies&nbsp;:
          {zones.length > 0 ? (
            <>
              {" "}
              {zones
                .map(
                  (zone) =>
                    `${zone.postalCode}${
                      zone.cities.length > 0 ? ` (${zone.cities.join(", ")})` : ""
                    }`,
                )
                .join(" ; ")}
              .
            </>
          ) : (
            <> voir la page « Livraison ».</>
          )}{" "}
          Si l&apos;adresse indiquée n&apos;est pas desservie, la commande ne peut pas être
          finalisée.
        </p>

        <h2>8. Droit de rétractation</h2>
        <p>
          Conformément à la réglementation applicable aux ventes à distance, le
          consommateur dispose d&apos;un délai de quatorze jours à compter de la réception
          des produits pour exercer son droit de rétractation, sans avoir à motiver sa
          décision. Pour exercer ce droit, contactez le vendeur à l&apos;adresse indiquée
          à l&apos;article 1 en précisant votre numéro de commande.
        </p>
        <p>Ce droit ne s&apos;applique pas&nbsp;:</p>
        <ul>
          <li>
            aux biens confectionnés selon les spécifications du consommateur ou nettement
            personnalisés (produits « custom »)&nbsp;;
          </li>
          <li>
            <strong>aux fichiers numériques</strong>, dont la fourniture commence
            immédiatement après la confirmation du paiement. En validant une commande
            contenant un fichier, l&apos;acheteur demande expressément que son exécution
            débute sans attendre et reconnaît perdre, de ce fait, son droit de
            rétractation sur ce fichier dès que le téléchargement est mis à sa
            disposition. Cette mention est rappelée sur la fiche produit avant l&apos;ajout
            au panier.
          </li>
        </ul>

        <h2>9. Garantie</h2>
        <p>
          Les produits bénéficient de la garantie légale de conformité. En cas de produit
          défectueux ou non conforme, contactez le vendeur avec votre numéro de commande.
          Pour un fichier numérique, la garantie porte sur sa conformité à la description
          publiée (formats annoncés, contenu, intégrité du fichier) : un fichier corrompu,
          incomplet ou ne correspondant pas aux formats annoncés est corrigé, remplacé ou
          remboursé.
        </p>

        <h2>10. Remboursements</h2>
        <p>
          Les remboursements éventuels sont effectués via Stripe, sur le moyen de paiement
          utilisé lors de la commande. Le statut de la commande passe alors à
          « Remboursée » et l&apos;accès aux éventuels fichiers de cette commande cesse.
        </p>

        <h2>11. Données personnelles</h2>
        <p>
          Le traitement de vos données est décrit dans notre{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>

        <h2>12. Litiges</h2>
        <p>
          Les présentes conditions sont soumises au droit du pays du vendeur. En cas de
          litige, une solution amiable sera recherchée en priorité avant toute action
          judiciaire.
        </p>
      </div>
    </main>
  );
}
