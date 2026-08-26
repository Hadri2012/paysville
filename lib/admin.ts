import { errors } from "./errors";
import { isSafeImageUrl } from "./images";
import { newId, slugify, uniqueSlug } from "./ids";
import { parsePriceToCents } from "./money";
import type { Product, Promotion, Settings, ShippingZone, State } from "./types";
import { cleanString, normalizeLoose, toBoolean, toInt } from "./validation";

/* ------------------------------- Produits -------------------------------- */

export function upsertProduct(
  state: State,
  body: Record<string, unknown>,
  existing?: Product,
): Product {
  const fieldErrors: Record<string, string> = {};

  const name = cleanString(body.name, 120) || existing?.name || "";
  if (name.length < 2) fieldErrors.name = "Nom requis.";

  const sku = (cleanString(body.sku, 32) || existing?.sku || "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-_.]{0,31}$/.test(sku)) {
    fieldErrors.sku = "Référence invalide (lettres, chiffres, - _ .).";
  } else if (
    state.products.some(
      (p) => p.id !== existing?.id && p.sku.toUpperCase() === sku && !p.archived,
    )
  ) {
    fieldErrors.sku = "Cette référence est déjà utilisée.";
  }

  const priceCents =
    body.priceCents !== undefined
      ? toInt(body.priceCents)
      : body.price !== undefined
        ? parsePriceToCents(body.price as string)
        : (existing?.priceCents ?? null);
  if (priceCents === null || priceCents < 0) {
    fieldErrors.price = "Prix invalide (ex. 2,99).";
  }

  const kindRaw = body.kind !== undefined ? cleanString(body.kind, 12) : (existing?.kind ?? "physical");
  if (kindRaw !== "physical" && kindRaw !== "digital") {
    fieldErrors.kind = "Type de produit invalide.";
  }
  const kind = (kindRaw === "digital" ? "digital" : "physical") as Product["kind"];

  // Un produit numérique n'a pas de stock : la valeur est ignorée et neutralisée.
  const stock =
    kind === "digital"
      ? 0
      : body.stock !== undefined
        ? toInt(body.stock)
        : (existing?.stock ?? null);
  if (stock === null || stock < 0) fieldErrors.stock = "Stock invalide.";

  const imageUrl =
    body.imageUrl !== undefined
      ? cleanString(body.imageUrl, 2000)
      : (existing?.imageUrl ?? "");
  if (!isSafeImageUrl(imageUrl)) {
    fieldErrors.imageUrl = "URL d'image invalide (http(s), chemin /… ou data:image).";
  }

  const sortOrder =
    body.sortOrder !== undefined ? toInt(body.sortOrder) : (existing?.sortOrder ?? 0);
  if (sortOrder === null) fieldErrors.sortOrder = "Ordre d'affichage invalide.";

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.validation("Formulaire produit incomplet ou invalide.", fieldErrors);
  }

  const now = new Date().toISOString();
  const description =
    body.description !== undefined
      ? cleanString(body.description, 2000)
      : (existing?.description ?? "");
  const category =
    body.category !== undefined ? cleanString(body.category, 60) : (existing?.category ?? "");
  const active = body.active !== undefined ? toBoolean(body.active) : (existing?.active ?? true);

  if (existing) {
    const requestedSlug = cleanString(body.slug, 80);
    if (requestedSlug && slugify(requestedSlug) !== existing.slug) {
      existing.slug = uniqueSlug(
        requestedSlug,
        state.products.filter((p) => p.id !== existing.id).map((p) => p.slug),
      );
    } else if (name !== existing.name && !cleanString(body.slug, 80)) {
      existing.slug = uniqueSlug(
        name,
        state.products.filter((p) => p.id !== existing.id).map((p) => p.slug),
      );
    }
    existing.name = name;
    existing.sku = sku;
    existing.description = description;
    existing.priceCents = priceCents!;
    existing.stock = stock!;
    existing.imageUrl = imageUrl;
    existing.category = category;
    existing.sortOrder = sortOrder!;
    existing.active = active;
    // Les fichiers joints et le modèle 3D ont leurs propres routes d'upload :
    // seul le type change ici, sans jamais toucher aux assets existants.
    existing.kind = kind;
    existing.updatedAt = now;
    return existing;
  }

  const product: Product = {
    id: newId(),
    sku,
    slug: uniqueSlug(cleanString(body.slug, 80) || name, state.products.map((p) => p.slug)),
    name,
    description,
    priceCents: priceCents!,
    stock: stock!,
    imageUrl,
    active,
    category,
    sortOrder:
      sortOrder ||
      (state.products.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 10),
    archived: false,
    kind,
    digitalFiles: [],
    model3d: null,
    createdAt: now,
    updatedAt: now,
  };
  state.products.push(product);
  return product;
}

