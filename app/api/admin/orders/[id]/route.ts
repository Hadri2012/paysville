import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { notifyOrderStatus } from "@/lib/notify";
import {
  collectDeliveryPayment,
  releasePromotionUse,
  restockOrder,
  setOrderStatus,
} from "@/lib/orders";
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

    // Renseigné quand ce PATCH fait réellement changer d'étape : c'est ce qui
    // déclenche l'e-mail au client, une fois la transaction validée.
    let reached: { status: OrderStatus; note: string } | null = null;

    const order = await transaction((state) => {
      const found = state.orders.find((o) => o.id === id);
      if (!found) throw errors.orderNotFound();

      if (body.adminNote !== undefined) {
        found.adminNote = cleanString(body.adminNote, 1000);
        found.updatedAt = new Date().toISOString();
      }

      // Encaissement à la livraison (espèces ou carte sur le terminal), indépendant
      // d'un changement de statut : selon la tournée, l'argent est parfois compté
      // avant que la commande ne soit marquée livrée (au moment de la remise),
      // parfois après (au retour, à la caisse). Passer par « delivered » y suffit
      // déjà (voir plus bas) ; ce geste couvre l'autre ordre.
      if (body.markDeliveryPaymentCollected === true) {
        if (!collectDeliveryPayment(found)) {
          throw errors.validation(
            "Rien à encaisser pour cette commande (déjà réglée, ou annulée).",
          );
        }
      }

      if (body.status !== undefined) {
        const status = cleanString(body.status, 40) as OrderStatus;
        if (!ORDER_STATUSES.includes(status)) {
          throw errors.validation("Statut de commande inconnu.");
        }
        if (status !== found.status) {
          const wasClosed = CLOSED.includes(found.status);
          // Annulation / remboursement d'une commande ferme : le stock repart en
          // rayon, et le code promo éventuellement utilisé rend son utilisation.
          //
          // Le critère est « le stock est engagé », pas « la commande est
          // payée » : une commande réglée en espèces à la livraison a son stock
          // hors catalogue sans avoir encore rien encaissé, et l'annuler doit
          // rendre les articles comme pour n'importe quelle autre.
          if (CLOSED.includes(status) && !wasClosed && found.stockCommitted) {
            restockOrder(state, found);
            releasePromotionUse(state, found);
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
          // Commande remise en main propre contre espèces ou carte sur le
          // terminal du livreur : la livraison *est* l'encaissement. Laisser la
          // commande « livrée mais impayée » forcerait la boutique à un second
          // geste pour chaque tournée, qu'elle oublierait — et fausserait le
          // chiffre d'affaires d'autant.
          if (status === "delivered") collectDeliveryPayment(found);
          const note = cleanString(body.statusNote, 200);
          setOrderStatus(
            state.orders.find((o) => o.id === id)!,
            status,
            note || "Statut modifié depuis l'administration.",
          );
          reached = { status, note };
        }
      }

      return found;
    });

    // Après validation de la transaction : l'e-mail ne doit partir que si le
    // changement d'étape est bien enregistré. La note de la boutique (numéro de
    // suivi, motif) accompagne le message quand elle a été saisie ; la phrase de
    // repli, elle, ne dit rien au client et reste interne.
    if (reached) {
      const { status, note } = reached as { status: OrderStatus; note: string };
      await notifyOrderStatus(id, status, note);
    }

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

      if (order.stockCommitted && !CLOSED.includes(order.status)) {
        restockOrder(state, order);
        releasePromotionUse(state, order);
      }

      state.reservations = state.reservations.filter((r) => r.orderId !== id);
      state.orders = state.orders.filter((o) => o.id !== id);
    });

    return jsonOk({ deleted: true });
  });
}
