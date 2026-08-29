import { findConflictingAcceptedRequest } from "./availability";
import { combineDateTime, nowBrusselsString } from "./datetime";
import { errors } from "./errors";
import { generateRequestNumber, newId } from "./ids";
import { BIKE_KINDS, type BikeKind, type RentalRequest, type RequestStatus, type State } from "./types";
import { cleanString, EMAIL_RE, PHONE_RE, toBoolean } from "./validation";

export interface ParsedRentalForm {
  bikeKind: BikeKind;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  startAt: string;
  endAt: string;
  message: string;
  terms: boolean;
}

/** Validation serveur complete du formulaire de demande (miroir de la validation frontend). */
export function parseRentalForm(body: Record<string, unknown>): ParsedRentalForm {
  const fieldErrors: Record<string, string> = {};

  const bikeKindRaw = cleanString(body.bikeKind, 20);
  if (!BIKE_KINDS.includes(bikeKindRaw as BikeKind)) {
    fieldErrors.bikeKind = "Choisissez un type de velo.";
  }

  const firstName = cleanString(body.firstName, 60);
  const lastName = cleanString(body.lastName, 60);
  const email = cleanString(body.email, 160).toLowerCase();
  const phone = cleanString(body.phone, 30);
  const message = cleanString(body.message, 500);

  if (firstName.length < 2) fieldErrors.firstName = "Prenom requis (2 caracteres minimum).";
  if (lastName.length < 2) fieldErrors.lastName = "Nom requis (2 caracteres minimum).";
  if (!EMAIL_RE.test(email)) fieldErrors.email = "Adresse e-mail invalide.";
  if (!PHONE_RE.test(phone)) fieldErrors.phone = "Numero de telephone invalide.";

  const startDate = cleanString(body.startDate, 10);
  const startTime = cleanString(body.startTime, 5);
  const endDate = cleanString(body.endDate, 10);
  const endTime = cleanString(body.endTime, 5);

  const startAt = combineDateTime(startDate, startTime);
  const endAt = combineDateTime(endDate, endTime);
  if (!startAt) fieldErrors.startDate = "Date et heure de debut invalides.";
  if (!endAt) fieldErrors.endDate = "Date et heure de fin invalides.";

  if (startAt && endAt) {
    if (endAt <= startAt) {
      fieldErrors.endDate = "La date de fin doit etre apres la date de debut.";
    } else if (startAt < nowBrusselsString()) {
      fieldErrors.startDate = "La date de debut ne peut pas etre dans le passe.";
    }
  }

  const terms = toBoolean(body.terms);
  if (!terms) fieldErrors.terms = "Vous devez accepter les conditions de location.";

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.invalidRequestData(fieldErrors);
  }

  return {
    bikeKind: bikeKindRaw as BikeKind,
    firstName,
    lastName,
    email,
    phone,
    startAt: startAt!,
    endAt: endAt!,
    message,
    terms,
  };
}

function uniqueRequestNumber(state: State): string {
  let number = generateRequestNumber();
  let attempts = 0;
  while (state.requests.some((r) => r.number === number) && attempts < 20) {
    number = generateRequestNumber();
    attempts += 1;
  }
  return number;
}

/** Cree une demande de location. La periode n'est PAS reservee tant qu'elle n'est pas acceptee. */
export function createRentalRequest(state: State, body: Record<string, unknown>): RentalRequest {
  const parsed = parseRentalForm(body);

  const bike = state.bikes.find((b) => b.kind === parsed.bikeKind);
  if (!bike || !bike.active) {
    throw errors.bikeUnavailable(bike?.name);
  }

  const now = new Date().toISOString();
  const request: RentalRequest = {
    id: newId(),
    number: uniqueRequestNumber(state),
    bikeKind: parsed.bikeKind,
    customer: {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
    },
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    message: parsed.message,
    termsAcceptedAt: now,
    status: "pending",
    adminComment: "",
    internalNote: "",
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "pending", at: now }],
  };
  state.requests.push(request);
  return request;
}

