import { errors } from "@/lib/errors";
import { customerOrderHistory } from "@/lib/history";
import { handle, jsonOk, limit, limitKey, readJson } from "@/lib/http";
import { findOrderByNumber } from "@/lib/orders";
import { readState } from "@/lib/store";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Historique des commandes d'un client.
 *
 * La preuve exigée est exactement celle du suivi (`/api/orders/track`) : un
 * numéro de commande ET l'e-mail qui va avec. Connaître une adresse e-mail ne
 * suffit donc jamais à dérouler l'historique de quelqu'un — il faut déjà
 * détenir une de ses commandes. Ce que la réponse contient est en outre
 * volontairement réduit (voir `lib/history.ts`) : ni adresse, ni téléphone, ni
 * lien de téléchargement, qui restent derrière la consultation d'une commande
 * précise.
 *
 * Les mêmes verrous par cible que le suivi s'appliquent : sans eux, changer
 * d'adresse IP prétendue à chaque essai permettrait de parcourir l'espace des
 * numéros de commande, prévisible (`HAD-AAAA-NNNNNN`), pour un e-mail connu.
 *
 * Aucune synchronisation Stripe ici, à la différence du suivi : elle coûterait
 * un appel réseau par commande en attente. L'état affiché est celui enregistré ;
 * ouvrir une commande passe par le suivi, qui l'actualise.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "history", 10, 60_000);
    const body = await readJson(request);
    const number = cleanString(body.number, 40);
    const email = cleanString(body.email, 160).toLowerCase();
    if (!number || !email) throw errors.orderNotFound();
    limitKey(`track-number:${number}`, 10, 60_000);
    limitKey(`track-email:${email}`, 10, 60_000);

    const state = await readState();
    const order = findOrderByNumber(state, number);
    if (!order || order.customer.email.trim().toLowerCase() !== email) {
      throw errors.orderNotFound();
    }

    return jsonOk({ orders: customerOrderHistory(state, email) });
  });
}
