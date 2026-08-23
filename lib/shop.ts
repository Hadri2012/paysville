import { errors } from "./errors";
import {
  MAX_DELIVERY_DISTANCE_KM,
  SHOP_HUB_POSTAL_CODE,
  distanceFeeCents,
  distanceFromHubKm,
} from "./geo";
import { productImage } from "./images";
import type { Product, Promotion, ShippingZone, State } from "./types";
import { normalizeLoose, normalizeSearch, type CartLineInput } from "./validation";

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

/** Au-delà, un produit n'est plus une nouveauté. */
export const NEW_PRODUCT_DAYS = 30;

export function isNewProduct(product: Product, now = Date.now()): boolean {
  const created = Date.parse(product.createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= NEW_PRODUCT_DAYS * 24 * 60 * 60_000;
}

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
  /** Ajouté au catalogue il y a moins de 30 jours. */
  isNew: boolean;
  createdAt: string;
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
    isNew: isNewProduct(product),
    createdAt: product.createdAt,
  };
}

export function listPublicProducts(state: State): PublicProduct[] {
  return state.products
    .filter((p) => p.active && !p.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"))
    .map((p) => toPublicProduct(state, p));
}

/* -------------------------------------------------------------------------- */
/* Recherche et tri du catalogue                                              */
/* -------------------------------------------------------------------------- */

export const SORT_OPTIONS = {
  pertinence: "Pertinence",
  ventes: "Meilleures ventes",
  nouveautes: "Nouveautés",
  "prix-croissant": "Prix croissant",
  "prix-decroissant": "Prix décroissant",
  nom: "Nom (A → Z)",
  note: "Meilleures notes",
} as const;

export type SortKey = keyof typeof SORT_OPTIONS;

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && value in SORT_OPTIONS;
}

/**
 * Quantités réellement vendues, par produit.
 *
 * Seules les commandes payées comptent, et les annulées ou remboursées en sont
 * exclues : une commande abandonnée au paiement, ou remboursée le lendemain, ne
 * dit rien de ce qui se vend. On additionne les quantités plutôt que le nombre de
 * commandes — vendre six exemplaires en une fois reste une vente de six.
 */
export function salesCounts(state: State): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of state.orders) {
    if (order.paymentStatus !== "paid") continue;
    if (order.status === "canceled" || order.status === "refunded") continue;
    for (const item of order.items) {
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity);
    }
  }
  return counts;
}

/**
 * Recherche plein texte simple : tous les mots saisis doivent apparaître quelque
 * part dans la fiche (nom, description, référence, catégorie). Le « et » implicite
 * évite qu'une requête à deux mots ramène tout le catalogue.
 */