export function findRequestById(state: State, id: string): RentalRequest | undefined {
  return state.requests.find((r) => r.id === id);
}

export function findRequestByNumberAndEmail(
  state: State,
  number: string,
  email: string,
): RentalRequest | undefined {
  const normalizedEmail = email.trim().toLowerCase();
  return state.requests.find(
    (r) => r.number === number.trim().toUpperCase() && r.customer.email === normalizedEmail,
  );
}

const CLOSED_STATUSES: RequestStatus[] = ["refused", "cancelled", "completed"];

function pushHistory(request: RentalRequest, status: RequestStatus, note?: string): void {
  request.status = status;
  request.updatedAt = new Date().toISOString();
  request.statusHistory.push({ status, at: request.updatedAt, note });
}

/**
 * Acceptation d'une demande : c'est le SEUL moment ou la periode devient
 * effectivement reservee. Toujours revalider ici, meme si l'appelant a deja
 * verifie plus tot (double-clic, deux onglets admin ouverts en meme temps...).
 */
export function acceptRequest(state: State, id: string): RentalRequest {
  const request = findRequestById(state, id);
  if (!request) throw errors.requestNotFound();
  if (request.status !== "pending") {
    throw errors.invalidTransition(
      `Cette demande est deja "${request.status}" : seule une demande en attente peut etre acceptee.`,
    );
  }

  const bike = state.bikes.find((b) => b.kind === request.bikeKind);
  if (!bike || !bike.active) throw errors.bikeUnavailable(bike?.name);

  const conflict = findConflictingAcceptedRequest(
    state,
    request.bikeKind,
    request.startAt,
    request.endAt,
    request.id,
  );
  if (conflict) throw errors.overlap(bike.name);

  pushHistory(request, "accepted");
  return request;
}

export function refuseRequest(state: State, id: string, comment?: string): RentalRequest {
  const request = findRequestById(state, id);
  if (!request) throw errors.requestNotFound();
  if (request.status !== "pending") {
    throw errors.invalidTransition("Seule une demande en attente peut etre refusee.");
  }
  if (comment !== undefined) request.adminComment = cleanString(comment, 1000);
  pushHistory(request, "refused");
  return request;
}

/** Annulation d'une location (generalement acceptee) par l'administrateur : libere la periode. */
export function cancelRequest(state: State, id: string, comment?: string): RentalRequest {
  const request = findRequestById(state, id);
  if (!request) throw errors.requestNotFound();
  if (CLOSED_STATUSES.includes(request.status)) {
    throw errors.invalidTransition("Cette demande est deja cloturee.");
  }
  if (comment !== undefined) request.adminComment = cleanString(comment, 1000);
  pushHistory(request, "cancelled");
  return request;
}

/**
 * Changement de statut libre depuis l'administration. Le passage a "accepted"
 * repasse obligatoirement par `acceptRequest` (revalidation de disponibilite) ;
 * les autres transitions sont appliquees directement.
 */
export function setRequestStatus(
  state: State,
  id: string,
  status: RequestStatus,
  note?: string,
): RentalRequest {
  if (status === "accepted") return acceptRequest(state, id);
  const request = findRequestById(state, id);
  if (!request) throw errors.requestNotFound();
  if (request.status === status) return request;
  pushHistory(request, status, note ? cleanString(note, 300) : undefined);
  return request;
}

export function setAdminComment(state: State, id: string, comment: string): RentalRequest {
  const request = findRequestById(state, id);
  if (!request) throw errors.requestNotFound();
  request.adminComment = cleanString(comment, 1000);
  request.updatedAt = new Date().toISOString();
  return request;
}

export function setInternalNote(state: State, id: string, note: string): RentalRequest {
  const request = findRequestById(state, id);
  if (!request) throw errors.requestNotFound();
  request.internalNote = cleanString(note, 1000);
  request.updatedAt = new Date().toISOString();
  return request;
}

export function deleteRequest(state: State, id: string): void {
  const exists = state.requests.some((r) => r.id === id);
  if (!exists) throw errors.requestNotFound();
  state.requests = state.requests.filter((r) => r.id !== id);
}
