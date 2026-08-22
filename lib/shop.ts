import { errors } from "./errors";
import { productImage } from "./images";
import type { Product, Promotion, ShippingZone, State } from "./types";
import { normalizeLoose, type CartLineInput } from "./validation";

/* -------------------------------------------------------------------------- */
/* Stock et réservations                                                      */
/* -------------------------------------------------------------------------- */

/** Libère les réservations expirées. À appeler au début de chaque transaction sensible. */
export function sweepReservations(state: State, now = Date.now()): number {
  let released = 0;
  for (const reservation of state.reservations) {
    if (reservation.status !== "active") continue;
    if (Date.parse(reservation.expiresAt) <= now) {
      reservation.status = "released";
      released += 1;
      const order = state.orders.find((o) => o.id === reservation.orderId);
      if (order && order.paymentStatus === "pending" && order.status === "awaiting_payment") {
        order.status = "canceled";
        order.paymentStatus = "canceled";
        order.updatedAt = new Date(now).toISOString();
        order.statusHistory.push({
          status: "canceled",
          at: new Date(now).toISOString(),
          note: "Réservation de stock expirée sans paiement.",
        });
      }
    }
  }
  // On ne garde pas indéfiniment les réservations terminées.
  const cutoff = now - 1000 * 60 * 60 * 24 * 30;
  state.reservations = state.reservations.filter(
    (r) => r.status === "active" || Date.parse(r.createdAt) > cutoff,
  );
  return released;
}

/**
 * Quantité actuellement réservée. Les réservations expirées sont ignorées même si
 * le balayage n'a pas encore eu lieu : les lectures restent exactes sans écriture.
 */
export function reservedQuantity(state: State, productId: string, now = Date.now()): number {
  let total = 0;
  for (const reservation of state.reservations) {
    if (reservation.status !== "active") continue;
    if (Date.parse(reservation.expiresAt) <= now) continue;
    for (const item of reservation.items) {
      if (item.productId === productId) total += item.quantity;
    }
  }
  return total;
}

/** Stock réellement vendable : stock physique moins les réservations en cours. */
export function availableStock(state: State, product: Product): number {
  return Math.max(0, product.stock - reservedQuantity(state, product.id));
}

/* -------------------------------------------------------------------------- */
/* Catalogue public                                                           */
/* -------------------------------------------------------------------------- */

export interface PublicProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  category: string;
  available: number;
  inStock: boolean;
}

export function toPublicProduct(state: State, product: Product): PublicProduct {
  const available = availableStock(state, product);
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    imageUrl: productImage(product),
    category: product.category,
    available,
    inStock: available > 0,
  };
}

