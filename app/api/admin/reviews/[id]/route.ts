import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";
import { toBoolean } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Approuve ou remet en attente un avis (`{ approved: boolean }`). */
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const review = await transaction((state) => {
      const found = state.reviews.find((r) => r.id === id);
      if (!found) throw errors.validation("Avis introuvable.");
      found.approved = toBoolean(body.approved);
      found.moderatedAt = new Date().toISOString();
      return found;
    });

    return jsonOk({ review });
  });
}

/** Suppression définitive d'un avis (spam, doublon, demande du client). */
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    await transaction((state) => {
      const exists = state.reviews.some((r) => r.id === id);
      if (!exists) throw errors.validation("Avis introuvable.");
      state.reviews = state.reviews.filter((r) => r.id !== id);
    });

    return jsonOk({ deleted: true });
  });
}
