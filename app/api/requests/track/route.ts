import { errors } from "@/lib/errors";
import { handle, jsonOk, limit, readJson } from "@/lib/http";
import { findRequestByNumberAndEmail } from "@/lib/requests";
import { readState } from "@/lib/store";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Suivi de demande : il faut connaitre A LA FOIS le numero de demande ET
 * l'adresse e-mail utilisee. Deviner un numero ne suffit donc jamais.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "track-request", 10, 60_000);
    const body = await readJson(request);
    const number = cleanString(body.number, 40).toUpperCase();
    const email = cleanString(body.email, 160).toLowerCase();
    if (!number || !email) throw errors.requestNotFound();

    const state = await readState();
    const found = findRequestByNumberAndEmail(state, number, email);
    if (!found) throw errors.requestNotFound();

    const bike = state.bikes.find((b) => b.kind === found.bikeKind);

    return jsonOk({
      request: {
        number: found.number,
        bikeKind: found.bikeKind,
        bikeName: bike?.name ?? found.bikeKind,
        firstName: found.customer.firstName,
        lastName: found.customer.lastName,
        startAt: found.startAt,
        endAt: found.endAt,
        status: found.status,
        adminComment: found.adminComment,
        message: found.message,
        createdAt: found.createdAt,
      },
    });
  });
}
