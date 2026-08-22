import { orderConfirmationEmail, orderStatusEmail, type EmailContext } from "./emails";
import { siteUrl } from "./http";
import { isMailerConfigured, sendMail } from "./mailer";
import { readState } from "./store";
import type { Order } from "./types";

/**
 * Notifications client. Ces fonctions sont volontairement « best effort » :
 * elles s'appellent APRÈS la transaction (jamais dedans, pour ne pas rallonger un
 * verrou base le temps d'un appel réseau) et ne rejettent jamais. Un e-mail perdu
 * ne doit ni faire rejouer un webhook Stripe, ni bloquer un changement de statut
 * dans l'administration.
 */

async function context(request?: Request): Promise<EmailContext> {
  const state = await readState();
  return {
    shopName: state.settings.shopName || "Hadrishop",
    contactEmail: state.settings.contactEmail || state.settings.legal.email || "",
    site: siteUrl(request),
  };
}

/** Confirmation de paiement — à n'appeler que lors du passage effectif à « payée ». */
export async function notifyOrderPaid(order: Order, request?: Request): Promise<void> {
  if (!isMailerConfigured()) return;
  try {
    await sendMail(orderConfirmationEmail(order, await context(request)));
  } catch (error) {
    console.error(`[hadrishop] notification de paiement impossible (${order.number})`, error);
  }
}

/** Changement de statut — silencieux pour les statuts qui n'intéressent pas le client. */
export async function notifyOrderStatus(order: Order, request?: Request): Promise<void> {
  if (!isMailerConfigured()) return;
  try {
    const message = orderStatusEmail(order, await context(request));
    if (message) await sendMail(message);
  } catch (error) {
    console.error(`[hadrishop] notification de statut impossible (${order.number})`, error);
  }
}
