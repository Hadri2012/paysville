import { errors } from "@/lib/errors";
import { handle, jsonOk, limit, limitKey, readJson } from "@/lib/http";
import { findOrderByNumber, publicOrderView } from "@/lib/orders";
import { syncOrderFromStripe } from "@/lib/payments";
import { readState } from "@/lib/store";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Suivi de commande : il faut connaître À LA FOIS le numéro de commande ET
 * l'adresse e-mail utilisée. Deviner un numéro ne suffit donc jamais — à
 * condition qu'essayer de nombreuses combinaisons reste coûteux. `limit()`
 * seul ne le garantit pas : il ne borne que par adresse IP annoncée, un en-tête
 * que l'appelant contrôle (voir `limitKey`). Les deux verrous par cible ci-
 * dessous bornent séparément le nombre de commandes essayées pour un même
 * e-mail, et le nombre d'e-mails essayés pour un même numéro — sans quoi
 * changer d'adresse IP prétendue à chaque tentative suffirait à parcourir tout
 * l'espace des numéros de commande (`HAD-AAAA-NNNNNN`, prévisible) pour un
 * e-mail connu, exposant adresse, téléphone et liens de téléchargement.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "track", 10, 60_000);
    const body = await readJson(request);
    const number = cleanString(body.number, 40);
    const email = cleanString(body.email, 160).toLowerCase();
    if (!number || !email) throw errors.orderNotFound();
    limitKey(`track-number:${number}`, 10, 60_000);
    limitKey(`track-email:${email}`, 10, 60_000);

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
