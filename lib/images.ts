import type { Product } from "./types";

const PALETTES: [string, string][] = [
  ["#e8f0ff", "#c7d9ff"],
  ["#ffeede", "#ffd9bd"],
  ["#e6f7f0", "#c4ebdb"],
  ["#f3e9ff", "#e0cdff"],
  ["#fff4e0", "#ffe4b8"],
  ["#e9f3f7", "#ccdfe9"],
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Visuel de repli généré côté serveur (data-URI SVG, aucune requête externe)
 * quand aucune image n'a encore été renseignée pour un produit.
 */
export function placeholderImage(name: string, sku = ""): string {
  const [from, to] = PALETTES[hash(name + sku) % PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="300" cy="270" r="130" fill="#ffffff" opacity="0.55"/>
  <text x="300" y="305" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="110" font-weight="700" fill="#1f2937" text-anchor="middle">${escapeXml(
    initials(name) || "HS",
  )}</text>
  <text x="300" y="470" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="34" fill="#374151" opacity="0.75" text-anchor="middle">${escapeXml(
    sku || "Hadrishop",
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

export function productImage(product: Pick<Product, "imageUrl" | "name" | "sku">): string {
  if (product.imageUrl && isSafeImageUrl(product.imageUrl)) return product.imageUrl;
  return placeholderImage(product.name, product.sku);
}
