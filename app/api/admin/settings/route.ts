import { updateSettings } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Paramètres généraux : livraison, seuils, réservation, informations légales. */
export async function PATCH(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJson(request);
    const settings = await transaction((state) => updateSettings(state, body));
    return jsonOk({ settings });
  });
}
