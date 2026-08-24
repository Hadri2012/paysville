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

/**
 * Limite de débit indépendante de l'adresse IP, par une clé propre à l'appelant
 * (ex. l'e-mail visé, le numéro de commande interrogé).
 *
 * `limit()` seul ne suffit pas à protéger un point d'accès qui authentifie par
 * un secret à deviner (mot de passe admin, numéro de commande) : il repose sur
 * `X-Forwarded-For`, un en-tête que le client contrôle entièrement tant que rien
 * en amont ne le réécrit. Changer sa valeur à chaque requête change de « client »
 * aux yeux du limiteur et rend `limit()` inopérant — vérifié en conditions
 * réelles (voir le correctif qui a introduit cette fonction). `limitKey` borne
 * plutôt les tentatives visant une même cible, ce qui ne dépend d'aucun en-tête :
 * deviner un numéro de commande ou un mot de passe reste couteux même en
 * changeant d'adresse IP prétendue à chaque essai.
 */
export function limitKey(key: string, max: number, windowMs: number): void {
  if (!rateLimit(key, max, windowMs)) {
    throw errors.rateLimited();
  }
}

/**
 * Plafond global, tous appelants confondus, pour un point d'accès public sans
 * secret à deviner (checkout, dépôt/vote/signalement d'avis, téléchargement) :
 * `limitKey` n'y a pas de cible évidente à identifier, mais `limit()` seul
 * reste contournable en changeant d'adresse IP prétendue à chaque requête (même
 * faille que celle qui a introduit `limitKey`). Sans ce filet, un abus reparti
 * sur de fausses IP peut gonfler l'état sans fin (avis, commandes) ou saturer
 * la bande passante, sans jamais être ralenti par une limite censée s'appliquer.
 * Le plafond est fixé large — un multiple de la limite par IP — pour ne gêner
 * aucun usage légitime, y compris un pic de plusieurs client·e·s à la fois ; il
 * ne vise que l'automatisation à grande échelle.
 */
export function limitGlobal(scope: string, max: number, windowMs: number): void {
  if (!rateLimit(`global:${scope}`, max, windowMs)) {
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
