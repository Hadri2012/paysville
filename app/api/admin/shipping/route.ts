import { upsertShippingZone } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Création d'une zone de livraison. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJson(request);
    const zone = await transaction((state) => upsertShippingZone(state, body));
    return jsonOk({ zone });
  });
}
