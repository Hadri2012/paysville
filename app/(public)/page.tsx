import Link from "next/link";
import { bikeImage } from "@/lib/images";
import { readState } from "@/lib/store";
import type { Bike } from "@/lib/types";

export const dynamic = "force-dynamic";

function BikeCard({ bike }: { bike: Bike }) {
  return (
    <article className="bike-card">
      <div className="bike-media">
        <img src={bikeImage(bike)} alt={bike.name} />
        {!bike.active ? <span className="badge badge-danger">Indisponible</span> : null}
      </div>
      <div className="bike-body">
        <h2 className="bike-name">{bike.name}</h2>
        <p className="bike-desc">{bike.description}</p>
        {bike.features.length > 0 ? (
          <ul className="bike-features">
            {bike.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        ) : null}
        <div className="bike-actions">
          {bike.active ? (
            <Link href={`/demande/${bike.kind}`} className="btn btn-primary btn-lg btn-block">
              Demander ce vélo
            </Link>
          ) : (
            <button type="button" className="btn btn-secondary btn-lg btn-block" disabled>
              Actuellement indisponible
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const state = await readState();
  const normal = state.bikes.find((b) => b.kind === "normal");
  const electric = state.bikes.find((b) => b.kind === "electric");

  return (
    <main className="page">
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="eyebrow">Location de vélo sur demande</span>
            <h1>Réservez un vélo en quelques minutes</h1>
            <p className="lead">
              Choisissez votre vélo, indiquez la période souhaitée et envoyez votre
              demande. Elle est ensuite étudiée et acceptée (ou refusée) par le
              propriétaire — aucun paiement en ligne n&apos;est demandé.
            </p>
            <div className="btn-row" style={{ marginTop: 20 }}>
              <a href="#velos" className="btn btn-primary btn-lg">
                Voir les vélos
              </a>
              <Link href="/suivi" className="btn btn-secondary btn-lg">
                Suivre une demande
              </Link>
            </div>
          </div>
          <div className="hero-card">
            <h3>Comment ça marche ?</h3>
            <ul>
              <li>Choisissez un vélo normal ou électrique.</li>
              <li>Indiquez la période souhaitée et vos coordonnées.</li>
              <li>Recevez un numéro de demande unique.</li>
              <li>Le propriétaire accepte ou refuse votre demande.</li>
              <li>Suivez le statut à tout moment avec votre numéro.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="velos" className="container" style={{ padding: "48px 0" }}>
        <div className="page-head">
          <div>
            <h2>Nos vélos</h2>
            <p>Deux vélos disponibles à la location, chacun réservé individuellement.</p>
          </div>
        </div>
        <div className="bike-grid">
          {normal ? <BikeCard bike={normal} /> : null}
          {electric ? <BikeCard bike={electric} /> : null}
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 48 }}>
        <div className="feature-grid">
          <div className="feature">
            <div className="icon" aria-hidden="true">
              1
            </div>
            <h3>Aucun paiement en ligne</h3>
            <p>Le site sert uniquement à envoyer et suivre des demandes de location.</p>
          </div>
          <div className="feature">
            <div className="icon" aria-hidden="true">
              2
            </div>
            <h3>Réponse rapide</h3>
            <p>Chaque demande est étudiée individuellement par le propriétaire.</p>
          </div>
          <div className="feature">
            <div className="icon" aria-hidden="true">
              3
            </div>
            <h3>Suivi simple</h3>
            <p>Retrouvez votre demande à tout moment avec son numéro et votre e-mail.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
