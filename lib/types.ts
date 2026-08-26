/**
 * Modèle de données Hadrishop.
 * Tous les montants sont stockés en centimes (entiers) pour éviter les erreurs de virgule flottante.
 */

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "preparing"
  | "ready"
  | "shipped"
  | "delivered"
  | "canceled"
  | "refunded";

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled" | "refunded";

/**
 * Comment la commande est réglée.
 *
 * `stripe` : carte bancaire, avant préparation — la commande n'est ferme qu'une
 * fois le paiement confirmé.
 * `cash_on_delivery` : espèces remises au livreur. La commande est ferme dès sa
 * validation (le stock part immédiatement), et son `paymentStatus` reste
 * `pending` jusqu'à la remise en main propre. Les deux notions sont donc bien
 * distinctes : « commande confirmée » n'y veut pas dire « commande payée ».
 */
export type PaymentMethod = "stripe" | "cash_on_delivery";

export type PromotionType = "fixed" | "percent";

export type ReservationStatus = "active" | "consumed" | "released";

/**
 * Nature d'un produit : objet expédié, ou fichier(s) remis par téléchargement.
 * Un produit numérique n'a ni stock ni frais de livraison — l'achat donne accès
 * aux fichiers attachés, quel que soit leur format.
 */
export type ProductKind = "physical" | "digital";

/**
 * Fichier vendu avec un produit numérique. Seules les métadonnées vivent ici :
 * le contenu binaire est rangé dans le magasin d'assets (`lib/assets.ts`), pour
 * ne pas alourdir le document JSON relu à chaque requête.
 */
export interface DigitalFile {
  /** Identifiant de l'asset binaire correspondant. */
  id: string;
  /** Nom de fichier d'origine, renvoyé tel quel au téléchargement. */
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
}

/** Modèle 3D (GLB) affiché en visionneuse interactive sur la fiche produit. */
export interface Product3DModel {
  /** Identifiant de l'asset binaire correspondant. */
  id: string;
  name: string;
  sizeBytes: number;
}

/** Bornes des fichiers joints à un produit (vendus ou modèle 3D). */
export const MAX_DIGITAL_FILES = 10;
export const MAX_DIGITAL_FILE_BYTES = 10_000_000;
export const MAX_MODEL3D_BYTES = 6_000_000;

export interface Product {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  active: boolean;
  category: string;
  sortOrder: number;
  archived: boolean;
  /** `physical` (défaut) ou `digital` : fichier(s) livrés par téléchargement. */
  kind: ProductKind;
  /** Fichiers remis à l'achat quand `kind === "digital"`. */
  digitalFiles: DigitalFile[];
  /** Modèle 3D optionnel (aperçu interactif), quel que soit le type de produit. */
  model3d: Product3DModel | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  imageUrl: string;
  /** Nature de l'article au moment de l'achat : conditionne stock et livraison. */
  kind: ProductKind;
}

export interface OrderCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface OrderAddress {
  street: string;
  streetNumber: string;
  complement: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  at: string;
  note?: string;
}

export interface Order {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  customer: OrderCustomer;
  address: OrderAddress;
  note: string;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  promoCode: string | null;
  promotionId: string | null;
  shippingCents: number;
  totalCents: number;
  currency: string;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  /** Carte bancaire (Stripe) ou espèces à la livraison. */
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  accessToken: string;
  statusHistory: OrderStatusEvent[];
  consent: {
    terms: boolean;
    termsAt: string;
    marketing: boolean;
  };
  /**
   * Le stock de cette commande est décompté du catalogue.
   *
   * Passe à vrai quand la commande devient ferme — confirmation du paiement
   * Stripe, ou validation d'une commande payable à la livraison — et repasse à
   * faux quand les articles retournent en rayon. Une commande en espèces engage
   * son stock **sans être payée** : sans ce champ, l'annuler laisserait les
   * articles hors catalogue, puisque les remises en rayon se déclenchaient
   * jusqu'ici sur « la commande était payée ».
   */
  stockCommitted: boolean;
  /** Renseigné si le stock n'a pas pu être décrémenté correctement (à traiter manuellement). */
  stockWarning: string | null;
  adminNote: string;
  /**
   * Étapes pour lesquelles un e-mail a déjà été envoyé au client.
   *
   * Réservé dans la transaction qui fait changer l'état, donc au plus une fois
   * par étape même si deux webhooks Stripe arrivent ensemble. Recevoir deux fois
   * « votre colis est parti » ferait douter de la commande ; c'est ce que ce
   * garde-fou empêche.
   */
  notifiedStatuses: OrderStatus[];
}

