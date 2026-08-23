import { readAsset } from "@/lib/assets";
import { errors } from "@/lib/errors";
import { jsonError, limit } from "@/lib/http";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Modèle 3D d'une fiche produit (GLB), servi à la visionneuse.
 *
 * Public, comme l'image du produit — mais uniquement pour un identifiant
 * réellement référencé par un produit visible : le magasin d'assets contient
 * aussi les fichiers vendus, qui ne doivent jamais sortir par ici.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    limit(request, "model3d", 120, 60_000);
    const { id } = await context.params;

    const state = await readState();
    const referenced = state.products.some(
      (product) =>
        product.model3d?.id === id && product.active && !product.archived,
    );
    if (!referenced) throw errors.productNotFound();

    const bytes = await readAsset(id);
    if (!bytes) throw errors.productNotFound();

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Length": String(bytes.length),
        // Un modèle change en même temps que son identifiant : il peut être mis
        // en cache longtemps sans risque de servir une version périmée.
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
