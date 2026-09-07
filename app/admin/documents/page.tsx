import { DocumentsManager, type AdminDocumentRow } from "@/components/admin/DocumentsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { pageImageUrl } from "@/lib/documents";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Documents" };

export default async function AdminDocumentsPage() {
  await requireAdminPage();
  const state = await readState();

  const documents: AdminDocumentRow[] = [...state.documents]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((document) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      description: document.description,
      visible: document.visible,
      pageCount: document.pages.length,
      sizeBytes: document.sizeBytes,
      updatedAt: document.updatedAt,
      firstPageUrl: document.pages[0] ? pageImageUrl(document, document.pages[0]) : null,
    }));

  return <DocumentsManager documents={documents} />;
}
