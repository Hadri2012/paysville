/**
 * Modèle de données VéloLoc.
 * Deux vélos fixes (normal / électrique), aucune notion de prix ni de paiement :
 * le site gère uniquement des demandes de location et leur acceptation.
 */

export type BikeKind = "normal" | "electric";

export const BIKE_KINDS: BikeKind[] = ["normal", "electric"];

export interface Bike {
  kind: BikeKind;
  /** Nom affiché (modifiable depuis l'admin). */
  name: string;
  description: string;
  imageUrl: string;
  /**
   * Disponibilité générale décidée par l'administrateur : quand `false`, plus
   * aucune nouvelle demande ne peut être envoyée pour ce vélo, quelle que soit
   * la période choisie.
   */
  active: boolean;
  /** Courtes caractéristiques affichées en liste (ex. « 21 vitesses »). */
  features: string[];
  updatedAt: string;
}

export type RequestStatus =
  | "pending"
  | "accepted"
  | "refused"
  | "cancelled"
  | "completed";

export const REQUEST_STATUSES: RequestStatus[] = [
  "pending",
  "accepted",
  "refused",
  "cancelled",
  "completed",
];

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  refused: "Refusée",
  cancelled: "Annulée",
  completed: "Terminée",
};

export interface RequestStatusEvent {
  status: RequestStatus;
  at: string;
  note?: string;
}

export interface RentalRequestCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface RentalRequest {
  id: string;
  /** Numéro de demande unique, communiqué au client (ex. VL-2026-7K3F9Q). */
  number: string;
  bikeKind: BikeKind;
  customer: RentalRequestCustomer;
  /**
   * Chaine "AAAA-MM-JJTHH:mm", heure de Bruxelles (heure murale, jamais
   * convertie). Le format zero-pad se compare et se trie lexicographiquement
   * comme une date, ce qui suffit pour toute la logique de chevauchement.
   */
  startAt: string;
  endAt: string;
  message: string;
  termsAcceptedAt: string;
  status: RequestStatus;
  /** Commentaire visible par le client depuis le suivi de demande. */
  adminComment: string;
  /** Note interne, jamais montrée au client. */
  internalNote: string;
  createdAt: string;
  updatedAt: string;
  statusHistory: RequestStatusEvent[];
}

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminSession {
  tokenHash: string;
  adminId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Settings {
  siteName: string;
  contactEmail: string;
}

export interface State {
  schemaVersion: number;
  settings: Settings;
  bikes: Bike[];
  requests: RentalRequest[];
  admins: AdminUser[];
  sessions: AdminSession[];
}
