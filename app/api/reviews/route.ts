import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, limit, limitGlobal, readJson } from "@/lib/http";
import { createReview, sanitizeReviewPhotos } from "@/lib/reviews";
import { transaction } from "@/lib/store";
import { cleanString, toInt } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Dépôt d'un avis client. Le formulaire est public : la limitation de débit et le
 * filtrage automatique du spam sont les deux seules barrières — les avis sont
 * publiés immédiatement, sauf s'ils sont détectés comme spam.
 *
 * L'e-mail, facultatif, sert uniquement à confronter l'avis aux commandes payées
 * pour accorder le badge « achat vérifié ». Il n'est pas enregistré.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "review", 5, 10 * 60_000);
    // Filet global : sans lui, changer d'adresse IP prétendue à chaque dépôt
    // permet de gonfler l'état sans fin (voir `limitGlobal`).
    limitGlobal("review", 50, 10 * 60_000);
    assertSameOrigin(request);

    const body = await readJson(request);
    const productId = cleanString(body.productId, 60);
    const author = cleanString(body.author, 60);
    const comment = cleanString(body.comment, 1500);
    const rating = toInt(body.rating);
    // Facultatif : sert uniquement à décider du badge « achat vérifié », et n'est
    // pas enregistré avec l'avis.
    const email = cleanString(body.email, 160).toLowerCase();
    // Le navigateur redimensionne avant l'envoi ; `sanitizeReviewPhotos` écarte
    // quand même tout ce qui n'est pas une image matricielle de taille raisonnable.
    const photos = sanitizeReviewPhotos(body.photos);

    if (!author) throw errors.validation("Indiquez le nom à afficher avec votre avis.");
    if (rating === null || rating < 1 || rating > 5) {
      throw errors.validation("Donnez une note comprise entre 1 et 5 étoiles.");
    }
    if (comment.length < 10) {
      throw errors.validation("Votre avis doit faire au moins 10 caractères.");
    }

    const review = await transaction((state) => {
      const product = state.products.find((p) => p.id === productId);
      if (!product || !product.active || product.archived) {
        throw errors.validation("Produit introuvable.");
      }
      const created = createReview(state, {
        productId,
        author,
        rating,
        comment,
        email,
        photos,
      });
      return { flagged: created.flagged, verified: created.verified };
    });

    // Un avis retenu par le filtre n'est pas visible : le dire, plutôt que d'annoncer
    // une publication que l'auteur ne retrouvera pas sur la fiche produit.
    const message = review.flagged
      ? "Merci ! Votre avis sera visible après une vérification rapide."
      : review.verified
        ? "Merci ! Votre avis est publié avec la mention « achat vérifié »."
        : "Merci ! Votre avis est maintenant publié.";

    return jsonOk({ pending: review.flagged, verified: review.verified, message });
  });
}
