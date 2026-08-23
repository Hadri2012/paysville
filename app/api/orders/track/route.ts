import { errors } from "@/lib/errors";
import { handle, jsonOk, limit, readJson } from "@/lib/http";
import { findOrderByNumber, publicOrderView } from "@/lib/orders";
import { syncOrderFromStripe } from "@/lib/payments";
import { readState } from "@/lib/store";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Suivi de commande : il faut connaître À LA FOIS le numéro de commande ET
 * l'adresse e-mail utilisée. Deviner un numéro ne suffit donc jamais.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "track", 10, 60_000);
    const body = await readJson(request);
    const number = cleanString(body.number, 40);
    const email = cleanString(body.email, 160).toLowerCase();
    if (!number || !email) throw errors.orderNotFound();

    const state = await readState();
    const order = findOrderByNumber(state, number);
    if (!order || order.customer.email.toLowerCase() !== email) {
      throw errors.orderNotFound();
    }

    // On demande à Stripe l'état réel du paiement si celui-ci est encore en attente.
    const refreshed = (await syncOrderFromStripe(order.number)) ?? order;
    // `state` permet d'inclure les liens de téléchargement des fichiers achetés.
    return jsonOk({ order: publicOrderView(refreshed, state) });
  });
}
