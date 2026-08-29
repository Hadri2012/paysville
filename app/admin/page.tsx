import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdminPage } from "@/lib/adminGuard";
import { isBikeCurrentlyRented, upcomingAcceptedRequests } from "@/lib/availability";
import { formatIsoDisplay, formatLocalDisplay } from "@/lib/datetime";
import { isEmailConfigured } from "@/lib/email";
import { getStore, readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tableau de bord" };

export default async function AdminDashboard() {
  await requireAdminPage();
  const state = await readState();

  const pending = state.requests.filter((r) => r.status === "pending");
  const accepted = state.requests.filter((r) => r.status === "accepted");
  const refused = state.requests.filter((r) => r.status === "refused");
  const upcoming = upcomingAcceptedRequests(state).slice(0, 6);

  const recent = [...state.requests]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const normal = state.bikes.find((b) => b.kind === "normal");
  const electric = state.bikes.find((b) => b.kind === "electric");

  const warnings: string[] = [];
  if (getStore().driver === "file") {
    warnings.push(
      "Les données sont stockées dans un fichier local (.data/veloloc.json). Définissez DATABASE_URL pour une base PostgreSQL persistante en production.",
    );
  }
  if (!isEmailConfigured()) {
    warnings.push(
      "Aucun service d'e-mail n'est configuré (RESEND_API_KEY / EMAIL_FROM) : les notifications automatiques sont désactivées, mais le site fonctionne normalement.",
    );
  }
  if (!state.settings.contactEmail) {
    warnings.push(
      "Aucune adresse e-mail de contact (ADMIN_EMAIL) : vous ne recevrez pas de notification lors d'une nouvelle demande.",
    );
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Tableau de bord</h1>
          <p>Vue d&apos;ensemble des demandes de location.</p>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="alert alert-warning">
          <div>
            <strong>À vérifier :</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <section className="stat-grid">
        <div className="stat">
          <div className="label">En attente</div>
          <div className="value">{pending.length}</div>
          <div className="sub">demande(s) à traiter</div>
        </div>
        <div className="stat">
          <div className="label">Acceptées</div>
          <div className="value">{accepted.length}</div>
          <div className="sub">location(s) confirmée(s)</div>
        </div>
        <div className="stat">
          <div className="label">Refusées</div>
          <div className="value">{refused.length}</div>
          <div className="sub">demande(s) refusée(s)</div>
        </div>
        <div className="stat">
          <div className="label">Vélo normal</div>
          <div className="value">
            {!normal?.active ? "Désactivé" : isBikeCurrentlyRented(state, "normal") ? "Loué" : "Libre"}
          </div>
          <div className="sub">disponibilité actuelle</div>
        </div>
        <div className="stat">
          <div className="label">Vélo électrique</div>
          <div className="value">
            {!electric?.active ? "Désactivé" : isBikeCurrentlyRented(state, "electric") ? "Loué" : "Libre"}
          </div>
          <div className="sub">disponibilité actuelle</div>
        </div>
      </section>

      <section>
        <div className="page-head">
          <h2>Prochaines locations</h2>
          <Link href="/admin/calendrier" className="btn btn-secondary btn-sm">
            Voir le calendrier
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty-state">Aucune location acceptée à venir.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Vélo</th>
                  <th>Client</th>
                  <th>Début</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/demandes/${r.id}`} className="mono">
                        {r.number}
                      </Link>
                    </td>
                    <td>{r.bikeKind === "normal" ? "Vélo normal" : "Vélo électrique"}</td>
                    <td>
                      {r.customer.firstName} {r.customer.lastName}
                    </td>
                    <td className="small">{formatLocalDisplay(r.startAt)}</td>
                    <td className="small">{formatLocalDisplay(r.endAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="page-head">
          <h2>Demandes récentes</h2>
          <Link href="/admin/demandes" className="btn btn-secondary btn-sm">
            Toutes les demandes
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty-state">Aucune demande pour le moment.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Client</th>
                  <th>Vélo</th>
                  <th>Statut</th>
                  <th>Créée le</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/demandes/${r.id}`} className="mono">
                        {r.number}
                      </Link>
                    </td>
                    <td>
                      {r.customer.firstName} {r.customer.lastName}
                    </td>
                    <td>{r.bikeKind === "normal" ? "Vélo normal" : "Vélo électrique"}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="small muted">{formatIsoDisplay(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
