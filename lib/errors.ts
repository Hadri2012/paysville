/**
 * Erreurs applicatives : un code stable + un message français destiné au client.
 * Les traces techniques ne sortent jamais du serveur (voir `toErrorPayload`).
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
  unauthorized: () => new AppError("unauthorized", "Authentification requise.", 401),
  invalidCredentials: () =>
    new AppError("invalid_credentials", "Adresse e-mail ou mot de passe incorrect.", 401),
  rateLimited: () =>
    new AppError(
      "rate_limited",
      "Trop de tentatives. Merci de patienter quelques instants avant de réessayer.",
      429,
    ),
  validation: (message: string, details?: unknown) =>
    new AppError("validation_error", message, 400, details),
  invalidRequestData: (details: Record<string, string>) =>
    new AppError(
      "invalid_request_data",
      "Certaines informations du formulaire sont incorrectes ou incomplètes.",
      400,
      details,
    ),
  termsRequired: () =>
    new AppError(
      "terms_required",
      "Vous devez accepter les conditions de location pour envoyer une demande.",
      400,
    ),
  bikeUnavailable: (name?: string) =>
    new AppError(
      "bike_unavailable",
      name
        ? `« ${name} » n'est actuellement pas disponible à la location.`
        : "Ce vélo n'est actuellement pas disponible à la location.",
      409,
    ),
  invalidPeriod: (message = "La période choisie n'est pas valide.") =>
    new AppError("invalid_period", message, 400),
  overlap: (name?: string) =>
    new AppError(
      "overlap",
      name
        ? `« ${name} » est déjà réservé sur une période qui chevauche celle-ci.`
        : "Ce vélo est déjà réservé sur une période qui chevauche celle-ci.",
      409,
    ),
  requestNotFound: () =>
    new AppError(
      "request_not_found",
      "Aucune demande ne correspond à ces informations.",
      404,
    ),
  invalidStatus: () => new AppError("invalid_status", "Statut de demande inconnu.", 400),
  invalidTransition: (message: string) =>
    new AppError("invalid_transition", message, 409),
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
  console.error("[veloloc] erreur inattendue", error);
  const fallback = errors.server();
  return {
    status: fallback.status,
    body: { error: { code: fallback.code, message: fallback.message } },
  };
}
