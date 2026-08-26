"use client";

import { useState } from "react";
import { fileExtension, formatBytes, isDigitalOnly } from "@/lib/digital";
import { formatPrice } from "@/lib/money";
import type { PublicOrderView } from "@/lib/orders";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/types";
import { OrderTimeline } from "./OrderTimeline";
import { EditAddressModal } from "./EditAddressModal";

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

export function PaymentBadge({
  status,
  paymentMethod,
}: {
  status: PaymentStatus;
  /**
   * Une commande en espèces reste « en attente » jusqu'à la livraison — c'est
   * l'état normal, pas un problème de paiement. Sans cette distinction, le
   * badge orange « En attente » se lirait comme une alerte sur une commande
   * qui suit pourtant son cours normal.
   */
  paymentMethod?: PaymentMethod;
}) {
  if (status === "pending" && paymentMethod === "cash_on_delivery") {
    return <span className="badge badge-info">Paiement : espèces à la livraison</span>;
  }
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

/**
 * Fichiers achetés, remis dès le paiement confirmé. Les liens portent le jeton
 * d'accès de la commande : ils fonctionnent tant que la commande y donne droit,
 * sans compte client, et restent inutilisables pour qui ne les a pas reçus.
 */
function Downloads({ order }: { order: PublicOrderView }) {
  const awaiting =
    order.downloads.length === 0 && order.items.some((item) => item.kind === "digital");

  if (awaiting) {
    return (
      <section className="card">
        <h3 className="card-title">Mes fichiers</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {order.paymentStatus === "paid"
            ? "Cette commande ne donne plus accès à ses fichiers. Contactez la boutique en précisant votre numéro de commande."
            : "Vos fichiers apparaîtront ici dès que le paiement sera confirmé."}
        </p>
      </section>
    );
  }

  if (order.downloads.length === 0) return null;

  return (
    <section className="card">
      <h3 className="card-title">Mes fichiers</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        Téléchargez-les autant de fois que nécessaire : ce lien reste valable depuis
        votre suivi de commande.
      </p>
      <div className="stack">
        {order.downloads.map((group) => (
          <div key={group.productId}>
            <strong className="small">{group.productName}</strong>
            <ul className="download-list">
              {group.files.map((file) => (
                <li key={file.url}>
                  <a className="btn btn-secondary btn-sm" href={file.url} download>
                    ⬇ {file.name}
                  </a>
                  <span className="small muted">
                    {fileExtension(file.name) ? `${fileExtension(file.name)} · ` : ""}
                    {formatBytes(file.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OrderDetails({ order: initialOrder }: { order: PublicOrderView }) {
  const [order, setOrder] = useState(initialOrder);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const digitalOnly = isDigitalOnly(order.items);

  const canEditAddress = ["awaiting_payment", "paid", "preparing", "ready"].includes(
    order.status,
  );

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
            <PaymentBadge status={order.paymentStatus} paymentMethod={order.paymentMethod} />
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
                    {item.kind === "digital" ? (
                      <span className="badge badge-info" style={{ marginLeft: 8 }}>
                        Fichier
                      </span>
                    ) : null}
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
            <span>{digitalOnly ? "Remise" : "Livraison"}</span>
            <strong>
              {digitalOnly
                ? "Téléchargement"
                : order.shippingCents > 0
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

      <Downloads order={order} />

      <div className="detail-grid">
        <section className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3 className="card-title" style={{ margin: 0 }}>
              {digitalOnly ? "Facturation" : "Livraison"}
            </h3>
            {canEditAddress && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditModalOpen(true)}
                aria-label="Modifier l'adresse"
              >
                ✎ Modifier
              </button>
            )}
          </div>
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
          <OrderTimeline
            status={order.status}
            statusHistory={order.statusHistory}
            paymentMethod={order.paymentMethod}
          />
        </section>
      </div>

      {editModalOpen && (
        <EditAddressModal
          order={order}
          digitalOnly={digitalOnly}
          onAddressUpdated={setOrder}
          onClose={() => setEditModalOpen(false)}
        />
      )}
    </div>
  );
}
