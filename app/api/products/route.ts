import { handle, jsonOk } from "@/lib/http";
import { listPublicProducts } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const state = await readState();
    return jsonOk({ products: listPublicProducts(state) });
  });
}
