import { errors } from "./errors";
import { isSafeImageUrl } from "./images";
import type { Bike, BikeKind, State } from "./types";
import { cleanString, toBoolean } from "./validation";

export const MAX_FEATURES = 8;

function parseFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const features: string[] = [];
  for (const entry of raw.slice(0, MAX_FEATURES)) {
    const text = cleanString(entry, 60);
    if (text) features.push(text);
  }
  return features;
}

export function getBike(state: State, kind: BikeKind): Bike {
  const bike = state.bikes.find((b) => b.kind === kind);
  if (!bike) throw errors.requestNotFound();
  return bike;
}

export function updateBike(state: State, kind: BikeKind, body: Record<string, unknown>): Bike {
  const bike = getBike(state, kind);
  const fieldErrors: Record<string, string> = {};

  const name = body.name !== undefined ? cleanString(body.name, 80) : bike.name;
  if (name.length < 2) fieldErrors.name = "Nom requis.";

  const description = body.description !== undefined ? cleanString(body.description, 1000) : bike.description;

  const imageUrl = body.imageUrl !== undefined ? cleanString(body.imageUrl, 2000) : bike.imageUrl;
  if (!isSafeImageUrl(imageUrl)) {
    fieldErrors.imageUrl = "URL d'image invalide (http(s), chemin /... ou data:image).";
  }

  const features = body.features !== undefined ? parseFeatures(body.features) : bike.features;
  const active = body.active !== undefined ? toBoolean(body.active) : bike.active;

  if (Object.keys(fieldErrors).length > 0) {
    throw errors.validation("Formulaire velo invalide.", fieldErrors);
  }

  bike.name = name;
  bike.description = description;
  bike.imageUrl = imageUrl;
  bike.features = features;
  bike.active = active;
  bike.updatedAt = new Date().toISOString();
  return bike;
}
