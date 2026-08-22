import { upsertProduct } from "@/lib/admin";
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

    const product = await transaction((state) => {
      const existing = state.products.find((p) => p.id === id);
      if (!existing) throw errors.productNotFound();
      if (body.archived !== undefined) {
        existing.archived = body.archived === true || body.archived === "true";
        existing.updatedAt = new Date().toISOString();
        if (Object.keys(body).length === 1) return existing;
      }
      return upsertProduct(state, body, existing);
    });

    return jsonOk({ product });
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const permanent = new URL(request.url).searchParams.get("mode") === "permanent";

    const result = await transaction((state) => {
      const existing = state.products.find((p) => p.id === id);
      if (!existing) throw errors.productNotFound();

      const usedInOrder = state.orders.some((o) =>
        o.items.some((item) => item.productId === id),
      );
      if (permanent && !usedInOrder) {
        state.products = state.products.filter((p) => p.id !== id);
        return { deleted: true, archived: false };
      }
      existing.archived = true;
      existing.active = false;
      existing.updatedAt = new Date().toISOString();
      return { deleted: false, archived: true };
    });

    return jsonOk(result);
  });
}
