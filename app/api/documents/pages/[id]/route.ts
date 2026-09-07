import { readAsset } from "@/lib/assets";
import { getCurrentAdmin } from "@/lib/auth";
import { errors } from "@/lib/errors";
import { jsonError, limit } from "@/lib/http";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Image d'une page de document publié — la seule chose qui sort du serveur
 * (jamais le PDF, voir `lib/pdfRender.ts`).
 *
 * Servie uniquement pour un identifiant réellement référencé par un document
 * **visible** ; l'administration, elle, voit aussi les documents masqués (pour
 * les relire et les éditer avant publication). Le magasin d'assets contient
 * aussi les PDF sources et les fichiers vendus : ils ne passent jamais par ici.
 */
export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    limit(request, "document-page", 600, 60_000);
    const { id } = await context.params;

    const state = await readState();
    const document = state.documents.find((d) => d.pages.some((p) => p.assetId === id));
    if (!document) throw errors.documentNotFound();
    if (!document.visible && !(await getCurrentAdmin())) throw errors.documentNotFound();

    const bytes = await readAsset(id);
    if (!bytes) throw errors.documentNotFound();

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
        // Un document masqué doit disparaître à la seconde : pas de cache
        // partagé. Le navigateur du lecteur peut garder l'image le temps de sa
        // lecture — l'identifiant change à chaque édition, jamais de version
        // périmée.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
