/**
 * Erreurs applicatives : un code stable + un message français destiné au client.
 * Les traces techniques ne sortent jamais du serveur (voir `toResponse`).
 */
export class AppError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errors = {
  productNotFound: (name?: string) =>
    new AppError(
      "product_not_found",
      name
        ? `Le produit « ${name} » n'est plus disponible dans la boutique.`
        : "Ce produit est introuvable ou n'est plus disponible.",
      404,
    ),
  outOfStock: (name: string) =>
    new AppError("out_of_stock", `« ${name} » est en rupture de stock.`, 409),
  insufficientStock: (name: string, available: number) =>
    new AppError(
      "insufficient_stock",
      available > 0
        ? `Il ne reste que ${available} exemplaire${available > 1 ? "s" : ""} de « ${name} ».`
        : `« ${name} » n'est plus disponible en quantité suffisante.`,
      409,
    ),
  emptyCart: () =>
    new AppError("empty_cart", "Votre panier est vide.", 400),
  invalidPromo: (reason?: string) =>
    new AppError(
      "invalid_promo",
      reason ?? "Ce code promotionnel n'est pas valide.",
      400,
    ),
  shippingNotCovered: () =>
    new AppError(
      "shipping_not_covered",
      "Nous ne livrons pas encore à cette adresse. Hadrishop livre uniquement dans les communes indiquées sur la page Livraison.",
      400,
    ),
  invalidCustomerData: (details: Record<string, string>) =>
    new AppError(
      "invalid_customer_data",
      "Certaines informations du formulaire sont incorrectes ou incomplètes.",
      400,
      details,
    ),
  termsRequired: () =>
    new AppError(
      "terms_required",
      "Vous devez accepter les conditions générales de vente pour commander.",
      400,
    ),
  stripeNotConfigured: () =>
    new AppError(
      "stripe_not_configured",
      "Le paiement en ligne n'est pas encore configuré. Merci de réessayer plus tard.",
      503,
    ),
  stripeError: () =>
    new AppError(
      "stripe_error",
      "Le service de paiement est momentanément indisponible. Aucun montant n'a été débité.",
      502,
    ),
  orderNotFound: () =>
    new AppError(
      "order_not_found",
      "Aucune commande ne correspond à ces informations.",
      404,
    ),
  orderNotEditable: () =>
    new AppError(
      "order_not_editable",
      "Cette commande ne peut plus être modifiée. Les modifications ne sont possibles que jusqu'à la préparation.",
      409,
    ),
  shippingFeeChanged: () =>
    new AppError(
      "shipping_fee_changed",
      "Cette nouvelle adresse changerait les frais de livraison de la commande. Contactez-nous pour ce type de modification.",
      409,
    ),
  downloadNotAvailable: () =>
    new AppError(
      "download_not_available",
      "Ce fichier n'est pas disponible au téléchargement pour cette commande.",
      404,
    ),
  unauthorized: () =>
    new AppError("unauthorized", "Authentification requise.", 401),
  invalidCredentials: () =>
    new AppError(
      "invalid_credentials",
      "Adresse e-mail ou mot de passe incorrect.",
      401,
    ),
  rateLimited: () =>
    new AppError(
      "rate_limited",
      "Trop de tentatives. Merci de patienter quelques instants avant de réessayer.",
      429,
    ),
  validation: (message: string, details?: unknown) =>
    new AppError("validation_error", message, 400, details),
  server: () =>
    new AppError(
      "server_error",
      "Une erreur est survenue de notre côté. Merci de réessayer dans un instant.",
      500,
    ),
};

/** Transforme n'importe quelle exception en réponse JSON sûre. */
export function toErrorPayload(error: unknown): {
  status: number;
  body: { error: { code: string; message: string; details?: unknown } };
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: { code: error.code, message: error.message, details: error.details },
      },
    };
  }
  // Trace technique : uniquement dans les logs serveur.
  console.error("[hadrishop] erreur inattendue", error);
  const fallback = errors.server();
  return {
    status: fallback.status,
    body: { error: { code: fallback.code, message: fallback.message } },
  };
}
