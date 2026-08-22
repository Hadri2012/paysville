import type { Metadata } from "next";
import Link from "next/link";
import { formatPrice } from "@/lib/money";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zone de livraison",
  description: "Communes et codes postaux desservis par Hadrishop.",
};

export default async function ShippingPage() {
  const state = await readState();
  const zones = state.shippingZones.filter((zone) => zone.active);
  const { currency, defaultShippingFeeCents, freeShippingThresholdCents } = state.settings;

  return (
    <main className="page">
      <div className="container page-narrow stack-lg prose">
        <div>
          <h1>Zone de livraison</h1>
          <p className="muted">
            Hadrishop est une petite boutique locale : les commandes sont livrées
            uniquement dans les communes listées ci-dessous.
          </p>
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
                {zones.map((zone) => (
                  <tr key={zone.id}>
                    <td className="mono">{zone.postalCode}</td>
                    <td>
                      {zone.cities.length > 0
                        ? zone.cities.join(", ")
                        : "Toutes les communes de ce code postal"}
                    </td>
                    <td className="num">
                      {(zone.feeCents ?? defaultShippingFeeCents) > 0
                        ? formatPrice(zone.feeCents ?? defaultShippingFeeCents, currency)
                        : "Offerte"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {freeShippingThresholdCents !== null ? (
          <div className="notice-box">
            Livraison offerte à partir de{" "}
            {formatPrice(freeShippingThresholdCents, currency)} d&apos;achat.
          </div>
        ) : null}

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
