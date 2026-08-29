import { nowBrusselsString } from "./datetime";
import type { BikeKind, RentalRequest, State } from "./types";

/**
 * Deux intervalles [aStart,aEnd) et [bStart,bEnd) se chevauchent-ils ?
 * Les bornes sont des chaines "AAAA-MM-JJTHH:mm" : la comparaison lexicographique
 * suffit (voir lib/datetime.ts).
 */
export function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Une demande acceptee dont la periode chevauche celle donnee, pour le meme
 * velo, en excluant eventuellement une demande (celle qu'on est en train
 * d'accepter). C'est la seule source de verite pour savoir si un velo est
 * "reserve" sur une periode : une demande en attente ne bloque jamais rien.
 */
export function findConflictingAcceptedRequest(
  state: State,
  bikeKind: BikeKind,
  startAt: string,
  endAt: string,
  excludeRequestId?: string,
): RentalRequest | null {
  for (const request of state.requests) {
    if (request.id === excludeRequestId) continue;
    if (request.bikeKind !== bikeKind) continue;
    if (request.status !== "accepted") continue;
    if (periodsOverlap(startAt, endAt, request.startAt, request.endAt)) return request;
  }
  return null;
}

/** Le velo est-il en cours de location acceptee a l'instant `at` (par defaut maintenant) ? */
export function isBikeCurrentlyRented(
  state: State,
  bikeKind: BikeKind,
  at: string = nowBrusselsString(),
): boolean {
  return state.requests.some((request) => {
    if (request.bikeKind !== bikeKind || request.status !== "accepted") return false;
    return request.startAt <= at && at < request.endAt;
  });
}

/** Prochaines locations acceptees (a venir), triees par date de debut. */
export function upcomingAcceptedRequests(
  state: State,
  bikeKind?: BikeKind,
  at: string = nowBrusselsString(),
): RentalRequest[] {
  return state.requests
    .filter((r) => r.status === "accepted" && r.endAt > at)
    .filter((r) => !bikeKind || r.bikeKind === bikeKind)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}
