import { isNotifiedStatus, renderOrderEmail } from "./email/orderEmails";
import { sendEmail, type EmailOutcome } from "./email/transport";
import { siteUrl } from "./siteUrl";
import { transaction } from "./store";
import type { Order, OrderStatus, Settings } from "./types";

/**
 * Envoi des e-mails de suivi de commande.
 *
 * ## Au plus un e-mail par étape
 *
 * La réservation se fait **dans la transaction** qui lit la commande : deux
 * webhooks Stripe livrés en même temps, ou une page de confirmation ouverte
 * pendant qu'un webhook arrive, ne peuvent pas produire deux messages. Les
 * transactions sont sérialisées (verrou mémoire en mode fichier,
 * `SELECT ... FOR UPDATE` en PostgreSQL), donc l'un des deux lit forcément
 * l'étape déjà réservée par l'autre.
 *
 * Le revers assumé : si l'envoi échoue ensuite (service indisponible), l'étape
 * reste marquée et le message est perdu. C'est le bon côté du compromis pour un
 * message d'information — le client retrouve tout sur son suivi de commande,
 * alors qu'une rafale de doublons est irrattrapable une fois partie.
 *
 * ## Jamais bloquant
 *
 * Aucune de ces fonctions ne laisse remonter d'exception : une confirmation de
 * paiement ne doit pas échouer parce qu'un service d'e-mail est en panne.
 */

interface Claim {
  order: Order;
  settings: Settings;
}

/**
 * Réserve l'étape courante d'une commande et renvoie de quoi écrire au client,
 * ou `null` s'il n'y a rien à envoyer (étape silencieuse, ou déjà notifiée).
 */
async function claimStatus(orderId: string, status: OrderStatus): Promise<Claim | null> {
  return transaction((state) => {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) return null;
    if (!isNotifiedStatus(status)) return null;

    order.notifiedStatuses ??= [];
    if (order.notifiedStatuses.includes(status)) return null;

    // Une commande jamais payée qui expire n'est pas une nouvelle : le client a
    // simplement quitté la page de paiement. Lui écrire « votre commande est
    // annulée » pour un panier abandonné serait du bruit — et la plupart du
    // temps un message inattendu, puisqu'il n'a rien validé.
    const wasPaid = order.statusHistory.some((event) => event.status === "paid");
    if (status === "canceled" && !wasPaid) return null;

    order.notifiedStatuses.push(status);

    // Copie : l'objet d'état ne doit pas continuer à circuler hors transaction.
    return {
      order: JSON.parse(JSON.stringify(order)) as Order,
      settings: JSON.parse(JSON.stringify(state.settings)) as Settings,
    };
  });
}

/**
 * Prévient le client de l'étape où en est sa commande, une seule fois.
 *
 * `note` porte la précision saisie par la boutique au moment du changement
 * (numéro de suivi, motif d'annulation) : c'est souvent l'information la plus
 * utile du message.
 */
export async function notifyOrderStatus(
  orderId: string,
  status: OrderStatus,
  note?: string,
): Promise<EmailOutcome | "skipped"> {
  try {
    const claim = await claimStatus(orderId, status);
    if (!claim) return "skipped";

    const message = renderOrderEmail(
      {
        order: claim.order,
        settings: claim.settings,
        siteUrl: siteUrl(),
        note: note?.trim() || undefined,
      },
      status,
    );
    return await sendEmail(message);
  } catch (error) {
    // Y compris une écriture en base en échec : le suivi de commande reste la
    // source de vérité, la commande elle-même n'est pas en cause.
    console.error("[hadrishop] notification de commande impossible", error);
    return "failed";
  }
}