export interface Promotion {
  id: string;
  code: string;
  active: boolean;
  type: PromotionType;
  /** centimes si `fixed`, pourcentage entier (1-100) si `percent` */
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  minSubtotalCents: number | null;
  maxUses: number | null;
  uses: number;
  /**
   * Un code par client : une adresse e-mail qui a déjà payé une commande avec ce
   * code ne peut plus l'utiliser. Distinct de `maxUses`, qui borne le total toutes
   * personnes confondues.
   */
  oncePerCustomer: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Réponse publique de la boutique sous un avis. */
export interface ReviewReply {
  text: string;
  at: string;
}

/** Longueur maximale d'une réponse de la boutique (partagée avec le formulaire admin). */
export const MAX_REPLY_LENGTH = 800;

/**
 * Photos jointes à un avis. Elles sont stockées en data-URI dans le document JSON
 * de la boutique, donc bornées serré : le navigateur redimensionne avant l'envoi et
 * le serveur refuse ce qui dépasse. Sans cela, quelques dizaines d'avis illustrés
 * suffiraient à alourdir chaque lecture de la base.
 */
export const MAX_REVIEW_PHOTOS = 2;
export const MAX_REVIEW_PHOTO_BYTES = 320_000;

/**
 * Avis client sur un produit. Publié immédiatement, mais signalé automatiquement
 * si le filtre anti-spam détecte du contenu suspect.
 */
export interface Review {
  id: string;
  productId: string;
  author: string;
  /** Entier de 1 à 5. */
  rating: number;
  comment: string;
  flagged: boolean;
  /**
   * Achat confirmé : au dépôt de l'avis, une commande payée contenant ce produit
   * portait l'adresse e-mail donnée par l'auteur. L'e-mail lui-même n'est pas
   * conservé — seul le résultat de la vérification l'est.
   */
  verified: boolean;
  /** Réponse de la boutique, affichée sous l'avis. `null` tant qu'il n'y en a pas. */
  reply: ReviewReply | null;
  /** Votes « cet avis m'a été utile » / « pas utile ». */
  helpfulYes: number;
  helpfulNo: number;
  /** Photos jointes par l'auteur, en data-URI. */
  photos: string[];
  /**
   * Signalements déposés par des visiteurs. Ne masque rien tout seul : c'est une
   * file de lecture pour la boutique, qui décide seule de marquer ou de supprimer.
   */
  reports: number;
  createdAt: string;
}

export interface ShippingZone {
  id: string;
  postalCode: string;
  cities: string[];
  /** null = utilise les frais de livraison par défaut */
  feeCents: number | null;
  active: boolean;
}

export interface Reservation {
  id: string;
  orderId: string;
  items: { productId: string; quantity: number }[];
  createdAt: string;
  expiresAt: string;
  status: ReservationStatus;
}

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminSession {
  tokenHash: string;
  adminId: string;
  createdAt: string;
  expiresAt: string;
}

export interface Settings {
  shopName: string;
  currency: string;
  contactEmail: string;
  defaultShippingFeeCents: number;
  /** null = pas de livraison offerte */
  freeShippingThresholdCents: number | null;
  lowStockThreshold: number;
  reservationMinutes: number;
  /**
   * Proposer le paiement en espèces à la livraison.
   *
   * Désactivé au démarrage : encaisser du liquide engage la boutique bien
   * au-delà du code (présence à la remise, monnaie, comptabilité). C'est une
   * décision qui se prend, pas un réglage qu'on découvre activé.
   */
  cashOnDeliveryEnabled: boolean;
  /**
   * Plafond du total réglable en espèces, `null` pour aucun plafond. Le livreur
   * ne transporte pas la caisse : au-delà d'un certain montant, faire la monnaie
   * devient un problème, et l'impayé une perte sèche puisque rien n'a été
   * encaissé d'avance.
   */
  cashOnDeliveryMaxCents: number | null;
  legal: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
    vatNumber: string;
  };
}

export interface State {
  schemaVersion: number;
  settings: Settings;
  products: Product[];
  orders: Order[];
  promotions: Promotion[];
  reviews: Review[];
  shippingZones: ShippingZone[];
  reservations: Reservation[];
  admins: AdminUser[];
  sessions: AdminSession[];
  counters: { orderSeq: Record<string, number> };
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "En attente de paiement",
  paid: "Paiement confirmé",
  preparing: "En préparation",
  ready: "Prête",
  shipped: "Expédiée",
  delivered: "Livrée",
  canceled: "Annulée",
  refunded: "Remboursée",
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "En attente",
  paid: "Payé",
  failed: "Échoué",
  canceled: "Annulé",
  refunded: "Remboursé",
};

export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  stripe: "Carte bancaire",
  cash_on_delivery: "Espèces à la livraison",
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as string[]).includes(value);
}
