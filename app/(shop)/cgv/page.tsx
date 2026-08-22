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
  const { legal, currency, defaultShippingFeeCents } = state.settings;
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
          Les produits proposés sont décrits avec la plus grande exactitude possible. Les
          stocks affichés correspondent aux quantités réellement disponibles. Lors du
          passage en caisse, la disponibilité est réservée pendant{" "}
          {state.settings.reservationMinutes} minutes le temps du paiement ; passé ce
          délai sans paiement, les articles sont automatiquement remis en vente.
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

        <h2>7. Livraison</h2>
        <p>
          La livraison est assurée uniquement dans les communes desservies&nbsp;:
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
          décision. Ce droit ne s&apos;applique pas aux biens confectionnés selon les
          spécifications du consommateur ou nettement personnalisés (produits « custom »).
          Pour exercer ce droit, contactez le vendeur à l&apos;adresse indiquée à
          l&apos;article 1 en précisant votre numéro de commande.
        </p>

        <h2>9. Garantie</h2>
        <p>
          Les produits bénéficient de la garantie légale de conformité. En cas de produit
          défectueux ou non conforme, contactez le vendeur avec votre numéro de commande.
        </p>

        <h2>10. Remboursements</h2>
        <p>
          Les remboursements éventuels sont effectués via Stripe, sur le moyen de paiement
          utilisé lors de la commande. Le statut de la commande passe alors à
          « Remboursée ».
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
