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
  /** Couleur choisie, si le produit en propose. `null`/absent sinon. */
  colorId?: string | null;
}

/**
 * Lit et borne les lignes de panier envoyées par le navigateur (jamais les prix !).
 *
 * Deux lignes du même produit ne fusionnent que si elles portent la même couleur
 * (ou aucune, pour un produit qui n'en propose pas) : un client peut vouloir un
 * exemplaire noir et un exemplaire blanc dans la même commande, ce sont deux
 * lignes distinctes jusqu'au bout — comptage, prix, préparation.
 */
export function parseCartItems(value: unknown): CartLineInput[] {
  if (!Array.isArray(value)) throw errors.validation("Panier invalide.");
  const merged = new Map<string, CartLineInput>();
  for (const raw of value.slice(0, MAX_CART_LINES)) {
    if (!raw || typeof raw !== "object") continue;
    const productId = cleanString((raw as { productId?: unknown }).productId, 80);
    const quantity = toInt((raw as { quantity?: unknown }).quantity);
    const colorId = cleanString((raw as { colorId?: unknown }).colorId, 40) || null;
    if (!productId || quantity === null) continue;
    if (quantity <= 0) continue;
    const key = `${productId} ${colorId ?? ""}`;
    const current = merged.get(key);
    const next = Math.min(MAX_QUANTITY_PER_LINE, (current?.quantity ?? 0) + quantity);
    merged.set(key, { productId, colorId, quantity: next });
  }
  return [...merged.values()];
}

export interface CheckoutIdentity {
  customer: OrderCustomer;
  address: OrderAddress;
  note: string;
  terms: boolean;
  marketing: boolean;
}

export interface CheckoutIdentityOptions {
  /**
   * Adresse postale exigée. Fausse pour une commande entièrement composée de
   * fichiers téléchargeables : il n'y a rien à expédier, réclamer une rue et un
   * numéro de maison n'aurait aucun objet. Les coordonnées (nom, e-mail,
   * téléphone) restent obligatoires dans tous les cas — elles servent à
   * retrouver la commande et à donner accès aux téléchargements.
   */
  requireAddress?: boolean;
}

/** Validation serveur complète du formulaire de commande. */
export function parseCheckoutIdentity(
  body: Record<string, unknown>,
  options: CheckoutIdentityOptions = {},
): CheckoutIdentity {
  const requireAddress = options.requireAddress ?? true;
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
  if (requireAddress) {
    if (street.length < 2) fieldErrors.street = "Rue requise.";
    if (streetNumber.length < 1) fieldErrors.streetNumber = "Numéro requis.";
    if (!/^[0-9A-Z][0-9A-Z \-]{2,9}$/.test(postalCode)) {
      fieldErrors.postalCode = "Code postal invalide.";
    }
    if (city.length < 2) fieldErrors.city = "Ville ou village requis.";
    if (country.length < 2) fieldErrors.country = "Pays requis.";
  } else if (postalCode && !/^[0-9A-Z][0-9A-Z \-]{2,9}$/.test(postalCode)) {
    // Facultatif, mais s'il est renseigné il doit rester exploitable.
    fieldErrors.postalCode = "Code postal invalide.";
  }

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

/**
 * Variante pour la recherche plein texte : m\u00eames r\u00e8gles (casse, accents) mais les
 * s\u00e9parateurs deviennent des espaces au lieu de dispara\u00eetre. `normalizeLoose`
 * collerait \u00ab porte casque \u00bb en \u00ab portecasque \u00bb, ce qui emp\u00eacherait de retrouver
 * un mot isol\u00e9 au milieu d'un libell\u00e9.
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
