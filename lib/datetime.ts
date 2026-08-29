/**
 * Toutes les dates/heures de location sont manipulees comme de simples chaines
 * "AAAA-MM-JJTHH:mm" en heure de Bruxelles (heure murale, jamais convertie en
 * UTC). Ce format se compare et se trie lexicographiquement exactement comme
 * une date : pas besoin de passer par `Date.parse` (et ses pieges de fuseau)
 * pour savoir si deux periodes se chevauchent ou si une location est en cours.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isValidDateStr(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

export function isValidTimeStr(value: string): boolean {
  if (!TIME_RE.test(value)) return false;
  const [h, min] = value.split(":").map(Number);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

/** Combine une date et une heure valides en "AAAA-MM-JJTHH:mm", ou `null` si invalide. */
export function combineDateTime(date: string, time: string): string | null {
  if (!isValidDateStr(date) || !isValidTimeStr(time)) return null;
  return `${date}T${time}`;
}

/** Heure actuelle a Bruxelles, au meme format que les periodes stockees. */
export function nowBrusselsString(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Formatage lisible d'un horodatage ISO complet (createdAt/updatedAt), en heure de Bruxelles. */
export function formatIsoDisplay(iso: string): string {
  return new Intl.DateTimeFormat("fr-BE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(new Date(iso));
}

/** Formatage lisible ("mer. 4 mars 2026 a 14:30") d'une periode stockee, sans conversion de fuseau. */
export function formatLocalDisplay(value: string): string {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return value;
  const [y, m, d] = datePart.split("-").map(Number);
  const label = new Intl.DateTimeFormat("fr-BE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${label} a ${timePart}`;
}
