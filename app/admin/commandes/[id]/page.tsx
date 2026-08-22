import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderDetails, PaymentBadge } from "@/components/OrderDetails";
import { DeleteOrderButton } from "@/components/admin/DeleteOrderButton";
import { OrderStatusEditor } from "@/components/admin/OrderStatusEditor";
import { requireAdminPage } from "@/lib/adminGuard";
import { publicOrderView } from "@/lib/orders";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Détail de commande" };

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const state = await readState();
  const order = state.orders.find((item) => item.id === id);
  if (!order) notFound();

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <nav className="breadcrumb">
            <Link href="/admin/commandes">← Toutes les commandes</Link>
          </nav>
          <h1 className="mono">{order.number}</h1>
          <p>
            {order.customer.firstName} {order.customer.lastName} ·{" "}
            <a href={`mailto:${order.customer.email}`}>{order.customer.email}</a> ·{" "}
            <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a>
          </p>
        </div>
      </div>

      {order.stockWarning ? (
        <div className="alert alert-error">
          <span>{order.stockWarning}</span>
        </div>
      ) : null}

      <div className="cart-layout">
        <div>
          <OrderDetails order={publicOrderView(order)} />
        </div>

        <aside className="stack">
          <section className="card">
            <h3 className="card-title">Gestion</h3>
            <OrderStatusEditor
              orderId={order.id}
              status={order.status}
              adminNote={order.adminNote}
            />
          </section>

          <section className="card">
            <h3 className="card-title">Zone dangereuse</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              Supprime la commande entièrement, sans laisser de trace.
            </p>
            <DeleteOrderButton
              orderId={order.id}
              orderNumber={order.number}
              redirectTo="/admin/commandes"
              label="Supprimer la commande"
            />
          </section>

          <section className="card">
            <h3 className="card-title">Paiement Stripe</h3>
            <dl className="kv">
              <div>
                <dt>État</dt>
                <dd>
                  <PaymentBadge status={order.paymentStatus} />
                </dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd className="mono small" style={{ wordBreak: "break-all" }}>
                  {order.stripeSessionId ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Payment Intent</dt>
                <dd className="mono small" style={{ wordBreak: "break-all" }}>
                  {order.stripePaymentIntentId ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Consentement CGV</dt>
                <dd>{order.consent.terms ? "Oui" : "Non"}</dd>
              </div>
              <div>
                <dt>Communications</dt>
                <dd>{order.consent.marketing ? "Acceptées" : "Refusées"}</dd>
              </div>
            </dl>
            <p className="small muted" style={{ marginTop: 12 }}>
              Les remboursements s&apos;effectuent depuis le tableau de bord Stripe. Le
              webhook met alors automatiquement la commande à jour.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
