import { formatPrice } from "@/lib/money";
import type { PublicOrderView } from "@/lib/orders";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/types";
import { OrderTimeline } from "./OrderTimeline";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = {
    awaiting_payment: "badge-warning",
    paid: "badge-success",
    preparing: "badge-info",
    ready: "badge-info",
    shipped: "badge-info",
    delivered: "badge-success",
    canceled: "badge-danger",
    refunded: "badge-danger",
  };
  return (
    <span className={`badge ${tone[status]} badge-dot`}>{ORDER_STATUS_LABELS[status]}</span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone: Record<PaymentStatus, string> = {
    pending: "badge-warning",
    paid: "badge-success",
    failed: "badge-danger",
    canceled: "badge-danger",
    refunded: "badge-warning",
  };
  return (
    <span className={`badge ${tone[status]}`}>
      Paiement : {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
}

export function OrderDetails({ order }: { order: PublicOrderView }) {
  return (
    <div className="stack-lg">
      <section className="card">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div>
            <div className="product-sku">Commande</div>
            <h2 className="mono" style={{ margin: 0 }}>
              {order.number}
            </h2>
            <p className="small muted" style={{ margin: 0 }}>
              Passée le {formatDate(order.createdAt)}
            </p>
          </div>
          <div className="btn-row">
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} />
          </div>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Articles</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produit</th>
                <th className="num">Prix unitaire</th>
                <th className="num">Qté</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.sku + item.name}>
                  <td>
                    <strong>{item.name}</strong>
                    <div className="product-sku">{item.sku}</div>
                  </td>
                  <td className="num">
                    {formatPrice(item.unitPriceCents, order.currency)}
                  </td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">
                    {formatPrice(item.lineTotalCents, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ maxWidth: 340, marginLeft: "auto", marginTop: 16 }}>
          <div className="summary-row">
            <span>Sous-total</span>
            <strong>{formatPrice(order.subtotalCents, order.currency)}</strong>
          </div>
          {order.discountCents > 0 ? (
            <div className="summary-row summary-discount">
              <span>Remise {order.promoCode ? `(${order.promoCode})` : ""}</span>
              <strong>− {formatPrice(order.discountCents, order.currency)}</strong>
            </div>
          ) : null}
          <div className="summary-row">
            <span>Livraison</span>
            <strong>
              {order.shippingCents > 0
                ? formatPrice(order.shippingCents, order.currency)
                : "Offerte"}
            </strong>
          </div>
          <div className="summary-row summary-total">
            <span>Total</span>
            <span>{formatPrice(order.totalCents, order.currency)}</span>
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <section className="card">
          <h3 className="card-title">Livraison</h3>
          <p className="small" style={{ margin: 0 }}>
            {order.customer.firstName} {order.customer.lastName}
            <br />
            {order.address.street} {order.address.streetNumber}
            {order.address.complement ? (
              <>
                <br />
                {order.address.complement}
              </>
            ) : null}
            <br />
            {order.address.postalCode} {order.address.city}
            <br />
            {order.address.country}
          </p>
          {order.note ? (
            <p className="small muted" style={{ marginTop: 12 }}>
              <strong>Remarque :</strong> {order.note}
            </p>
          ) : null}
        </section>

        <section className="card">
          <h3 className="card-title">Suivi</h3>
          <OrderTimeline status={order.status} statusHistory={order.statusHistory} />
        </section>
      </div>
    </div>
  );
}
