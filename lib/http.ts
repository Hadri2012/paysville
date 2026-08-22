import { NextResponse } from "next/server";
import { AppError, errors, toErrorPayload } from "./errors";
import { clientKey, rateLimit } from "./ratelimit";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data as object, { status: 200, ...init });
}

export function jsonError(error: unknown): NextResponse {
  const { status, body } = toErrorPayload(error);
  return NextResponse.json(body, { status });
}

/** Enveloppe standard : toute exception devient une réponse JSON sûre. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    return jsonError(error);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw errors.validation("Requête invalide.");
    }
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.validation("Requête invalide (JSON attendu).");
  }
}

/**
 * Protection CSRF : les requêtes mutantes doivent provenir de la même origine.
 * (Le cookie de session est déjà en SameSite=Lax.)
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw errors.unauthorized();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw errors.unauthorized();
  }
}

export function limit(request: Request, scope: string, max: number, windowMs: number): void {
  if (!rateLimit(clientKey(request, scope), max, windowMs)) {
    throw errors.rateLimited();
  }
}

/** URL publique du site, utilisée pour les redirections Stripe. */
export function siteUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (request) {
    const host = request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto") ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }
  return "http://localhost:3000";
}
