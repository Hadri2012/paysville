import { upsertPromotion } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJson(request);
    const promotion = await transaction((state) => upsertPromotion(state, body));
    return jsonOk({ promotion });
  });
}
