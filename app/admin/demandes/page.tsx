import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { requireAdminPage } from "@/lib/adminGuard";
import { formatIsoDisplay, formatLocalDisplay } from "@/lib/datetime";
import { readState } from "@/lib/store";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Demandes" };

interface SearchParams {
  statut?: string;
  q?: string;
}

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Toutes" },
  { value: "pending", label: "En attente" },
  { value: "accepted", label: "Acceptées" },
  { value: "refused", label: "Refusées" },
  { value: "completed", label: "Terminées" },
];

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminPage();
  const filters = await searchParams;
  const state = await readState();

  const statusFilter = filters.statut ?? "";
  const query = (filters.q ?? "").trim().toLowerCase();

  const requests = [...state.requests]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (query) {
        const haystack = [
          r.number,
          r.customer.firstName,
          r.customer.lastName,
          r.customer.email,
          r.customer.phone,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Demandes</h1>
          <p>{requests.length} demande(s) affichée(s).</p>
        </div>
      </div>

      <div className="btn-row">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/demandes?statut=${f.value}` : "/admin/demandes"}
            className={`btn btn-sm ${statusFilter === f.value ? "btn-primary" : "btn-secondary"}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <form className="card admin-row" method="get" style={{ marginBottom: 0 }}>
        {statusFilter ? <input type="hidden" name="statut" value={statusFilter} /> : null}
        <div className="field" style={{ flex: "1 1 260px" }}>
          <label htmlFor="q">Recherche</label>
          <input id="q" name="q" defaultValue={filters.q ?? ""} placeholder="Numéro, nom, e-mail…" />
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">
            Filtrer
          </button>
          <Link href="/admin/demandes" className="btn btn-secondary">
            Réinitialiser
          </Link>
        </div>
      </form>

      {requests.length === 0 ? (
        <div className="empty-state">Aucune demande ne correspond à ces critères.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Vélo</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Statut</th>
                <th>Créée le</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/demandes/${r.id}`} className="mono">
                      {r.number}
                    </Link>
                  </td>
                  <td>
                    {r.customer.firstName} {r.customer.lastName}
                    <div className="small muted">{r.customer.email}</div>
                  </td>
                  <td>{r.bikeKind === "normal" ? "Vélo normal" : "Vélo électrique"}</td>
                  <td className="small">{formatLocalDisplay(r.startAt)}</td>
                  <td className="small">{formatLocalDisplay(r.endAt)}</td>
                  <td>
                    <StatusBadge status={r.status as RequestStatus} />
                  </td>
                  <td className="small muted nowrap">{formatIsoDisplay(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">
        Statuts disponibles : {REQUEST_STATUSES.map((s) => REQUEST_STATUS_LABELS[s]).join(", ")}.
      </p>
    </div>
  );
}