/* ------------------------------ Promotions ------------------------------- */

export function upsertPromotion(
  state: State,
  body: Record<string, unknown>,
  existing?: Promotion,
): Promotion {
  const fieldErrors: Record<string, string> = {};

  const code = (cleanString(body.code, 40) || existing?.code || "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-_]{1,39}$/.test(code)) {
    fieldErrors.code = "Code invalide (2 à 40 caractères, lettres/chiffres).";
  } else if (
    state.promotions.some(
      (p) => p.id !== existing?.id && normalizeLoose(p.code) === normalizeLoose(code),
    )
  ) {
    fieldErrors.code = "Ce code existe déjà.";
  }

  const type = cleanString(body.type, 10) || existing?.type || "percent";
  if (type !== "percent" && type !== "fixed") fieldErrors.type = "Type de remise invalide.";

  const rawValue =
    body.value !== undefined
      ? type === "percent"
        ? toInt(body.value)
        : parsePriceToCents(body.value as string)
      : (existing?.value ?? null);
  if (rawValue === null || rawValue <= 0) {
    fieldErrors.value = "Valeur de remise invalide.";
  } else if (type === "percent" && rawValue > 100) {
    fieldErrors.value = "Le pourcentage ne peut pas dépasser 100.";
  }

  const parseDate = (value: unknown, key: string): string | null => {
    const raw = cleanString(value, 40);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      fieldErrors[key] = "Date invalide.";
      return null;
    }
    return parsed.toISOString();
  };

  const startsAt =
    body.startsAt !== undefined ? parseDate(body.startsAt, "startsAt") : (existing?.startsAt ?? null);
  const endsAt =
    body.endsAt !== undefined ? parseDate(body.endsAt, "endsAt") : (existing?.endsAt ?? null);

  const minSubtotalCents =
    body.minSubtotal !== undefined
      ? cleanString(body.minSubtotal, 20)
        ? parsePriceToCents(body.minSubtotal as string)
        : null
      : (existing?.minSubtotalCents ?? null);
  if (body.minSubtotal !== undefined && cleanString(body.minSubtotal, 20) && minSubtotalCents === null) {
    fieldErrors.minSubtotal = "Montant minimum invalide.";
  }

  const maxUses =
    body.maxUses !== undefined
      ? cleanString(body.maxUses, 12)
        ? toInt(body.maxUses)
        : null
      : (existing?.maxUses ?? null);
  if (maxUses !== null && maxUses <= 0) fieldErrors.maxUses = "Nombre d'utilisations invalide.";

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.validation("Formulaire promotion invalide.", fieldErrors);
  }

  const now = new Date().toISOString();
  const active = body.active !== undefined ? toBoolean(body.active) : (existing?.active ?? true);
  const oncePerCustomer =
    body.oncePerCustomer !== undefined
      ? toBoolean(body.oncePerCustomer)
      : (existing?.oncePerCustomer ?? false);

  if (existing) {
    existing.code = code;
    existing.type = type as Promotion["type"];
    existing.value = rawValue!;
    existing.startsAt = startsAt;
    existing.endsAt = endsAt;
    existing.minSubtotalCents = minSubtotalCents;
    existing.maxUses = maxUses;
    existing.oncePerCustomer = oncePerCustomer;
    existing.active = active;
    existing.updatedAt = now;
    return existing;
  }

  const promotion: Promotion = {
    id: newId(),
    code,
    active,
    type: type as Promotion["type"],
    value: rawValue!,
    startsAt,
    endsAt,
    minSubtotalCents,
    maxUses,
    uses: 0,
    oncePerCustomer,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  state.promotions.push(promotion);
  return promotion;
}

/* ------------------------------- Livraison ------------------------------- */

