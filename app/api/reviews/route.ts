import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, limit, readJson } from "@/lib/http";
import { createReview } from "@/lib/reviews";
import { transaction } from "@/lib/store";
import { cleanString, toInt } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Dépôt d'un avis client. Le formulaire est public : la limitation de débit et le
 * filtrage automatique du spam sont les deux seules barrières — les avis sont
 * publiés immédiatement, sauf s'ils sont détectés comme spam.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "review", 5, 10 * 60_000);
    assertSameOrigin(request);

    const body = await readJson(request);
    const productId = cleanString(body.productId, 60);
    const author = cleanString(body.author, 60);
    const comment = cleanString(body.comment, 1500);
    const rating = toInt(body.rating);

    if (!author) throw errors.validation("Indiquez le nom à afficher avec votre avis.");
    if (rating === null || rating < 1 || rating > 5) {
      throw errors.validation("Donnez une note comprise entre 1 et 5 étoiles.");
    }
    if (comment.length < 10) {
      throw errors.validation("Votre avis doit faire au moins 10 caractères.");
    }

    await transaction((state) => {
      const product = state.products.find((p) => p.id === productId);
      if (!product || !product.active || product.archived) {
        throw errors.validation("Produit introuvable.");
      }
      createReview(state, { productId, author, rating, comment });
    });

    return jsonOk({
      pending: false,
      message: "Merci ! Votre avis est maintenant publié.",
    });
  });
}