export function listPublicProducts(state: State): PublicProduct[] {
  return state.products
    .filter((p) => p.active && !p.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"))
    .map((p) => toPublicProduct(state, p));
}

export function findProductByHandle(state: State, handle: string): Product | undefined {
  const needle = handle.toLowerCase();
  return state.products.find(
    (p) =>
      p.id === handle ||
      p.slug.toLowerCase() === needle ||
      p.sku.toLowerCase() === needle,
  );
}

/* -------------------------------------------------------------------------- */
/* Promotions                                                                 */
/* -------------------------------------------------------------------------- */

export function findPromotion(state: State, code: string): Promotion | undefined {
  const needle = normalizeLoose(code);
  if (!needle) return undefined;
  return state.promotions.find((p) => normalizeLoose(p.code) === needle);
}

export interface PromotionResult {
  promotion: Promotion;
  discountCents: number;
}

/**
 * Valide un code promo côté serveur : existence, activation, dates, minimum
 * d'achat et nombre d'utilisations. Le navigateur ne décide jamais de la remise.
 */
export function evaluatePromotion(
  state: State,
  code: string,
  subtotalCents: number,
  now = Date.now(),
): PromotionResult {
  const promotion = findPromotion(state, code);
  if (!promotion || promotion.archived) {
    throw errors.invalidPromo("Ce code promotionnel n'existe pas.");
  }
  if (!promotion.active) {
    throw errors.invalidPromo("Ce code promotionnel n'est plus actif.");
  }
  if (promotion.startsAt && Date.parse(promotion.startsAt) > now) {
    throw errors.invalidPromo("Ce code promotionnel n'est pas encore valable.");
  }
  if (promotion.endsAt && Date.parse(promotion.endsAt) < now) {
    throw errors.invalidPromo("Ce code promotionnel a expiré.");
  }
  if (promotion.maxUses !== null && promotion.uses >= promotion.maxUses) {
    throw errors.invalidPromo("Ce code promotionnel a atteint sa limite d'utilisation.");
  }
  if (promotion.minSubtotalCents !== null && subtotalCents < promotion.minSubtotalCents) {
    throw errors.invalidPromo(
      `Ce code est valable à partir de ${(promotion.minSubtotalCents / 100)
        .toFixed(2)
        .replace(".", ",")} € d'achat.`,
    );
  }

  const raw =
    promotion.type === "percent"
      ? Math.round((subtotalCents * promotion.value) / 100)
      : promotion.value;
  const discountCents = Math.max(0, Math.min(raw, subtotalCents));
  return { promotion, discountCents };
}

/* -------------------------------------------------------------------------- */
/* Livraison                                                                  */
/* -------------------------------------------------------------------------- */

export interface ShippingResult {
  covered: boolean;
  feeCents: number;
  zone: ShippingZone | null;
}

function postalMatches(zone: ShippingZone, postalCode: string): boolean {
  return normalizeLoose(zone.postalCode) === normalizeLoose(postalCode);
}

export function resolveShipping(
  state: State,
  postalCode: string,
  city: string,
  subtotalAfterDiscountCents: number,
): ShippingResult {
  const zones = state.shippingZones.filter((z) => z.active);
  const zone = zones.find((z) => {
    if (!postalMatches(z, postalCode)) return false;
    if (z.cities.length === 0) return true;
    const needle = normalizeLoose(city);
    return z.cities.some((c) => normalizeLoose(c) === needle);
  });

  if (!zone) return { covered: false, feeCents: 0, zone: null };

  const threshold = state.settings.freeShippingThresholdCents;
  const base = zone.feeCents ?? state.settings.defaultShippingFeeCents;
  const feeCents =
    threshold !== null && subtotalAfterDiscountCents >= threshold ? 0 : Math.max(0, base);
  return { covered: true, feeCents, zone };
}

/* -------------------------------------------------------------------------- */
/* Devis (panier / checkout)                                                  */
/* -------------------------------------------------------------------------- */

export interface QuoteLine {
  productId: string;
  sku: string;
  slug: string;
  name: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  available: number;
}

export interface QuoteIssue {
  productId: string;
  name: string;
  code: string;
  message: string;
  /** quantité retenue après correction (0 = ligne retirée) */
  quantity: number;
}

export interface Quote {
  lines: QuoteLine[];
  issues: QuoteIssue[];
  subtotalCents: number;
  discountCents: number;
  promoCode: string | null;
  promotionId: string | null;
  promoError: string | null;
  shippingCents: number;
  shippingCovered: boolean | null;
  shippingMessage: string | null;
  totalCents: number;
  currency: string;
}

export interface QuoteInput {
  items: CartLineInput[];
  promoCode?: string | null;
  postalCode?: string | null;
  city?: string | null;
  /** true = commande réelle : la moindre anomalie déclenche une erreur. */
  strict?: boolean;
}

/**
 * Recalcule intégralement un panier à partir des données du serveur.
 * Prix, stock, remise et frais de livraison ne viennent JAMAIS du navigateur.
 */
export function buildQuote(state: State, input: QuoteInput, now = Date.now()): Quote {
  const strict = input.strict ?? false;
  const lines: QuoteLine[] = [];
  const issues: QuoteIssue[] = [];

  for (const item of input.items) {
    const product = state.products.find((p) => p.id === item.productId);
    if (!product || product.archived || !product.active) {
      if (strict) throw errors.productNotFound(product?.name);
      issues.push({
        productId: item.productId,
        name: product?.name ?? "Produit",
        code: "product_not_found",
        message: product
          ? `« ${product.name} » n'est plus proposé à la vente.`
          : "Un produit de votre panier n'existe plus.",
        quantity: 0,
      });
      continue;
    }

    const available = availableStock(state, product);
    if (available <= 0) {
      if (strict) throw errors.outOfStock(product.name);
      issues.push({
        productId: product.id,
        name: product.name,
        code: "out_of_stock",
        message: `« ${product.name} » est en rupture de stock et a été retiré du panier.`,
        quantity: 0,
      });
      continue;
    }

    let quantity = item.quantity;
    if (quantity > available) {
      if (strict) throw errors.insufficientStock(product.name, available);
      issues.push({
        productId: product.id,
        name: product.name,
        code: "insufficient_stock",
        message: `Quantité ajustée : il ne reste que ${available} exemplaire${
          available > 1 ? "s" : ""
        } de « ${product.name} ».`,
        quantity: available,
      });
      quantity = available;
    }

    lines.push({
      productId: product.id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      imageUrl: productImage(product),
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
      available,
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

  let discountCents = 0;
  let promoCode: string | null = null;
  let promotionId: string | null = null;
  let promoError: string | null = null;
  const requestedCode = (input.promoCode ?? "").trim();
  if (requestedCode && subtotalCents > 0) {
    try {
      const result = evaluatePromotion(state, requestedCode, subtotalCents, now);
      discountCents = result.discountCents;
      promoCode = result.promotion.code;
      promotionId = result.promotion.id;
    } catch (error) {
      if (strict) throw error;
      promoError = error instanceof Error ? error.message : "Code promotionnel invalide.";
    }
  }

  let shippingCents = 0;
  let shippingCovered: boolean | null = null;
  let shippingMessage: string | null = null;
  const postalCode = (input.postalCode ?? "").trim();
  const city = (input.city ?? "").trim();
  if (postalCode) {
    const shipping = resolveShipping(state, postalCode, city, subtotalCents - discountCents);
    shippingCovered = shipping.covered;
    if (shipping.covered) {
      shippingCents = shipping.feeCents;
    } else {
      shippingMessage =
        "Cette adresse n'est pas encore desservie par Hadrishop. Consultez la liste des communes livrées.";
      if (strict) throw errors.shippingNotCovered();
    }
  }

  return {
    lines,
    issues,
    subtotalCents,
    discountCents,
    promoCode,
    promotionId,
    promoError,
    shippingCents,
    shippingCovered,
    shippingMessage,
    totalCents: Math.max(0, subtotalCents - discountCents) + shippingCents,
    currency: state.settings.currency,
  };
}

/** Liste des communes desservies, pour l'affichage public. */
export function deliveryAreas(state: State): { postalCode: string; cities: string[] }[] {
  return state.shippingZones
    .filter((z) => z.active)
    .map((z) => ({ postalCode: z.postalCode, cities: z.cities }));
}
