const LOCALE = "fr-BE";

/** Formate des centimes en montant lisible : 299 -> "2,99 €". */
export function formatPrice(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
  }).format((cents ?? 0) / 100);
}

/** Convertit une saisie admin ("2,99", "2.99", "2") en centimes. Renvoie null si invalide. */
export function parsePriceToCents(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const normalized = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Centimes -> valeur d'input texte ("2.99"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
