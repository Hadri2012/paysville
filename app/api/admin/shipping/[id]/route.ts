import { upsertShippingZone } from "@/lib/admin";
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

    const zone = await transaction((state) => {
      const existing = state.shippingZones.find((z) => z.id === id);
      if (!existing) throw errors.validation("Zone de livraison introuvable.");
      return upsertShippingZone(state, body, existing);
    });

    return jsonOk({ zone });
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    await transaction((state) => {
      const exists = state.shippingZones.some((z) => z.id === id);
      if (!exists) throw errors.validation("Zone de livraison introuvable.");
      state.shippingZones = state.shippingZones.filter((z) => z.id !== id);
    });

    return jsonOk({ deleted: true });
  });
}
