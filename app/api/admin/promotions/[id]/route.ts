import { upsertPromotion } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const promotion = await transaction((state) => {
      const existing = state.promotions.find((p) => p.id === id);
      if (!existing) throw errors.validation("Code promotionnel introuvable.");
      if (body.archived !== undefined && Object.keys(body).length === 1) {
        existing.archived = body.archived === true || body.archived === "true";
        if (existing.archived) existing.active = false;
        existing.updatedAt = new Date().toISOString();
        return existing;
      }
      return upsertPromotion(state, body, existing);
    });

    return jsonOk({ promotion });
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    const result = await transaction((state) => {
      const existing = state.promotions.find((p) => p.id === id);
      if (!existing) throw errors.validation("Code promotionnel introuvable.");
      if (existing.uses === 0) {
        state.promotions = state.promotions.filter((p) => p.id !== id);
        return { deleted: true, archived: false };
      }
      // Un code déjà utilisé est archivé pour garder l'historique des commandes.
      existing.archived = true;
      existing.active = false;
      existing.updatedAt = new Date().toISOString();
      return { deleted: false, archived: true };
    });

    return jsonOk(result);
  });
}
