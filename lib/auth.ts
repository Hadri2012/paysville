import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { errors } from "./errors";
import { newId, newToken } from "./ids";
import { readState, transaction } from "./store";
import type { AdminUser, State } from "./types";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const ADMIN_COOKIE = "hadrishop_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const SCRYPT_KEYLEN = 64;

/** Stockage du mot de passe : scrypt + sel aléatoire. Jamais de mot de passe en clair. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function pruneSessions(state: State, now = Date.now()): void {
  state.sessions = state.sessions.filter((s) => Date.parse(s.expiresAt) > now);
}

/**
 * Connexion administrateur. Au premier démarrage, le compte est créé à partir des
 * variables d'environnement ADMIN_EMAIL / ADMIN_PASSWORD (le mot de passe est
 * immédiatement haché puis conservé en base — l'environnement n'est plus nécessaire).
 */
export async function login(email: string, password: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) throw errors.invalidCredentials();

  const bootstrapEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_PASSWORD ?? "";

  let passwordHashForBootstrap: string | null = null;
  const needsBootstrap =
    bootstrapEmail !== "" &&
    bootstrapPassword !== "" &&
    normalizedEmail === bootstrapEmail;
  if (needsBootstrap) {
    // Le hachage est coûteux : on le prépare hors transaction.
    passwordHashForBootstrap = await hashPassword(bootstrapPassword);
  }

  const admin = await transaction<AdminUser | null>((state) => {
    pruneSessions(state);
    let found = state.admins.find((a) => a.email === normalizedEmail) ?? null;
    if (!found && needsBootstrap && passwordHashForBootstrap) {
      found = {
        id: newId(),
        email: bootstrapEmail,
        passwordHash: passwordHashForBootstrap,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      state.admins.push(found);
    }
    return found;
  });

  if (!admin) throw errors.invalidCredentials();

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) throw errors.invalidCredentials();

  const token = newToken(32);
  await transaction((state) => {
    pruneSessions(state);
    const stored = state.admins.find((a) => a.id === admin.id);
    if (stored) stored.lastLoginAt = new Date().toISOString();
    state.sessions.push({
      tokenHash: hashToken(token),
      adminId: admin.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
  });

  return token;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await transaction((state) => {
    state.sessions = state.sessions.filter((s) => s.tokenHash !== tokenHash);
  });
}

export interface AdminIdentity {
  id: string;
  email: string;
}

/** Renvoie l'administrateur connecté, ou null. Toute la sécurité admin passe par ici. */
export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  const state = await readState();
  const session = state.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const admin = state.admins.find((a) => a.id === session.adminId);
  return admin ? { id: admin.id, email: admin.email } : null;
}

export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await getCurrentAdmin();
  if (!admin) throw errors.unauthorized();
  return admin;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export const SESSION_MAX_AGE = SESSION_TTL_MS / 1000;
