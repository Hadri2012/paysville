import { requireAdmin } from "@/lib/auth";
import { editDocument } from "@/lib/documents";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { parseDocumentEdit } from "@/lib/pdfEdit";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Enregistrement d'une édition faite dans l'éditeur (annotations, rotations,
 * pages supprimées ou réordonnées). Voir `lib/pdfEdit.ts` pour le format.
 */
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const current = (await readState()).documents.find((d) => d.id === id);
    if (!current) throw errors.documentNotFound();
    // La version protège contre une édition partie d'un état périmé : les
    // numéros de pages n'auraient plus le même sens.
    if (body.version !== undefined && body.version !== current.version) {
      throw errors.validation(
        "Ce document a été modifié entre-temps. Rechargez l'éditeur avant de réessayer.",
      );
    }

    const edit = parseDocumentEdit(body, current.pages.length);
    const document = await editDocument(id, edit);
    return jsonOk({ document });
  });
}
