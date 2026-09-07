import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentEditor, type EditorPage } from "@/components/admin/DocumentEditor";
import { requireAdminPage } from "@/lib/adminGuard";
import { pageImageUrl } from "@/lib/documents";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Éditeur de document" };

export default async function DocumentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const state = await readState();
  const document = state.documents.find((item) => item.id === id);
  if (!document) notFound();

  const pages: EditorPage[] = document.pages.map((page, index) => ({
    number: index + 1,
    url: pageImageUrl(document, page),
    width: page.width,
    height: page.height,
  }));

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <nav className="breadcrumb">
            <Link href="/admin/documents">← Tous les documents</Link>
          </nav>
          <h1>{document.title}</h1>
          <p>
            Annotez, pivotez, supprimez ou réordonnez les pages. Les modifications sont
            appliquées au PDF d&apos;origine à l&apos;enregistrement, puis les pages sont
            recalculées.
          </p>
        </div>
      </div>

      <DocumentEditor
        documentId={document.id}
        documentTitle={document.title}
        version={document.version}
        pages={pages}
      />
    </div>
  );
}
