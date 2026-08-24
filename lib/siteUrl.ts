/**
 * URL publique du site.
 *
 * Dans son propre module, et non dans `lib/http.ts` : celui-ci importe
 * `next/server`, ce qui rend tout ce qui en dépend inutilisable depuis un
 * script Node ordinaire — en particulier les tests (`npm run selftest`), qui
 * doivent pouvoir composer un e-mail de bout en bout.
 */
export function siteUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (request) {
    const host = request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto") ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }
  return "http://localhost:3000";
}
