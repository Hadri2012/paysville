import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentViewer } from "@/components/DocumentViewer";
import { findDocumentBySlug, publicDocumentPages } from "@/lib/documents";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const document = findDocumentBySlug(await readState(), slug);
  if (!document || !document.visible) return { title: "Document introuvable" };
  return {
    title: document.title,
    description: document.description || `Document publié par Hadrishop : ${document.title}.`,
  };
}

export default async function DocumentPage({ params }: Params) {
  const { slug } = await params;
  const document = findDocumentBySlug(await readState(), slug);
  // Un document masqué est introuvable, pas « interdit » : rien ne doit
  // révéler qu'il existe.
  if (!document || !document.visible || document.pages.length === 0) notFound();

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="page-head">
          <div>
            <nav className="breadcrumb">
              <Link href="/documents">← Tous les documents</Link>
            </nav>
            <h1>{document.title}</h1>
            {document.description ? <p>{document.description}</p> : null}
          </div>
        </div>

        <DocumentViewer title={document.title} pages={publicDocumentPages(document)} />

        <p className="small muted center">
          Ce document est consultable en ligne uniquement : il n&apos;est pas proposé au
          téléchargement.
        </p>
      </div>
    </main>
  );
}
