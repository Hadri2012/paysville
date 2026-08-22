import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
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

    const order = await transaction((state) => {
      const found = state.orders.find((o) => o.id === id);
      if (!found) throw errors.orderNotFound();

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
        }
      }

      return found;
    });

    return jsonOk({ order });
  });
}
