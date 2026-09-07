import type { NextConfig } from "next";

/**
 * Content-Security-Policy : une protection en profondeur, pas la seule ligne
 * de défense contre les injections (React échappe déjà tout par défaut, aucun
 * `dangerouslySetInnerHTML` dans le code). Elle sert surtout à limiter les
 * dégâts si une faille apparaissait malgré tout : `script-src`/`style-src` sans
 * hôte externe bloquent le chargement d'un script ou d'une feuille de style
 * injectés depuis un autre domaine ; `object-src 'none'` retire les greffons ;
 * `base-uri`/`form-action` empêchent de détourner un lien relatif ou une
 * soumission de formulaire vers un autre site.
 *
 * `'unsafe-inline'` reste nécessaire pour `script-src`/`style-src` : Next.js
 * (App Router) injecte des scripts et des styles en ligne à l'hydratation, sans
 * qu'aucun mécanisme à nonce ne soit en place ici. Ce compromis, courant pour
 * une application Next.js sans intergiciel dédié, retire une partie de la
 * protection contre les gestionnaires d'événements injectés (`onerror=…`) mais
 * bloque déjà l'essentiel : le chargement d'un script externe.
 *
 * `img-src` autorise `https:` en plus de l'origine et de `data:` : les fiches
 * produit peuvent afficher une image hébergée ailleurs (voir
 * `lib/images.ts#isSafeImageUrl`, qui accepte déjà `http(s)://` en plus de
 * `data:image/…` et des chemins locaux) — la restreindre romprait cette
 * fonctionnalité existante sans rapport avec une faille.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

/**
 * En-têtes de sécurité appliqués à toutes les réponses.
 * (HTTPS lui-même est assuré par l'hébergeur en production.)
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy", value: CSP },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

/**
 * Rendu des documents PDF (voir `lib/pdfRender.ts`) : pdf.js et le canvas
 * natif s'exécutent dans Node tels quels, hors bundle. Les polices standard et
 * le « worker » de pdf.js sont chargés à l'exécution par chemin, pas par
 * import : il faut les déclarer pour qu'ils soient embarqués dans les
 * fonctions serveur qui en ont besoin.
 */
const PDF_RUNTIME_FILES = [
  "./node_modules/pdfjs-dist/standard_fonts/**",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "pdf-lib"],
  outputFileTracingIncludes: {
    "/api/admin/documents": PDF_RUNTIME_FILES,
    "/api/admin/documents/[id]/edition": PDF_RUNTIME_FILES,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
