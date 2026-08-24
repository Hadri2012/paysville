import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, limit, limitGlobal, readJson } from "@/lib/http";
import { reportReview } from "@/lib/reviews";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Signalement d'un avis par un visiteur.
 *
 * Le signalement ne masque rien : il place l'avis en tête de la file dans
 * l'administration, où la boutique tranche. Laisser un compteur décider seul du
 * retrait offrirait à quiconque insiste un moyen d'effacer un avis gênant mais
 * légitime. La limite de débit est basse — signaler est un geste rare. Le filet
 * global (voir `limitGlobal`) empêche de noyer la file de modération en changeant
 * d'adresse IP prétendue à chaque signalement.
 */
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    limit(request, "review-report", 5, 10 * 60_000);
    limitGlobal("review-report", 50, 10 * 60_000);
    assertSameOrigin(request);

    const { id } = await context.params;
    // Le corps n'est pas exploité, mais on le lit pour rejeter d'emblée une requête
    // mal formée, comme sur les autres routes publiques.
    await readJson(request);

    await transaction((state) => {
      const review = state.reviews.find((r) => r.id === id);
      if (!review) throw errors.validation("Avis introuvable.");
      reportReview(review);
    });

    return jsonOk({ reported: true });
  });
}
