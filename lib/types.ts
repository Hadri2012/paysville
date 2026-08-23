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

export type PromotionType = "fixed" | "percent";

export type ReservationStatus = "active" | "consumed" | "released";

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
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  accessToken: string;
  statusHistory: OrderStatusEvent[];
  consent: {
    terms: boolean;
    termsAt: string;
    marketing: boolean;
  };
  /** Renseigné si le stock n'a pas pu être décrémenté correctement (à traiter manuellement). */
  stockWarning: string | null;
  adminNote: string;
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
