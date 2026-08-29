import { requireAdmin } from "@/lib/auth";
import { updateBike } from "@/lib/bikes";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";
import { BIKE_KINDS, type BikeKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ kind: string }> };

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { kind } = await context.params;
    if (!BIKE_KINDS.includes(kind as BikeKind)) throw errors.requestNotFound();
    const body = await readJson(request);

    const bike = await transaction((state) => updateBike(state, kind as BikeKind, body));

    return jsonOk({ bike });
  });
}
