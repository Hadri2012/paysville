import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { RequestActions } from "@/components/admin/RequestActions";
import { requireAdminPage } from "@/lib/adminGuard";
import { formatIsoDisplay, formatLocalDisplay } from "@/lib/datetime";
import { readState } from "@/lib/store";
import { REQUEST_STATUS_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Détail de la demande" };

export default async function AdminRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const state = await readState();
  const request = state.requests.find((r) => r.id === id);
  if (!request) notFound();

  const bike = state.bikes.find((b) => b.kind === request.bikeKind);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <nav className="breadcrumb">
            <Link href="/admin/demandes">← Toutes les demandes</Link>
          </nav>
          <h1 className="mono">{request.number}</h1>
          <p>
            {request.customer.firstName} {request.customer.lastName} ·{" "}
            <a href={`mailto:${request.customer.email}`}>{request.customer.email}</a> ·{" "}
            <a href={`tel:${request.customer.phone}`}>{request.customer.phone}</a>
          </p>
        </div>
        <StatusBadge status={request.status} large />
      </div>

      <div className="request-layout">
        <div className="stack-lg">
          <section className="card">
            <h3 className="card-title">Location demandée</h3>
            <dl className="kv">
              <div>
                <dt>Vélo</dt>
                <dd>{bike?.name ?? request.bikeKind}</dd>
              </div>
              <div>
                <dt>Début</dt>
                <dd>{formatLocalDisplay(request.startAt)}</dd>
              </div>
              <div>
                <dt>Fin</dt>
                <dd>{formatLocalDisplay(request.endAt)}</dd>
              </div>
              <div>
                <dt>Conditions acceptées</dt>
                <dd>{formatIsoDisplay(request.termsAcceptedAt)}</dd>
              </div>
            </dl>
            {request.message ? (
              <div className="notice-box" style={{ marginTop: 14 }}>
                <strong>Message du client :</strong> {request.message}
              </div>
            ) : null}
          </section>

          <section className="card">
            <h3 className="card-title">Historique</h3>
            <ul className="timeline">
              {request.statusHistory.map((event, index) => (
                <li key={index}>
                  <strong>{REQUEST_STATUS_LABELS[event.status]}</strong>
                  <div className="small muted">{formatIsoDisplay(event.at)}</div>
                  {event.note ? <div className="small">{event.note}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <h3 className="card-title">Gestion</h3>
            <RequestActions
              requestId={request.id}
              requestNumber={request.number}
              status={request.status}
              adminComment={request.adminComment}
              internalNote={request.internalNote}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
