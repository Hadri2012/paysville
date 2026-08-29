import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm } from "@/components/RequestForm";
import { bikeImage } from "@/lib/images";
import { readState } from "@/lib/store";
import { BIKE_KINDS, type BikeKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return { title: BIKE_KINDS.includes(kind as BikeKind) ? `Demande — ${kind}` : "Demande" };
}

export default async function RequestPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!BIKE_KINDS.includes(kind as BikeKind)) notFound();

  const state = await readState();
  const bike = state.bikes.find((b) => b.kind === kind);
  if (!bike) notFound();

  if (!bike.active) {
    return (
      <main className="page">
        <div className="container page-narrow">
          <div className="empty-state">
            <h2>{bike.name} indisponible</h2>
            <p>
              Ce vélo n&apos;est actuellement pas disponible à la location. Merci de
              consulter l&apos;autre vélo ou de réessayer plus tard.
            </p>
            <Link href="/" className="btn btn-primary" style={{ marginTop: 12 }}>
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container page-narrow stack-lg">
        <nav className="breadcrumb">
          <Link href="/">← Retour à l&apos;accueil</Link>
        </nav>

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={bikeImage(bike)}
            alt={bike.name}
            style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 12 }}
          />
          <div>
            <h1 style={{ margin: 0 }}>Demande — {bike.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              Remplissez ce formulaire pour demander la location. Votre demande devra
              ensuite être acceptée par le propriétaire.
            </p>
          </div>
        </div>

        <RequestForm bikeKind={bike.kind} bikeName={bike.name} />
      </div>
    </main>
  );
}
