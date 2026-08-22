import { errors } from "./errors";
import type { OrderAddress, OrderCustomer } from "./types";

export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_CART_LINES = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[+0-9][0-9 ().\-/]{5,24}$/;

export function cleanString(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function toBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === 1;
}

export function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return parseInt(value.trim(), 10);
  }
  return null;
}

export interface CartLineInput {
  productId: string;
  quantity: number;
}

/** Lit et borne les lignes de panier envoyées par le navigateur (jamais les prix !). */
export function parseCartItems(value: unknown): CartLineInput[] {
  if (!Array.isArray(value)) throw errors.validation("Panier invalide.");
  const merged = new Map<string, number>();
  for (const raw of value.slice(0, MAX_CART_LINES)) {
    if (!raw || typeof raw !== "object") continue;
    const productId = cleanString((raw as { productId?: unknown }).productId, 80);
    const quantity = toInt((raw as { quantity?: unknown }).quantity);
    if (!productId || quantity === null) continue;
    if (quantity <= 0) continue;
    const next = Math.min(
      MAX_QUANTITY_PER_LINE,
      (merged.get(productId) ?? 0) + quantity,
    );
    merged.set(productId, next);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export interface CheckoutIdentity {
  customer: OrderCustomer;
  address: OrderAddress;
  note: string;
  terms: boolean;
  marketing: boolean;
}

/** Validation serveur complète du formulaire de commande. */
export function parseCheckoutIdentity(body: Record<string, unknown>): CheckoutIdentity {
  const fieldErrors: Record<string, string> = {};

  const firstName = cleanString(body.firstName, 60);
  const lastName = cleanString(body.lastName, 60);
  const email = cleanString(body.email, 160).toLowerCase();
  const phone = cleanString(body.phone, 30);
  const street = cleanString(body.street, 120);
  const streetNumber = cleanString(body.streetNumber, 20);
  const complement = cleanString(body.complement, 120);
  const postalCode = cleanString(body.postalCode, 12).toUpperCase();
  const city = cleanString(body.city, 80);
  const country = cleanString(body.country, 60) || "Belgique";
  const note = cleanString(body.note, 500);

  if (firstName.length < 2) fieldErrors.firstName = "Prénom requis (2 caractères minimum).";
  if (lastName.length < 2) fieldErrors.lastName = "Nom requis (2 caractères minimum).";
  if (!EMAIL_RE.test(email)) fieldErrors.email = "Adresse e-mail invalide.";
  if (!PHONE_RE.test(phone)) fieldErrors.phone = "Numéro de téléphone invalide.";
  if (street.length < 2) fieldErrors.street = "Rue requise.";
  if (streetNumber.length < 1) fieldErrors.streetNumber = "Numéro requis.";
  if (!/^[0-9A-Z][0-9A-Z \-]{2,9}$/.test(postalCode)) {
    fieldErrors.postalCode = "Code postal invalide.";
  }
  if (city.length < 2) fieldErrors.city = "Ville ou village requis.";
  if (country.length < 2) fieldErrors.country = "Pays requis.";

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.invalidCustomerData(fieldErrors);
  }

  return {
    customer: { firstName, lastName, email, phone },
    address: { street, streetNumber, complement, postalCode, city, country },
    note,
    terms: toBoolean(body.terms),
    marketing: toBoolean(body.marketing),
  };
}

/** Comparaison insensible à la casse et aux accents (communes, codes promo). */
export function normalizeLoose(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
