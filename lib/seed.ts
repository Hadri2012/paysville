import { BELGIAN_POSTAL_AREAS } from "./geo";
import { newId, slugify } from "./ids";
import type { Product, Promotion, ShippingZone, State } from "./types";

/**
 * Zones de livraison par défaut : la zone d'origine (1435, offerte) puis toutes
 * les communes connues dans `lib/geo.ts` (jusqu'à 30 km, Gembloux inclus), dont le
 * tarif est calculé à la distance (`feeCents: null`). Utilisé à la fois pour
 * l'amorçage d'une base neuve et pour la migration d'une base existante
 * (voir `normalize()` dans `lib/store.ts`).
 */
export function defaultShippingZones(): ShippingZone[] {
  return Object.entries(BELGIAN_POSTAL_AREAS).map(([postalCode, area]) => ({
    id: newId(),
    postalCode,
    cities: area.cities,
    feeCents: null,
    active: true,
  }));
}

/** Code promo de démarrage, pour valider le parcours d'achat sans en créer un manuellement. */
export function defaultPromotion(): Promotion {
  const now = new Date().toISOString();
  return {
    id: newId(),
    code: "BIENVENUE10",
    active: true,
    type: "percent",
    value: 10,
    startsAt: null,
    endsAt: null,
    minSubtotalCents: null,
    maxUses: null,
    uses: 0,
    // Code de bienvenue : une remise par client, pas une remise permanente.
    oncePerCustomer: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Catalogue initial demandé dans le cahier des charges (modifiable ensuite depuis /admin). */
const INITIAL_CATALOG: {
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  category: string;
  description: string;
}[] = [
  {
    sku: "P2",
    name: "Porte casque",
    priceCents: 299,
    stock: 3,
    category: "Bureau & gaming",
    description:
      "Support imprimé en 3D pour suspendre proprement votre casque audio sous le bureau ou sur une étagère.",
  },
  {
    sku: "P3",
    name: "Marque-pages custom",
    priceCents: 179,
    stock: 3,
    category: "Accessoires",
    description:
      "Marque-page personnalisable, fin et résistant, pour retrouver votre page sans corner le papier.",
  },
  {
    sku: "P4",
    name: "Boîte rangement frigo",
    priceCents: 199,
    stock: 2,
    category: "Cuisine",
    description:
      "Petite boîte de rangement empilable qui organise les étagères du frigo et évite les pertes de place.",
  },
  {
    sku: "P5",
    name: "Porte-clé custom",
    priceCents: 199,
    stock: 3,
    category: "Accessoires",
    description:
      "Porte-clé personnalisable, léger et solide, idéal comme petit cadeau ou pour identifier son trousseau.",
  },
  {
    sku: "P6",
    name: "Porte téléphone",
    priceCents: 419,
    stock: 3,
    category: "Bureau & gaming",
    description:
      "Support de téléphone stable, incliné pour un confort de lecture optimal sur un bureau ou une table de nuit.",
  },
  {
    sku: "P7",
    name: "Porte manette PS4",
    priceCents: 179,
    stock: 3,
    category: "Bureau & gaming",
    description:
      "Support mural ou de bureau conçu pour accueillir une manette PS4 sans la rayer.",
  },
  {
    sku: "P8",
    name: "Objet clés",
    priceCents: 129,
    stock: 3,
    category: "Accessoires",
    description:
      "Petit accessoire pratique pour regrouper et retrouver ses clés en un seul geste.",
  },
  {
    sku: "P9",
    name: "Porte manette Switch",
    priceCents: 219,
    stock: 3,
    category: "Bureau & gaming",
    description:
      "Support dédié aux manettes Switch, pour garder votre coin gaming rangé.",
  },
  {
    sku: "P10",
    name: "Porte brosse à dents V1",
    priceCents: 149,
    stock: 3,
    category: "Salle de bain",
    description:
      "Support de brosse à dents version 1 : simple, compact, facile à nettoyer.",
  },
  {
    sku: "P11",
    name: "Porte brosse à dents V2",
    priceCents: 129,
    stock: 3,
    category: "Salle de bain",
    description:
      "Support de brosse à dents version 2 : design revu, encore plus discret sur le lavabo.",
  },
  {
    sku: "P12",
    name: "Jeton caddie",
    priceCents: 109,
    stock: 3,
    category: "Accessoires",
    description:
      "Jeton de caddie réutilisable à garder sur son porte-clé, fini la pièce d'un euro oubliée.",
  },
  {
    sku: "P13",
    name: "Ouvre-canette",
    priceCents: 109,
    stock: 3,
    category: "Accessoires",
    description:
      "Petit outil qui ouvre les canettes sans casser d'ongle, pratique et facile à transporter.",
  },
  {
    sku: "P14",
    name: "Presse-savon",
    priceCents: 299,
    stock: 0,
    category: "Salle de bain",
    description:
      "Presse-savon qui permet de récupérer les restes de savon et d'en refaire un bloc utilisable.",
  },
];

export function initialState(): State {
  const now = new Date().toISOString();
  const products: Product[] = INITIAL_CATALOG.map((entry, index) => ({
    id: newId(),
    sku: entry.sku,
    slug: slugify(entry.name),
    name: entry.name,
    description: entry.description,
    priceCents: entry.priceCents,
    stock: entry.stock,
    imageUrl: "",
    active: true,
    category: entry.category,
    sortOrder: (index + 1) * 10,
    archived: false,
    kind: "physical",
    digitalFiles: [],
    model3d: null,
    createdAt: now,
    updatedAt: now,
  }));

  return {
    schemaVersion: 3,
    settings: {
      shopName: "Hadrishop",
      currency: "EUR",
      // Adresse de contact affichée dans le pied de page. Modifiable à tout moment
      // depuis Administration → Paramètres : cette valeur ne sert qu'au premier
      // démarrage, sur une base encore vide.
      contactEmail: "hadrienw@icloud.com",
      defaultShippingFeeCents: 0,
      freeShippingThresholdCents: null,
      lowStockThreshold: 2,
      reservationMinutes: 15,
      legal: {
        companyName: "",
        address: "",
        email: "",
        phone: "",
        vatNumber: "",
      },
    },
    products,
    orders: [],
    promotions: [defaultPromotion()],
    reviews: [],
    shippingZones: defaultShippingZones(),
    reservations: [],
    admins: [],
    sessions: [],
    counters: { orderSeq: {} },
  };
}