export function upsertShippingZone(
  state: State,
  body: Record<string, unknown>,
  existing?: ShippingZone,
): ShippingZone {
  const fieldErrors: Record<string, string> = {};

  const postalCode = (cleanString(body.postalCode, 12) || existing?.postalCode || "").toUpperCase();
  if (!/^[0-9A-Z][0-9A-Z \-]{1,9}$/.test(postalCode)) {
    fieldErrors.postalCode = "Code postal invalide.";
  } else if (
    state.shippingZones.some((z) => z.id !== existing?.id && z.postalCode === postalCode)
  ) {
    fieldErrors.postalCode = "Ce code postal est déjà configuré.";
  }

  const rawCities = body.cities;
  let cities: string[] | null = null;
  if (rawCities !== undefined) {
    const list = Array.isArray(rawCities)
      ? rawCities.map((c) => cleanString(c, 80))
      : cleanString(rawCities, 1000)
          .split(/[,;\n]/)
          .map((c) => c.trim());
    cities = [...new Set(list.filter(Boolean))];
  }

  const feeRaw = body.fee;
  let feeCents: number | null = existing?.feeCents ?? null;
  if (feeRaw !== undefined) {
    const text = cleanString(feeRaw, 20);
    if (text === "") {
      feeCents = null;
    } else {
      feeCents = parsePriceToCents(text);
      if (feeCents === null || feeCents < 0) fieldErrors.fee = "Frais de livraison invalides.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.validation("Zone de livraison invalide.", fieldErrors);
  }

  const active = body.active !== undefined ? toBoolean(body.active) : (existing?.active ?? true);

  if (existing) {
    existing.postalCode = postalCode;
    if (cities) existing.cities = cities;
    existing.feeCents = feeCents;
    existing.active = active;
    return existing;
  }

  const zone: ShippingZone = {
    id: newId(),
    postalCode,
    cities: cities ?? [],
    feeCents,
    active,
  };
  state.shippingZones.push(zone);
  return zone;
}

/* ------------------------------ Paramètres ------------------------------- */

export function updateSettings(state: State, body: Record<string, unknown>): Settings {
  const settings = state.settings;
  const fieldErrors: Record<string, string> = {};

  if (body.defaultShippingFee !== undefined) {
    const value = parsePriceToCents(cleanString(body.defaultShippingFee, 20) || "0");
    if (value === null || value < 0) fieldErrors.defaultShippingFee = "Montant invalide.";
    else settings.defaultShippingFeeCents = value;
  }

  if (body.freeShippingThreshold !== undefined) {
    const text = cleanString(body.freeShippingThreshold, 20);
    if (text === "") settings.freeShippingThresholdCents = null;
    else {
      const value = parsePriceToCents(text);
      if (value === null || value < 0) fieldErrors.freeShippingThreshold = "Montant invalide.";
      else settings.freeShippingThresholdCents = value;
    }
  }

  if (body.lowStockThreshold !== undefined) {
    const value = toInt(body.lowStockThreshold);
    if (value === null || value < 0) fieldErrors.lowStockThreshold = "Seuil invalide.";
    else settings.lowStockThreshold = value;
  }

  if (body.reservationMinutes !== undefined) {
    const value = toInt(body.reservationMinutes);
    if (value === null || value < 5 || value > 120) {
      fieldErrors.reservationMinutes = "Durée de réservation invalide (5 à 120 minutes).";
    } else settings.reservationMinutes = value;
  }

  if (body.contactEmail !== undefined) {
    settings.contactEmail = cleanString(body.contactEmail, 160);
  }

  if (body.cashOnDeliveryEnabled !== undefined) {
    settings.cashOnDeliveryEnabled = toBoolean(body.cashOnDeliveryEnabled);
  }

  if (body.cashOnDeliveryMaxCents !== undefined) {
    const text = cleanString(body.cashOnDeliveryMaxCents, 20);
    if (text === "") settings.cashOnDeliveryMaxCents = null;
    else {
      const value = parsePriceToCents(text);
      if (value === null || value <= 0) {
        fieldErrors.cashOnDeliveryMaxCents = "Montant invalide.";
      } else {
        settings.cashOnDeliveryMaxCents = value;
      }
    }
  }

  const legalKeys = ["companyName", "address", "email", "phone", "vatNumber"] as const;
  for (const key of legalKeys) {
    if (body[key] !== undefined) {
      settings.legal[key] = cleanString(body[key], 300);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.validation("Paramètres invalides.", fieldErrors);
  }

  return settings;
}
