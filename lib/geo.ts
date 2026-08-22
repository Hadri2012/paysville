/**
 * Localités desservies et calcul de distance pour la livraison.
 *
 * Hadrishop livre gratuitement dans sa zone d'origine (1435, Mont-Saint-Guibert)
 * et facture les livraisons plus lointaines au prorata de la distance, jusqu'à
 * 30 km à vol d'oiseau (Brabant wallon et communes limitrophes du Namurois,
 * Gembloux inclus). Les coordonnées sont celles du centre de chaque commune :
 * suffisantes pour une distance de livraison, pas pour une précision d'adresse.
 */

export const SHOP_HUB_POSTAL_CODE = "1435";

/** Rayon de livraison maximal autour du magasin. */
export const MAX_DELIVERY_DISTANCE_KM = 30;

/** Tarif à la distance : 2 € par 5 km, soit 0,40 €/km au-delà de la zone offerte. */
export const DISTANCE_FEE_CENTS_PER_KM = 40;

interface PostalArea {
  lat: number;
  lng: number;
  cities: string[];
}

export const BELGIAN_POSTAL_AREAS: Record<string, PostalArea> = {
  "1435": { lat: 50.6672, lng: 4.635, cities: ["Mont-Saint-Guibert", "Corbais", "Hévillers"] },
  "1300": { lat: 50.7167, lng: 4.6, cities: ["Wavre", "Bierges"] },
  "1315": { lat: 50.7167, lng: 4.8167, cities: ["Incourt", "Opprebais", "Roux-Miroir", "Glimes", "Piétrebais"] },
  "1320": { lat: 50.75, lng: 4.7667, cities: ["Beauvechain", "Hamme-Mille", "L'Écluse", "Nodebais", "Tourinnes-la-Grosse"] },
  "1325": { lat: 50.6833, lng: 4.75, cities: ["Chaumont-Gistoux", "Corroy-le-Grand", "Dion-Valmont", "Longueville"] },
  "1330": { lat: 50.7186, lng: 4.5236, cities: ["Rixensart", "Genval"] },
  "1340": { lat: 50.665, lng: 4.5667, cities: ["Ottignies"] },
  "1341": { lat: 50.6553, lng: 4.59, cities: ["Céroux-Mousty"] },
  "1342": { lat: 50.68, lng: 4.55, cities: ["Limelette"] },
  "1348": { lat: 50.6681, lng: 4.6136, cities: ["Louvain-la-Neuve"] },
  "1350": { lat: 50.6833, lng: 4.9333, cities: ["Orp-Jauche", "Jandrain-Jandrenouille"] },
  "1360": { lat: 50.6167, lng: 4.8167, cities: ["Perwez", "Thorembais-Saint-Trond", "Malèves-Sainte-Marie"] },
  "1367": { lat: 50.6333, lng: 4.8833, cities: ["Ramillies", "Autre-Église", "Geest-Gérompont"] },
  "1370": { lat: 50.7167, lng: 4.8667, cities: ["Jodoigne", "Jauchelette", "Mélin", "Piétrain"] },
  "1380": { lat: 50.6833, lng: 4.45, cities: ["Lasne", "Ohain", "Plancenoit", "Maransart", "Couture-Saint-Germain"] },
  "1390": { lat: 50.7333, lng: 4.7, cities: ["Grez-Doiceau", "Archennes", "Bossut-Gottechain", "Nethen"] },
  "1400": { lat: 50.5983, lng: 4.3266, cities: ["Nivelles", "Baulers", "Thines", "Bornival"] },
  "1410": { lat: 50.7167, lng: 4.4, cities: ["Waterloo"] },
  "1420": { lat: 50.6833, lng: 4.3667, cities: ["Braine-l'Alleud"] },
  "1440": { lat: 50.6667, lng: 4.3167, cities: ["Braine-le-Château"] },
  "1450": { lat: 50.6014, lng: 4.6836, cities: ["Chastre", "Blanmont", "Cortil-Noirmont", "Gentinnes", "Saint-Géry", "Villeroux"] },
  "1457": { lat: 50.6167, lng: 4.7333, cities: ["Walhain", "Nil-Saint-Vincent", "Perbais", "Tourinnes-Saint-Lambert"] },
  "1470": { lat: 50.6167, lng: 4.45, cities: ["Genappe", "Baisy-Thy", "Bousval", "Glabais", "Loupoigne", "Vieux-Genappe", "Ways", "Houtain-le-Val"] },
  "1490": { lat: 50.6333, lng: 4.5667, cities: ["Court-Saint-Étienne"] },
  "1495": { lat: 50.5892, lng: 4.5228, cities: ["Villers-la-Ville", "Marbais", "Mellery", "Sart-Dames-Avelines", "Tilly"] },
  "5030": { lat: 50.5636, lng: 4.6989, cities: ["Gembloux", "Grand-Manil", "Beuzet", "Bothey"] },
  "5031": { lat: 50.5667, lng: 4.7667, cities: ["Grand-Leez"] },
  "5032": { lat: 50.5389, lng: 4.6667, cities: ["Isnes", "Bossière", "Corroy-le-Château", "Mazy"] },
  "5080": { lat: 50.5167, lng: 4.7333, cities: ["Rhisnes", "Champion", "Émines", "Franc-Waret", "Bovesse", "Meux", "La Bruyère"] },
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distance à vol d'oiseau entre deux points (formule de haversine), en kilomètres. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Distance depuis le magasin (1435), ou `null` si le code postal est inconnu. */
export function distanceFromHubKm(postalCode: string): number | null {
  const hub = BELGIAN_POSTAL_AREAS[SHOP_HUB_POSTAL_CODE];
  const area = BELGIAN_POSTAL_AREAS[postalCode.trim()];
  if (!hub || !area) return null;
  return haversineKm(hub, area);
}

/** Frais de livraison à la distance : 2 € par 5 km, arrondis au centime. */
export function distanceFeeCents(distanceKm: number): number {
  return Math.round(distanceKm * DISTANCE_FEE_CENTS_PER_KM);
}
