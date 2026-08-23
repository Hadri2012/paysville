import { requireAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { clearReviewReports, setReviewReply } from "@/lib/reviews";
import { transaction } from "@/lib/store";
import { MAX_REPLY_LENGTH } from "@/lib/types";
import { cleanString, toBoolean } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Modification d'un avis par la boutique. Quatre champs, indépendants les uns des
 * autres :
 *
 *  - `flagged` : marque ou démarque l'avis comme spam ;
 *  - `reply` : réponse publique affichée sous l'avis (chaîne vide = la retirer) ;
 *  - `clearReports` : les signalements ont été examinés, rien à retenir ;
 *  - `removePhotos` : retire les photos jointes en gardant le texte de l'avis.
 *
 * Seul ce qui est présent dans le corps est modifié, pour qu'enregistrer une réponse
 * ne remette pas au passage un avis marqué comme spam en ligne.
 */
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const review = await transaction((state) => {
      const found = state.reviews.find((r) => r.id === id);
      if (!found) throw errors.validation("Avis introuvable.");
      if ("flagged" in body) found.flagged = toBoolean(body.flagged);
      if ("reply" in body) {
        setReviewReply(found, cleanString(body.reply, MAX_REPLY_LENGTH));
      }
      if (toBoolean(body.clearReports)) clearReviewReports(found);
      // Retirer une photo déplacée sans supprimer un avis par ailleurs honnête.
      if (toBoolean(body.removePhotos)) found.photos = [];
      return found;
    });

    return jsonOk({ review });
  });
}

/** Suppression définitive d'un avis (spam, doublon, demande du client). */
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    await transaction((state) => {
      const exists = state.reviews.some((r) => r.id === id);
      if (!exists) throw errors.validation("Avis introuvable.");
      state.reviews = state.reviews.filter((r) => r.id !== id);
    });

    return jsonOk({ deleted: true });
  });
}