export function searchProducts(products: PublicProduct[], query: string): PublicProduct[] {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return products;
  return products.filter((product) => {
    const haystack = normalizeSearch(
      `${product.name} ${product.description} ${product.sku} ${product.category}`,
    );
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * Tri du catalogue. Les produits en rupture passent toujours en fin de liste :
 * quel que soit le critère demandé, mettre en tête un article qu'on ne peut pas
 * acheter n'aide personne.
 */
/** Données annexes dont dépendent certains tris, calculées une fois par page. */
export interface SortContext {
  ratings?: Map<string, { average: number | null; count: number }>;
  sales?: Map<string, number>;
}

export function sortProducts(
  products: PublicProduct[],
  sort: SortKey,
  context: SortContext = {},
): PublicProduct[] {
  const byName = (a: PublicProduct, b: PublicProduct) => a.name.localeCompare(b.name, "fr");
  // « Pertinence » = l'ordre d'entrée, c'est-à-dire le classement défini par
  // l'administrateur (`sortOrder`). On mémorise donc la position d'origine plutôt
  // que de retomber sur un tri alphabétique qui l'écraserait.
  const rank = new Map(products.map((product, index) => [product.id, index]));
  const byRank = (a: PublicProduct, b: PublicProduct) =>
    (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0);

  const compare: Record<SortKey, (a: PublicProduct, b: PublicProduct) => number> = {
    pertinence: byRank,
    // Jamais vendu vaut zéro, pas « inconnu » : sur une boutique neuve tous les
    // produits sont à égalité et l'ordre de l'administrateur reprend la main.
    ventes: (a, b) =>
      (context.sales?.get(b.id) ?? 0) - (context.sales?.get(a.id) ?? 0) || byRank(a, b),
    nouveautes: (a, b) => b.createdAt.localeCompare(a.createdAt) || byRank(a, b),
    "prix-croissant": (a, b) => a.priceCents - b.priceCents || byName(a, b),
    "prix-decroissant": (a, b) => b.priceCents - a.priceCents || byName(a, b),
    nom: byName,
    note: (a, b) => {
      const scoreA = context.ratings?.get(a.id)?.average ?? -1;
      const scoreB = context.ratings?.get(b.id)?.average ?? -1;
      return scoreB - scoreA || byRank(a, b);
    },
  };

  return [...products].sort(
    (a, b) => Number(b.inStock) - Number(a.inStock) || compare[sort](a, b),
  );
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
 * Ce client a-t-il déjà payé une commande avec ce code ?
 *
 * On ne regarde que les commandes réellement payées et non annulées : un panier
 * abandonné au paiement ne doit pas brûler le code, et une commande remboursée
 * rend son droit au client.
 */
function hasUsedPromotion(state: State, promotionId: string, email: string): boolean {
  const needle = email.trim().toLowerCase();
  if (!needle) return false;
  return state.orders.some(
    (order) =>
      order.promotionId === promotionId &&
      order.paymentStatus === "paid" &&
      order.status !== "canceled" &&
      order.status !== "refunded" &&
      order.customer.email.trim().toLowerCase() === needle,
  );
}

/**
 * Valide un code promo côté serveur : existence, activation, dates, minimum
 * d'achat et nombre d'utilisations. Le navigateur ne décide jamais de la remise.
 *
 * `customerEmail` n'est connu qu'au moment de la commande : c'est là que se vérifie
 * un code réservé à un usage par client. Le panier, lui, l'affiche sans pouvoir le
 * contrôler — d'où la mention portée par le devis, pour prévenir avant le paiement
 * plutôt que de refuser après.
 */
export function evaluatePromotion(
  state: State,
  code: string,
  subtotalCents: number,
  now = Date.now(),
  customerEmail?: string | null,
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
  if (
    promotion.oncePerCustomer &&
    customerEmail &&
    hasUsedPromotion(state, promotion.id, customerEmail)
  ) {
    throw errors.invalidPromo(
      "Ce code est réservé à une utilisation par client, et vous l'avez déjà utilisé.",
    );
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

/**
 * Frais d'une zone tels qu'affichés (admin, page « Livraison »), sans commande
 * réelle : même règle que `resolveShipping`, pour ne jamais afficher un tarif
 * différent de celui réellement facturé.
 */
export function previewZoneFeeCents(
  zone: Pick<ShippingZone, "postalCode" | "feeCents">,
  defaultFeeCents: number,
): number {
  if (normalizeLoose(zone.postalCode) === normalizeLoose(SHOP_HUB_POSTAL_CODE)) return 0;
  if (zone.feeCents !== null) return Math.max(0, zone.feeCents);
  const distanceKm = distanceFromHubKm(zone.postalCode);
  if (distanceKm !== null && distanceKm <= MAX_DELIVERY_DISTANCE_KM) {
    return distanceFeeCents(distanceKm);
  }
  return Math.max(0, defaultFeeCents);
}

/**
 * Résout les frais de livraison pour une adresse.
 *
 * Règle : la livraison est offerte exclusivement dans la zone d'origine du
 * magasin (1435, Mont-Saint-Guibert). Au-delà, elle est facturée au prorata de
 * la distance (2 € / 5 km), jusqu'à 30 km à vol d'oiseau. Un frais explicite
 * saisi par l'admin pour une zone (`feeCents` non nul) reste prioritaire — la
 * distance ne sert qu'à défaut de tarif manuel.
 */
export function resolveShipping(state: State, postalCode: string, city: string): ShippingResult {
  const isHub = normalizeLoose(postalCode) === normalizeLoose(SHOP_HUB_POSTAL_CODE);

  const zones = state.shippingZones.filter((z) => z.active);
  const zone = zones.find((z) => {
    if (!postalMatches(z, postalCode)) return false;
    if (z.cities.length === 0) return true;
    const needle = normalizeLoose(city);
    return z.cities.some((c) => normalizeLoose(c) === needle);
  });

  if (zone) {
    if (isHub) return { covered: true, feeCents: 0, zone };
    if (zone.feeCents !== null) {
      return { covered: true, feeCents: Math.max(0, zone.feeCents), zone };
    }
    const distanceKm = distanceFromHubKm(zone.postalCode);
    const feeCents =
      distanceKm !== null && distanceKm <= MAX_DELIVERY_DISTANCE_KM
        ? distanceFeeCents(distanceKm)
        : Math.max(0, state.settings.defaultShippingFeeCents);
    return { covered: true, feeCents, zone };
  }

  // Aucune zone déclarée par l'admin pour ce code postal : couverture automatique
  // par la distance, jusqu'à 30 km autour de 1435 (Mont-Saint-Guibert), Gembloux
  // inclus. Au-delà (ou code postal inconnu), la livraison n'est pas proposée.
  if (!isHub) {
    const distanceKm = distanceFromHubKm(postalCode);
    if (distanceKm !== null && distanceKm <= MAX_DELIVERY_DISTANCE_KM) {
      return { covered: true, feeCents: distanceFeeCents(distanceKm), zone: null };
    }
  }

  return { covered: false, feeCents: 0, zone: null };
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
  /** Code valable une fois par client : à signaler tant que l'e-mail est inconnu. */
  promoOncePerCustomer: boolean;
  shippingCents: number;
  shippingCovered: boolean | null;
  shippingMessage: string | null;
  totalCents: number;
  currency: string;
}

export interface QuoteInput {
  items: CartLineInput[];
  promoCode?: string | null;
  /** Connu seulement à la commande : sans lui, un code « une fois par client » passe. */
  customerEmail?: string | null;
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
  let promoOncePerCustomer = false;
  const requestedCode = (input.promoCode ?? "").trim();
  if (requestedCode && subtotalCents > 0) {
    try {
      const result = evaluatePromotion(
        state,
        requestedCode,
        subtotalCents,
        now,
        input.customerEmail,
      );
      discountCents = result.discountCents;
      promoCode = result.promotion.code;
      promotionId = result.promotion.id;
      // La mention n'a d'intérêt que tant que la règle n'a pas pu être vérifiée :
      // une fois l'e-mail connu, le code est accepté ou refusé, il n'y a plus de
      // réserve à formuler.
      promoOncePerCustomer = result.promotion.oncePerCustomer && !input.customerEmail;
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
    const shipping = resolveShipping(state, postalCode, city);
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
    promoOncePerCustomer,
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
