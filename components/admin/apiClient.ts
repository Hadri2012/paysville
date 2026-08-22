export type ApiResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; message: string; details?: Record<string, string> };

/** Appel JSON authentifié par le cookie de session admin (httpOnly). */
export async function apiCall(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: data?.error?.message ?? "Opération impossible.",
        details:
          data?.error?.details && typeof data.error.details === "object"
            ? (data.error.details as Record<string, string>)
            : undefined,
      };
    }
    return { ok: true, data: data as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Connexion au serveur impossible." };
  }
}
