import { upsertProduct } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJson(request);
    const product = await transaction((state) => upsertProduct(state, body));
    return jsonOk({ product });
  });
}
