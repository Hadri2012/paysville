import type { Bike } from "./types";

const PALETTES: Record<string, [string, string]> = {
  normal: ["#e6f7f0", "#c4ebdb"],
  electric: ["#e8f0ff", "#c7d9ff"],
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Visuel de repli généré côté serveur (data-URI SVG, aucune requête externe)
 * quand aucune photo n'a encore été renseignée pour un vélo.
 */
export function placeholderImage(bike: Pick<Bike, "kind" | "name">): string {
  const [from, to] = PALETTES[bike.kind] ?? PALETTES.normal;
  const electric = bike.kind === "electric";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400" role="img">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="600" height="400" fill="url(#g)"/>
  <circle cx="185" cy="280" r="62" fill="none" stroke="#1f2937" stroke-width="10"/>
  <circle cx="415" cy="280" r="62" fill="none" stroke="#1f2937" stroke-width="10"/>
  <path d="M185 280 L275 160 L415 280 M275 160 L245 280 M275 160 L340 160 L365 210" fill="none" stroke="#1f2937" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  ${electric ? '<circle cx="365" cy="210" r="16" fill="#f59e0b"/>' : ""}
  <text x="300" y="370" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#1f2937" text-anchor="middle" opacity="0.85">${escapeXml(
    bike.name || "VéloLoc",
  )}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Vérifie qu'une URL d'image est acceptable (évite les schémas type `javascript:`). */
export function isSafeImageUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith("/")) return true;
  if (/^https?:\/\//i.test(url)) return true;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(url)) return true;
  return false;
}

export function bikeImage(bike: Pick<Bike, "kind" | "name" | "imageUrl">): string {
  if (bike.imageUrl && isSafeImageUrl(bike.imageUrl)) return bike.imageUrl;
  return placeholderImage(bike);
}
