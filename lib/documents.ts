import { deleteAsset, readAsset, saveAsset } from "./assets";
import { errors } from "./errors";
import { newId, uniqueSlug } from "./ids";
import { applyDocumentEdit, type DocumentEdit } from "./pdfEdit";
import { rasterizePdf } from "./pdfRender";
import { readState, transaction } from "./store";
import type { DocumentPage, PublishedDocument, State } from "./types";
import { newAssetId } from "./uploads";
import { cleanString, toBoolean } from "./validation";

/**
 * Documents PDF publiés : création, édition, suppression, et ce qu'en voit le
 * public.
 *
 * Toutes les écritures suivent la même discipline que les fichiers produit :
 * les assets (PDF et images de pages) sont écrits **avant** la transaction et
 * effacés si elle échoue ; les anciens assets ne sont supprimés qu'**après**
 * qu'elle a réussi. Un état qui référencerait une image absente donnerait une
 * page blanche à tous les visiteurs.
 */

/** Rend le PDF en pages et range chaque image dans le magasin d'assets. */
async function storePages(pdf: Buffer): Promise<DocumentPage[]> {
  const rendered = await rasterizePdf(pdf);
  const pages: DocumentPage[] = [];
  try {
    for (const page of rendered) {
      const assetId = newAssetId();
      await saveAsset(assetId, page.jpeg);
      pages.push({ assetId, width: page.width, height: page.height });
    }
  } catch (error) {
    await Promise.all(pages.map((page) => deleteAsset(page.assetId)));
    throw error;
  }
  return pages;
}

async function discardPages(pages: DocumentPage[]): Promise<void> {
  await Promise.all(pages.map((page) => deleteAsset(page.assetId)));
}

export interface CreateDocumentInput {
  title: string;
  description: string;
  visible: boolean;
  pdf: Buffer;
}

export async function createDocument(input: CreateDocumentInput): Promise<PublishedDocument> {
  const title = cleanString(input.title, 160);
  if (title.length < 2) throw errors.validation("Titre requis.", { title: "Titre requis." });

  const pdfAssetId = newAssetId();
  await saveAsset(pdfAssetId, input.pdf);
  let pages: DocumentPage[] = [];
  try {
    pages = await storePages(input.pdf);
    return await transaction((state) => {
      const now = new Date().toISOString();
      const document: PublishedDocument = {
        id: newId(),
        slug: uniqueSlug(
          title,
          state.documents.map((d) => d.slug),
        ),
        title,
        description: cleanString(input.description, 1000),
        visible: input.visible,
        pdfAssetId,
        sizeBytes: input.pdf.length,
        pages,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      state.documents.push(document);
      return document;
    });
  } catch (error) {
    await deleteAsset(pdfAssetId);
    await discardPages(pages);
    throw error;
  }
}

/** Titre, description, visibilité — sans toucher au fichier. */
export function updateDocument(
  state: State,
  id: string,
  body: Record<string, unknown>,
): PublishedDocument {
  const document = state.documents.find((d) => d.id === id);
  if (!document) throw errors.documentNotFound();

  if (body.title !== undefined) {
    const title = cleanString(body.title, 160);
    if (title.length < 2) throw errors.validation("Titre requis.", { title: "Titre requis." });
    if (title !== document.title) {
      document.title = title;
      document.slug = uniqueSlug(
        title,
        state.documents.filter((d) => d.id !== id).map((d) => d.slug),
      );
    }
  }
  if (body.description !== undefined) {
    document.description = cleanString(body.description, 1000);
  }
  if (body.visible !== undefined) {
    document.visible = toBoolean(body.visible);
  }
  document.updatedAt = new Date().toISOString();
  return document;
}

export async function deleteDocument(id: string): Promise<void> {
  const removed = await transaction((state) => {
    const document = state.documents.find((d) => d.id === id);
    if (!document) throw errors.documentNotFound();
    state.documents = state.documents.filter((d) => d.id !== id);
    return document;
  });
  await deleteAsset(removed.pdfAssetId);
  await discardPages(removed.pages);
}

/**
 * Applique une édition (voir `lib/pdfEdit.ts`) : nouveau PDF, nouvelles images,
 * puis bascule atomique dans l'état. L'ancienne version n'est effacée qu'une
 * fois la nouvelle en place.
 */
export async function editDocument(id: string, edit: DocumentEdit): Promise<PublishedDocument> {
  const current = (await readState()).documents.find((d) => d.id === id);
  if (!current) throw errors.documentNotFound();
  const source = await readAsset(current.pdfAssetId);
  if (!source) throw errors.documentNotFound();

  const nextPdf = await applyDocumentEdit(source, edit);
  const pdfAssetId = newAssetId();
  await saveAsset(pdfAssetId, nextPdf);
  let pages: DocumentPage[] = [];
  let previous: { pdfAssetId: string; pages: DocumentPage[] } | null = null;
  try {
    pages = await storePages(nextPdf);
    const updated = await transaction((state) => {
      const document = state.documents.find((d) => d.id === id);
      if (!document) throw errors.documentNotFound();
      // Édition concurrente : les numéros de pages envoyés ne décrivent plus le
      // document. Refuser vaut mieux qu'appliquer au mauvais endroit.
      if (document.version !== current.version) {
        throw errors.validation(
          "Ce document a été modifié entre-temps. Rechargez l'éditeur avant de réessayer.",
        );
      }
      previous = { pdfAssetId: document.pdfAssetId, pages: document.pages };
      document.pdfAssetId = pdfAssetId;
      document.sizeBytes = nextPdf.length;
      document.pages = pages;
      document.version += 1;
      document.updatedAt = new Date().toISOString();
      return document;
    });
    if (previous) {
      const old = previous as { pdfAssetId: string; pages: DocumentPage[] };
      await deleteAsset(old.pdfAssetId);
      await discardPages(old.pages);
    }
    return updated;
  } catch (error) {
    await deleteAsset(pdfAssetId);
    await discardPages(pages);
    throw error;
  }
}

/* ------------------------------ Vue publique ------------------------------ */

export interface PublicDocumentPage {
  url: string;
  width: number;
  height: number;
}

export interface PublicDocument {
  slug: string;
  title: string;
  description: string;
  pageCount: number;
  updatedAt: string;
}

export function listPublicDocuments(state: State): PublicDocument[] {
  return state.documents
    .filter((d) => d.visible && d.pages.length > 0)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      pageCount: d.pages.length,
      updatedAt: d.updatedAt,
    }));
}

/** URL de l'image d'une page. `version` invalide le cache à chaque édition. */
export function pageImageUrl(document: PublishedDocument, page: DocumentPage): string {
  return `/api/documents/pages/${page.assetId}?v=${document.version}`;
}

export function publicDocumentPages(document: PublishedDocument): PublicDocumentPage[] {
  return document.pages.map((page) => ({
    url: pageImageUrl(document, page),
    width: page.width,
    height: page.height,
  }));
}

export function findDocumentBySlug(state: State, slug: string): PublishedDocument | undefined {
  const needle = slug.trim().toLowerCase();
  return state.documents.find((d) => d.slug === needle || d.id === slug);
}
