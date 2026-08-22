import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, destroySession, sessionCookieOptions } from "@/lib/auth";
import { assertSameOrigin, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const store = await cookies();
    await destroySession(store.get(ADMIN_COOKIE)?.value);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, "", sessionCookieOptions(0));
    return response;
  });
}
