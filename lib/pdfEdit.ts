import {
  LineCapStyle,
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import { errors } from "./errors";
import { MAX_DOCUMENT_PAGES } from "./types";

/**
 * Édition d'un document PDF publié, côté serveur.
 *
 * L'éditeur du navigateur (`components/admin/DocumentEditor.tsx`) ne voit que
 * les images des pages : il décrit ce qu'il ajoute en coordonnées **relatives à
 * l'image affichée** (fractions de 0 à 1, origine en haut à gauche), puis
 * envoie ces opérations ici. C'est ce module qui les applique au vrai PDF avec
 * pdf-lib — le fichier reste vectoriel, le texte ajouté reste du texte.
 *
 * Deux familles d'opérations, appliquées dans cet ordre :
 *  1. annotations (texte, surlignage, tracé libre) sur les pages **actuelles**,
 *     numérotées à partir de 1 dans l'ordre du document au moment de l'édition ;
 *  2. rotations, puis la nouvelle liste ordonnée des pages à conserver, qui
 *     réalise à la fois suppression et réordonnancement.
 */

export type RotationDegrees = 0 | 90 | 180 | 270;

export interface TextAnnotation {
  type: "text";
  page: number;
  /** Coin supérieur gauche du texte, en fractions de l'image affichée. */
  x: number;
  y: number;
  /** Taille du texte, en fraction de la hauteur de l'image affichée. */
  size: number;
  color: string;
  text: string;
}

export interface HighlightAnnotation {
  type: "highlight";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

export interface InkAnnotation {
  type: "ink";
  page: number;
  /** Tracés successifs, chacun une liste de points [x, y] en fractions. */
  strokes: [number, number][][];
  color: string;
  /** Épaisseur du trait, en fraction de la hauteur de l'image affichée. */
  width: number;
}

export type Annotation = TextAnnotation | HighlightAnnotation | InkAnnotation;

export interface DocumentEdit {
  annotations: Annotation[];
  /** Rotation à **ajouter** à chaque page (clé : numéro de page à partir de 1). */
  rotations: Record<number, RotationDegrees>;
  /**
   * Pages conservées, dans leur nouvel ordre (numéros à partir de 1). Les
   * pages absentes sont supprimées. `null` = ordre et pages inchangés.
   */
  order: number[] | null;
}

/* --------------------------- Validation d'entrée --------------------------- */

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const MAX_ANNOTATIONS = 500;
const MAX_TEXT_LENGTH = 2000;
const MAX_STROKE_POINTS = 20_000;

function fraction(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw errors.validation(`Coordonnée invalide (${label}).`);
  }
  return Math.min(1.5, Math.max(-0.5, value));
}

function pageNumber(value: unknown, pageCount: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > pageCount) {
    throw errors.validation("Numéro de page invalide.");
  }
  return value;
}

function color(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!COLOR_RE.test(text)) throw errors.validation("Couleur invalide.");
  return text.toLowerCase();
}

