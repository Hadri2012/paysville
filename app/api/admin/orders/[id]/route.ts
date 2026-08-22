import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { notifyOrderStatus } from "@/lib/notifications";
import { restockOrder, setOrderStatus } from "@/lib/orders";
import { transaction } from "@/lib/store";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const CLOSED: OrderStatus[] = ["canceled", "refunded"];

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const { order, statusChanged } = await transaction((state) => {
      const found = state.orders.find((o) => o.id === id);
      if (!found) throw errors.orderNotFound();
      let statusChanged = false;

      if (body.adminNote !== undefined) {
        found.adminNote = cleanString(body.adminNote, 1000);
        found.updatedAt = new Date().toISOString();
      }

      if (body.status !== undefined) {
        const status = cleanString(body.status, 40) as OrderStatus;
        if (!ORDER_STATUSES.includes(status)) {
          throw errors.validation("Statut de commande inconnu.");
        }
        if (status !== found.status) {
          const wasClosed = CLOSED.includes(found.status);
          // Annulation / remboursement d'une commande payée : le stock repart en rayon.
          if (CLOSED.includes(status) && !wasClosed && found.paymentStatus === "paid") {
            restockOrder(state, found);
          }
          // Annulation avant paiement : on libère la réservation.
          if (CLOSED.includes(status) && found.paymentStatus === "pending") {
            for (const reservation of state.reservations) {
              if (reservation.orderId === found.id && reservation.status === "active") {
                reservation.status = "released";
              }
            }
            found.paymentStatus = "canceled";
          }
          if (status === "refunded") found.paymentStatus = "refunded";
          setOrderStatus(
            state.orders.find((o) => o.id === id)!,
            status,
            cleanString(body.statusNote, 200) || "Statut modifié depuis l'administration.",
          );
          statusChanged = true;
        }
      }

      return { order: found, statusChanged };
    });

    // Hors transaction, et sans jamais faire échouer la mise à jour : le client est
    // prévenu du nouveau statut (« prête », « expédiée »…). Les statuts qui ne le
    // concernent pas sont ignorés côté gabarit.
    if (statusChanged) await notifyOrderStatus(order, request);

    return jsonOk({ order });
  });
}

/**
 * Suppression définitive d'une commande (bouton corbeille de l'admin) : contrairement
 * à une annulation, la commande disparaît entièrement — plus aucune trace, y compris
 * dans l'historique et le chiffre d'affaires. Si elle était payée et pas déjà
 * annulée/remboursée, le stock correspondant est remis en rayon pour ne pas le perdre.
 */
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    await transaction((state) => {
      const order = state.orders.find((o) => o.id === id);
      if (!order) throw errors.orderNotFound();

      if (order.paymentStatus === "paid" && !CLOSED.includes(order.status)) {
        restockOrder(state, order);
      }

      state.reservations = state.reservations.filter((r) => r.orderId !== id);
      state.orders = state.orders.filter((o) => o.id !== id);
    });

    return jsonOk({ deleted: true });
  });
}
