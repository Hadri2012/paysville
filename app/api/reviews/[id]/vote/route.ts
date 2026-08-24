import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, limit, limitGlobal, readJson } from "@/lib/http";
import { voteReviewHelpful } from "@/lib/reviews";
import { transaction } from "@/lib/store";
import { toBoolean } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Vote « cet avis m'a été utile » (`{ helpful: boolean }`).
 *
 * Sans compte client, rien ne permet d'identifier un votant avec certitude : le
 * navigateur retient les avis déjà votés (pour ne pas reproposer le bouton) et le
 * serveur borne la cadence par adresse IP. Un compteur d'utilité n'a pas besoin de
 * plus — il oriente la lecture, il ne décide de rien. Le filet global (voir
 * `limitGlobal`) ne vise pas l'intégrité du compteur, déjà acceptée comme
 * indicative, mais la simple saturation de requêtes en changeant d'adresse IP
 * prétendue à chaque appel.
 */
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    limit(request, "review-vote", 30, 10 * 60_000);
    limitGlobal("review-vote", 300, 10 * 60_000);
    assertSameOrigin(request);

    const { id } = await context.params;
    const body = await readJson(request);
    const helpful = toBoolean(body.helpful);

    const counts = await transaction((state) => {
      const review = state.reviews.find((r) => r.id === id);
      if (!review || review.flagged) throw errors.validation("Avis introuvable.");
      voteReviewHelpful(review, helpful);
      return { helpfulYes: review.helpfulYes, helpfulNo: review.helpfulNo };
    });

    return jsonOk(counts);
  });
}