/** Valide et normalise une édition envoyée par le navigateur. */
export function parseDocumentEdit(body: Record<string, unknown>, pageCount: number): DocumentEdit {
  const rawAnnotations = Array.isArray(body.annotations) ? body.annotations : [];
  if (rawAnnotations.length > MAX_ANNOTATIONS) {
    throw errors.validation(`Trop d'annotations en une seule fois (${MAX_ANNOTATIONS} maximum).`);
  }

  const annotations: Annotation[] = rawAnnotations.map((raw): Annotation => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const page = pageNumber(item.page, pageCount);
    switch (item.type) {
      case "text": {
        const text = typeof item.text === "string" ? item.text.slice(0, MAX_TEXT_LENGTH) : "";
        if (!text.trim()) throw errors.validation("Texte vide.");
        return {
          type: "text",
          page,
          x: fraction(item.x, "x"),
          y: fraction(item.y, "y"),
          size: Math.min(0.5, Math.max(0.004, fraction(item.size, "taille"))),
          color: color(item.color),
          text,
        };
      }
      case "highlight":
        return {
          type: "highlight",
          page,
          x: fraction(item.x, "x"),
          y: fraction(item.y, "y"),
          width: fraction(item.width, "largeur"),
          height: fraction(item.height, "hauteur"),
          color: color(item.color),
          opacity:
            typeof item.opacity === "number" && Number.isFinite(item.opacity)
              ? Math.min(1, Math.max(0.05, item.opacity))
              : 0.4,
        };
      case "ink": {
        const rawStrokes = Array.isArray(item.strokes) ? item.strokes : [];
        let points = 0;
        const strokes = rawStrokes.map((stroke): [number, number][] => {
          if (!Array.isArray(stroke)) throw errors.validation("Tracé invalide.");
          return stroke.map((point): [number, number] => {
            if (!Array.isArray(point) || point.length < 2) {
              throw errors.validation("Point de tracé invalide.");
            }
            points += 1;
            if (points > MAX_STROKE_POINTS) throw errors.validation("Tracé trop long.");
            return [fraction(point[0], "x"), fraction(point[1], "y")];
          });
        });
        return {
          type: "ink",
          page,
          strokes: strokes.filter((stroke) => stroke.length > 0),
          color: color(item.color),
          width: Math.min(0.1, Math.max(0.0005, fraction(item.width, "épaisseur"))),
        };
      }
      default:
        throw errors.validation("Type d'annotation inconnu.");
    }
  });

  const rotations: Record<number, RotationDegrees> = {};
  const rawRotations =
    body.rotations && typeof body.rotations === "object" && !Array.isArray(body.rotations)
      ? (body.rotations as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(rawRotations)) {
    const page = pageNumber(Number(key), pageCount);
    if (value !== 0 && value !== 90 && value !== 180 && value !== 270) {
      throw errors.validation("Rotation invalide (0, 90, 180 ou 270 attendu).");
    }
    if (value !== 0) rotations[page] = value;
  }

  let order: number[] | null = null;
  if (body.order !== undefined && body.order !== null) {
    if (!Array.isArray(body.order)) throw errors.validation("Ordre des pages invalide.");
    order = body.order.map((value) => pageNumber(value, pageCount));
    if (order.length === 0) throw errors.validation("Un document doit garder au moins une page.");
    if (new Set(order).size !== order.length) {
      throw errors.validation("Une page ne peut apparaître qu'une fois.");
    }
    if (order.length > MAX_DOCUMENT_PAGES) {
      throw errors.validation(`Un document ne peut pas dépasser ${MAX_DOCUMENT_PAGES} pages.`);
    }
  }

  return { annotations, rotations, order };
}

/* ------------------------------- Géométrie -------------------------------- */

