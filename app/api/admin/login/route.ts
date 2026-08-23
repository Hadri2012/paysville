import { NextResponse } from "next/server";
import { ADMIN_COOKIE, SESSION_MAX_AGE, login, sessionCookieOptions } from "@/lib/auth";
import { assertSameOrigin, handle, limit, limitKey, readJson } from "@/lib/http";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    limit(request, "admin-login", 8, 5 * 60_000);

    const body = await readJson(request);
    const email = cleanString(body.email, 160);
    const password = typeof body.password === "string" ? body.password : "";

    // Second verrou, indépendant de l'adresse IP prétendue : borne les
    // tentatives visant CE compte, quel que soit le nombre d'adresses
    // différentes annoncées par l'appelant (voir `limitKey`).
    if (email) limitKey(`admin-login-target:${email.toLowerCase()}`, 8, 5 * 60_000);

    const token = await login(email, password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
    return response;
  });
}
