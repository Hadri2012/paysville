import { requireAdmin } from "@/lib/auth";
import { deleteDocument, updateDocument } from "@/lib/documents";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Titre, description, visibilité. */
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);
    const document = await transaction((state) => updateDocument(state, id, body));
    return jsonOk({ document });
  });
}

/** Suppression définitive : l'état, puis le PDF et les images de pages. */
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    await deleteDocument(id);
    return jsonOk({ deleted: true });
  });
}