function hexToRgb(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

/** Rotation effective d'une page, ramenée à 0/90/180/270. */
function pageRotation(page: PDFPage): RotationDegrees {
  const angle = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;
  return angle as RotationDegrees;
}

interface PageFrame {
  page: PDFPage;
  rotation: RotationDegrees;
  /** MediaBox de la page (espace PDF, non tourné). */
  box: { x: number; y: number; width: number; height: number };
  /** Dimensions de la page telle qu'affichée (rotation appliquée), en points. */
  shownWidth: number;
  shownHeight: number;
}

function frameOf(page: PDFPage): PageFrame {
  const rotation = pageRotation(page);
  const box = page.getMediaBox();
  const sideways = rotation === 90 || rotation === 270;
  return {
    page,
    rotation,
    box,
    shownWidth: sideways ? box.height : box.width,
    shownHeight: sideways ? box.width : box.height,
  };
}

/**
 * Convertit un point de l'image affichée (fractions, origine en haut à gauche,
 * rotation de page déjà appliquée par le rendu) en coordonnées PDF (points,
 * origine en bas à gauche, espace non tourné de la page).
 */
function toPdfPoint(frame: PageFrame, u: number, v: number): { x: number; y: number } {
  const { box, rotation } = frame;
  let x: number;
  let y: number;
  switch (rotation) {
    case 90:
      x = v * box.width;
      y = u * box.height;
      break;
    case 180:
      x = (1 - u) * box.width;
      y = v * box.height;
      break;
    case 270:
      x = (1 - v) * box.width;
      y = (1 - u) * box.height;
      break;
    default:
      x = u * box.width;
      y = (1 - v) * box.height;
  }
  return { x: box.x + x, y: box.y + y };
}

/* ------------------------------ Annotations ------------------------------- */

/**
 * Helvetica ne connaît que WinAnsi : un caractère hors de ce jeu (emoji,
 * alphabet non latin) ferait échouer tout l'enregistrement. On le remplace par
 * « ? » plutôt que de refuser le texte entier.
 */
function encodable(font: PDFFont, text: string): string {
  return [...text]
    .map((char) => {
      if (char === "\n") return char;
      try {
        font.encodeText(char);
        return char;
      } catch {
        return "?";
      }
    })
    .join("");
}

function drawText(frame: PageFrame, font: PDFFont, annotation: TextAnnotation): void {
  const size = annotation.size * frame.shownHeight;
  const lineHeight = size * 1.25;
  const lines = encodable(font, annotation.text).split("\n");
  const rotate = degrees(frame.rotation);

  lines.forEach((line, index) => {
    // Position de la ligne de base : le coin fourni est le haut du bloc de
    // texte, chaque ligne descend d'une hauteur de ligne dans l'espace affiché.
    const vBaseline = annotation.y + ((index + 1) * lineHeight - size * 0.22) / frame.shownHeight;
    const { x, y } = toPdfPoint(frame, annotation.x, vBaseline);
    frame.page.drawText(line, {
      x,
      y,
      size,
      font,
      color: hexToRgb(annotation.color),
      rotate,
    });
  });
}

function drawHighlight(frame: PageFrame, annotation: HighlightAnnotation): void {
  const a = toPdfPoint(frame, annotation.x, annotation.y);
  const b = toPdfPoint(frame, annotation.x + annotation.width, annotation.y + annotation.height);
  frame.page.drawRectangle({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
    color: hexToRgb(annotation.color),
    opacity: annotation.opacity,
  });
}

function drawInk(frame: PageFrame, annotation: InkAnnotation): void {
  const borderWidth = Math.max(0.3, annotation.width * frame.shownHeight);
  for (const stroke of annotation.strokes) {
    const points = stroke.map(([u, v]) => toPdfPoint(frame, u, v));
    if (points.length === 0) continue;
    // Un point isolé (simple clic) devient un court segment, sinon rien ne
    // serait dessiné.
    if (points.length === 1) points.push({ x: points[0].x + 0.01, y: points[0].y });
    // `drawSvgPath` place l'origine du tracé en (x, y) avec l'axe des y vers le
    // bas : on écrit le chemin en relatif à ce point, y inversé.
    const origin = points[0];
    const path = points
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${(point.x - origin.x).toFixed(2)} ${(origin.y - point.y).toFixed(2)}`,
      )
      .join(" ");
    frame.page.drawSvgPath(path, {
      x: origin.x,
      y: origin.y,
      borderColor: hexToRgb(annotation.color),
      borderWidth,
      borderLineCap: LineCapStyle.Round,
      borderOpacity: 1,
    });
  }
}

/* --------------------------------- Édition -------------------------------- */

/**
 * Applique une édition et renvoie le nouveau PDF. Le document d'origine n'est
 * pas modifié : l'appelant remplace l'asset une fois le rendu réussi.
 */
export async function applyDocumentEdit(source: Buffer, edit: DocumentEdit): Promise<Buffer> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(new Uint8Array(source), { ignoreEncryption: false });
  } catch {
    throw errors.validation("Ce PDF n'a pas pu être ouvert pour modification.");
  }

  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const annotation of edit.annotations) {
    const page = pages[annotation.page - 1];
    if (!page) throw errors.validation("Numéro de page invalide.");
    const frame = frameOf(page);
    switch (annotation.type) {
      case "text":
        drawText(frame, font, annotation);
        break;
      case "highlight":
        drawHighlight(frame, annotation);
        break;
      case "ink":
        drawInk(frame, annotation);
        break;
    }
  }

  for (const [key, added] of Object.entries(edit.rotations)) {
    const page = pages[Number(key) - 1];
    if (!page) throw errors.validation("Numéro de page invalide.");
    page.setRotation(degrees((pageRotation(page) + added) % 360));
  }

  if (!edit.order) {
    return Buffer.from(await doc.save());
  }

  // Suppression et réordonnancement en une passe : un document neuf reçoit les
  // pages conservées, dans l'ordre demandé.
  const target = await PDFDocument.create();
  const copied = await target.copyPages(
    doc,
    edit.order.map((n) => n - 1),
  );
  for (const page of copied) target.addPage(page);
  return Buffer.from(await target.save());
}
