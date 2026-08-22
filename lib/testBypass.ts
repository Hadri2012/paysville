import { timingSafeEqual } from "crypto";

/**
 * Code de contournement pour valider une commande sans paiement Stripe réel,
 * utile pour tester le parcours d'achat de bout en bout. Entièrement inactif
 * tant que `TEST_ORDER_BYPASS_CODE` n'est pas défini, et — filet de sécurité
 * supplémentaire — refuse de fonctionner si une clé Stripe de production
 * (`sk_live_…`) est configurée : il ne peut jamais servir à obtenir une
 * commande gratuite sur la boutique réelle.
 */
export function isTestBypassEnabled(): boolean {
  const code = process.env.TEST_ORDER_BYPASS_CODE;
  if (!code) return false;
  const key = process.env.STRIPE_SECRET_KEY;
  if (key && !key.startsWith("sk_test_")) return false;
  return true;
}

/** Comparaison en temps constant : la longueur/le contenu ne doivent pas fuiter par le timing. */
export function verifyTestBypassCode(received: unknown): boolean {
  if (!isTestBypassEnabled() || typeof received !== "string" || received.length === 0) {
    return false;
  }
  const expected = process.env.TEST_ORDER_BYPASS_CODE ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
