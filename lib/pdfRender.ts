import path from "path";
import { errors } from "./errors";
import { MAX_DOCUMENT_PAGES } from "./types";

/**
 * Rendu d'un PDF en images, côté serveur.
 *
 * C'est la pièce qui rend le téléchargement impossible : le navigateur ne
 * reçoit jamais le PDF, seulement une image par page. Masquer un bouton ou
 * bloquer le clic droit n'empêche rien — le fichier serait toujours dans
 * l'onglet Réseau. Ici, il n'y est pas.
 *
 * Strictement serveur : pdf.js tourne dans Node avec un canvas natif
 * (`@napi-rs/canvas`), les deux étant exclus du bundle par `next.config.ts`
 * (`serverExternalPackages`).
 */

/** Largeur cible des images rendues : lisible sur un écran large, sans peser. */
const TARGET_WIDTH_PX = 1400;
const MAX_SCALE = 3;
const JPEG_QUALITY = 84;

export interface RenderedPage {
  jpeg: Buffer;
  width: number;
  height: number;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js dessine ses glyphes via `Path2D`, et attend `DOMMatrix`/`ImageData`
 * comme dans un navigateur : on expose ceux du canvas natif avant la première
 * importation, une seule fois par processus.
 */
async function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const canvas = await import("@napi-rs/canvas");
      const g = globalThis as Record<string, unknown>;
      g.Path2D ??= canvas.Path2D;
      g.DOMMatrix ??= canvas.DOMMatrix;
      g.ImageData ??= canvas.ImageData;
      return import("pdfjs-dist/legacy/build/pdf.mjs");
    })().catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

/** Polices standard (Helvetica, Times…) non embarquées dans le PDF. */
function standardFontDataUrl(): string {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;
}

/** Un fichier PDF commence par « %PDF- » (quelques octets de garbage tolérés). */
export function isPdfFile(bytes: Buffer): boolean {
  return bytes.length > 8 && bytes.subarray(0, 1024).toString("latin1").includes("%PDF-");
}

/**
 * Rend chaque page en JPEG. Lève une erreur applicative si le fichier n'est
 * pas un PDF lisible (chiffré, corrompu) ou dépasse la limite de pages.
 */
export async function rasterizePdf(bytes: Buffer): Promise<RenderedPage[]> {
  if (!isPdfFile(bytes)) throw errors.validation("Ce fichier n'est pas un PDF.");

  const pdfjs = await loadPdfJs();
  const { createCanvas } = await import("@napi-rs/canvas");

  let pdf: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
  try {
    // Aucune fabrique de canvas à fournir : dans Node, pdf.js utilise déjà
    // `@napi-rs/canvas` pour ses canvas auxiliaires (motifs, masques,
    // transparence).
    pdf = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
      standardFontDataUrl: standardFontDataUrl(),
    }).promise;
  } catch {
    throw errors.validation(
      "Ce PDF n'a pas pu être lu (fichier corrompu ou protégé par mot de passe).",
    );
  }

  if (pdf.numPages > MAX_DOCUMENT_PAGES) {
    throw errors.validation(`Un document ne peut pas dépasser ${MAX_DOCUMENT_PAGES} pages.`);
  }

  const pages: RenderedPage[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_SCALE, Math.max(1, TARGET_WIDTH_PX / base.width));
      const viewport = page.getViewport({ scale });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      // Fond blanc explicite : une page sans fond dessiné serait transparente,
      // et le JPEG n'a pas de transparence.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      pages.push({ jpeg: canvas.toBuffer("image/jpeg", JPEG_QUALITY), width, height });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages;
}
