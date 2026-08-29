export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const PHONE_RE = /^[+0-9][0-9 ().\-/]{5,24}$/;

const CONTROL_CHARS = new RegExp("[\\x00-\\x1f\\x7f]", "g");

/** Retire les caracteres de controle et borne la longueur, sans toucher au reste. */
export function cleanString(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").trim().slice(0, max);
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

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Comparaison insensible a la casse et aux accents (recherche, dedoublonnage). */
export function normalizeLoose(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
