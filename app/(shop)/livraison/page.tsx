import type { Metadata } from "next";
import Link from "next/link";
import { MAX_DELIVERY_DISTANCE_KM, SHOP_HUB_POSTAL_CODE } from "@/lib/geo";
import { formatPrice } from "@/lib/money";
import { previewZoneFeeCents } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zone de livraison",
  description: "Communes et codes postaux desservis par Hadrishop.",
};

export default async function ShippingPage() {
  const state = await readState();
  const zones = state.shippingZones
    .filter((zone) => zone.active)
    .sort((a, b) => {
      if (a.postalCode === SHOP_HUB_POSTAL_CODE) return -1;
      if (b.postalCode === SHOP_HUB_POSTAL_CODE) return 1;
      return a.postalCode.localeCompare(b.postalCode);
    });
  const { currency, defaultShippingFeeCents } = state.settings;

  return (
    <main className="page">
      <div className="container page-narrow stack-lg prose">
        <div>
          <h1>Zone de livraison</h1>
          <p className="muted">
            Hadrishop est une petite boutique locale : les objets sont livrés uniquement
            dans les communes listées ci-dessous.
          </p>
        </div>

        <div className="notice-box">
          <strong>Vous achetez un fichier ?</strong> Aucune livraison n&apos;est
          nécessaire et aucun frais n&apos;est facturé : les fichiers numériques (modèles
          3D, documents, archives) sont téléchargeables dès la confirmation du paiement,
          depuis la page de confirmation et depuis votre{" "}
          <Link href="/suivi">suivi de commande</Link>, où que vous soyez. La zone
          ci-dessous ne concerne que les objets expédiés.
        </div>

        {zones.length === 0 ? (
          <div className="alert alert-warning">
            Aucune zone de livraison n&apos;est configurée pour le moment.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code postal</th>
                  <th>Communes desservies</th>
                  <th className="num">Frais de livraison</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => {
                  const feeCents = previewZoneFeeCents(zone, defaultShippingFeeCents);
                  return (
                    <tr key={zone.id}>
                      <td className="mono">{zone.postalCode}</td>
                      <td>
                        {zone.cities.length > 0
                          ? zone.cities.join(", ")
                          : "Toutes les communes de ce code postal"}
                      </td>
                      <td className="num">
                        {feeCents > 0 ? formatPrice(feeCents, currency) : "Offerte"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="notice-box">
          Livraison offerte uniquement à {SHOP_HUB_POSTAL_CODE} (Mont-Saint-Guibert).
          Au-delà, les frais sont calculés selon la distance (2&nbsp;€ par 5&nbsp;km), dans
          un rayon de {MAX_DELIVERY_DISTANCE_KM}&nbsp;km autour du magasin — Gembloux
          compris.
        </div>

        <section>
          <h2>Comment ça marche ?</h2>
          <ul>
            <li>
              Lors de la commande, votre code postal et votre commune sont vérifiés par
              notre serveur.
            </li>
            <li>
              Si l&apos;adresse n&apos;est pas desservie, la commande est bloquée avant le
              paiement : vous ne payez jamais pour une livraison impossible.
            </li>
            <li>
              Les frais de livraison éventuels sont ajoutés au récapitulatif avant le
              paiement.
            </li>
            <li>
              Une commande qui ne contient que des fichiers échappe entièrement à cette
              vérification : l&apos;adresse postale y devient facultative, et la ligne
              « Livraison » du récapitulatif est remplacée par « Téléchargement ».
            </li>
            <li>
              Une commande mixte (un objet et un fichier) est livrée normalement pour
              l&apos;objet ; le fichier, lui, est disponible dès le paiement confirmé,
              sans attendre l&apos;expédition.
            </li>
          </ul>
        </section>

        <p>
          Votre commune n&apos;apparaît pas ? La zone de livraison peut évoluer :
          n&apos;hésitez pas à nous écrire.{" "}
          <Link href="/boutique">Retour à la boutique</Link>
        </p>
      </div>
    </main>
  );
}
