import type { Metadata } from "next";
import Link from "next/link";
import { listPublicDocuments } from "@/lib/documents";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Documents",
  description: "Les documents publiés par Hadrishop, consultables en ligne.",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    dateStyle: "long",
    timeZone: "Europe/Brussels",
  });
}

export default async function DocumentsPage() {
  const documents = listPublicDocuments(await readState());

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="page-head">
          <div>
            <h1>Documents</h1>
            <p>
              Ces documents se consultent directement en ligne, page par page. Ils ne sont
              pas téléchargeables.
            </p>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="empty-state">
            <h2>Aucun document publié</h2>
            <p>Revenez plus tard : les documents publiés apparaîtront ici.</p>
          </div>
        ) : (
          <div className="doc-list">
            {documents.map((document) => (
              <Link key={document.slug} href={`/documents/${document.slug}`} className="card doc-list-item">
                <div>
                  <h2 className="card-title" style={{ marginBottom: 4 }}>
                    {document.title}
                  </h2>
                  {document.description ? <p className="small">{document.description}</p> : null}
                  <p className="small muted" style={{ margin: 0 }}>
                    {document.pageCount} page{document.pageCount > 1 ? "s" : ""} · mis à jour le{" "}
                    {formatDate(document.updatedAt)}
                  </p>
                </div>
                <span className="btn btn-secondary btn-sm">Lire</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
