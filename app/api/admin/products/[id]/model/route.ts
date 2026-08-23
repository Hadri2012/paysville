import { deleteAsset, saveAsset } from "@/lib/assets";
import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";
import { MAX_MODEL3D_BYTES } from "@/lib/types";
import { decodeUpload, isGlbFile, newAssetId } from "@/lib/uploads";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Modèle 3D d'une fiche produit. Un seul par produit, et uniquement du GLB :
 * c'est le seul format que la visionneuse sait lire, et l'en-tête du fichier
 * est vérifiée ici pour éviter qu'un mauvais export ne s'affiche jamais côté
 * client sans explication.
 */
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const upload = decodeUpload(body, MAX_MODEL3D_BYTES);
    if (!isGlbFile(upload.bytes)) {
      throw errors.validation(
        "Le modèle 3D doit être un fichier .glb (glTF binaire). Un .stl ou un .obj peut être converti en GLB avant l'envoi.",
      );
    }

    const assetId = newAssetId();
    await saveAsset(assetId, upload.bytes);

    try {
      const { product, previousId } = await transaction((state) => {
        const existing = state.products.find((p) => p.id === id);
        if (!existing) throw errors.productNotFound();
        const previous = existing.model3d?.id ?? null;
        existing.model3d = {
          id: assetId,
          name: upload.name,
          sizeBytes: upload.bytes.length,
        };
        existing.updatedAt = new Date().toISOString();
        return { product: existing, previousId: previous };
      });

      // Le remplacement n'a de sens qu'une fois le nouveau modèle en place.
      if (previousId) await deleteAsset(previousId);
      return jsonOk({ product });
    } catch (error) {
      await deleteAsset(assetId);
      throw error;
    }
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    const { product, removedId } = await transaction((state) => {
      const existing = state.products.find((p) => p.id === id);
      if (!existing) throw errors.productNotFound();
      const removed = existing.model3d?.id ?? null;
      existing.model3d = null;
      existing.updatedAt = new Date().toISOString();
      return { product: existing, removedId: removed };
    });

    if (removedId) await deleteAsset(removedId);
    return jsonOk({ product });
  });
}
