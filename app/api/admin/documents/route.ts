import { requireAdmin } from "@/lib/auth";
import { createDocument } from "@/lib/documents";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import { isPdfFile } from "@/lib/pdfRender";
import { MAX_DOCUMENT_BYTES } from "@/lib/types";
import { decodeUpload } from "@/lib/uploads";
import { cleanString, toBoolean } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Publication d'un PDF : le fichier est rendu page par page en images au
 * moment de l'envoi (voir `lib/pdfRender.ts`), ce qui peut prendre quelques
 * secondes pour un long document.
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJson(request);

    const upload = decodeUpload(body, MAX_DOCUMENT_BYTES);
    if (!isPdfFile(upload.bytes)) throw errors.validation("Seul un fichier PDF est accepté.");

    const document = await createDocument({
      title: cleanString(body.title, 160) || upload.name.replace(/\.pdf$/i, ""),
      description: cleanString(body.description, 1000),
      visible: body.visible === undefined ? false : toBoolean(body.visible),
      pdf: upload.bytes,
    });

    return jsonOk({ document });
  });
}
