import Link from "next/link";
import { PaymentBadge, StatusBadge } from "@/components/OrderDetails";
import { requireAdminPage } from "@/lib/adminGuard";
import { formatPrice } from "@/lib/money";
import { readState } from "@/lib/store";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Commandes" };

interface SearchParams {
  q?: string;
  statut?: string;
  paiement?: string;
  du?: string;
  au?: string;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminPage();
  const filters = await searchParams;
  const state = await readState();

  const query = (filters.q ?? "").trim().toLowerCase();
  const status = filters.statut ?? "";
  const payment = filters.paiement ?? "";
  const from = filters.du ? Date.parse(`${filters.du}T00:00:00`) : null;
  const to = filters.au ? Date.parse(`${filters.au}T23:59:59`) : null;

  const orders = [...state.orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((order) => {
      if (status && order.status !== status) return false;
      if (payment && order.paymentStatus !== payment) return false;
      const created = Date.parse(order.createdAt);
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      if (query) {
        const haystack = [
          order.number,
          order.customer.firstName,
          order.customer.lastName,
          order.customer.email,
          order.customer.phone,
          order.address.city,
          order.address.postalCode,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

  const revenue = orders
    .filter((order) => order.paymentStatus === "paid")
    .reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Commandes</h1>
          <p>
            {orders.length} commande(s) affichée(s) —{" "}
            {formatPrice(revenue, state.settings.currency)} encaissés sur cette sélection.
          </p>
        </div>
      </div>

      <form className="card admin-row" method="get" style={{ marginBottom: 0 }}>
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="q">Recherche</label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Numéro, nom, e-mail, ville…"
          />
        </div>
        <div className="field">
          <label htmlFor="statut">Statut</label>
          <select id="statut" name="statut" defaultValue={status}>
            <option value="">Tous</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value as OrderStatus]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="paiement">Paiement</label>
          <select id="paiement" name="paiement" defaultValue={payment}>
            <option value="">Tous</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PAYMENT_STATUS_LABELS[value as PaymentStatus]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="du">Du</label>
          <input id="du" name="du" type="date" defaultValue={filters.du ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="au">Au</label>
          <input id="au" name="au" type="date" defaultValue={filters.au ?? ""} />
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn-primary">
            Filtrer
          </button>
          <Link href="/admin/commandes" className="btn btn-secondary">
            Réinitialiser
          </Link>
        </div>
      </form>

      {orders.length === 0 ? (
        <div className="empty-state">Aucune commande ne correspond à ces critères.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Date</th>
                <th>Client</th>
                <th>Livraison</th>
                <th>Statut</th>
                <th>Paiement</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/admin/commandes/${order.id}`} className="mono">
                      {order.number}
                    </Link>
                    {order.stockWarning ? (
                      <div>
                        <span className="badge badge-danger">Stock à vérifier</span>
                      </div>
                    ) : null}
                  </td>
                  <td className="small muted nowrap">
                    {new Date(order.createdAt).toLocaleString("fr-BE", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: "Europe/Brussels",
                    })}
                  </td>
                  <td>
                    {order.customer.firstName} {order.customer.lastName}
                    <div className="small muted">{order.customer.email}</div>
                  </td>
                  <td className="small">
                    {order.address.postalCode} {order.address.city}
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                  <td>
                    <PaymentBadge status={order.paymentStatus} />
                  </td>
                  <td className="num">{formatPrice(order.totalCents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
