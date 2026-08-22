import { handle, jsonOk, limit, readJson } from "@/lib/http";
import { buildQuote } from "@/lib/shop";
import { readState } from "@/lib/store";
import { cleanString, parseCartItems } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Recalcule un panier côté serveur : prix réels, stock disponible, code promo et
 * frais de livraison. Le navigateur n'envoie que des identifiants et des quantités.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "quote", 120, 60_000);
    const body = await readJson(request);
    const items = parseCartItems(body.items);
    const state = await readState();
    const quote = buildQuote(state, {
      items,
      promoCode: cleanString(body.promoCode, 40) || null,
      postalCode: cleanString(body.postalCode, 12) || null,
      city: cleanString(body.city, 80) || null,
      strict: false,
    });
    return jsonOk({ quote });
  });
}
