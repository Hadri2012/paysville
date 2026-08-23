import { deleteAsset, saveAsset } from "@/lib/assets";
import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";
import {
  MAX_DIGITAL_FILES,
  MAX_DIGITAL_FILE_BYTES,
  type DigitalFile,
} from "@/lib/types";
import { decodeUpload, newAssetId } from "@/lib/uploads";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Ajout d'un fichier vendu avec un produit numérique. Tout format est accepté —
 * ce sont des fichiers livrés à l'acheteur, jamais interprétés par le site.
 *
 * Le binaire est écrit dans le magasin d'assets AVANT la transaction, et
 * supprimé si celle-ci échoue : à l'inverse, un état qui référencerait un asset
 * absent donnerait un téléchargement cassé.
 */
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const upload = decodeUpload(body, MAX_DIGITAL_FILE_BYTES);
    const assetId = newAssetId();
    await saveAsset(assetId, upload.bytes);

    try {
      const product = await transaction((state) => {
        const existing = state.products.find((p) => p.id === id);
        if (!existing) throw errors.productNotFound();
        if (existing.digitalFiles.length >= MAX_DIGITAL_FILES) {
          throw errors.validation(
            `Un produit ne peut pas dépasser ${MAX_DIGITAL_FILES} fichiers.`,
          );
        }

        const file: DigitalFile = {
          id: assetId,
          name: upload.name,
          sizeBytes: upload.bytes.length,
          contentType: upload.contentType,
          createdAt: new Date().toISOString(),
        };
        existing.digitalFiles.push(file);
        // Joindre un fichier à un produit encore marqué « physique » relève de
        // l'oubli, pas de l'intention : on bascule le type avec.
        existing.kind = "digital";
        existing.stock = 0;
        existing.updatedAt = file.createdAt;
        return existing;
      });

      return jsonOk({ product });
    } catch (error) {
      await deleteAsset(assetId);
      throw error;
    }
  });
}

/** Retrait d'un fichier : la référence disparaît de l'état, puis l'asset. */
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const fileId = cleanString(new URL(request.url).searchParams.get("fichier"), 80);
    if (!fileId) throw errors.validation("Fichier à retirer non précisé.");

    const product = await transaction((state) => {
      const existing = state.products.find((p) => p.id === id);
      if (!existing) throw errors.productNotFound();
      const before = existing.digitalFiles.length;
      existing.digitalFiles = existing.digitalFiles.filter((file) => file.id !== fileId);
      if (existing.digitalFiles.length === before) {
        throw errors.validation("Ce fichier n'est pas attaché à ce produit.");
      }
      existing.updatedAt = new Date().toISOString();
      return existing;
    });

    await deleteAsset(fileId);
    return jsonOk({ product });
  });
}
