"use client";

import { useState } from "react";
import type { PublicDocumentPage } from "@/lib/documents";

/**
 * Visionneuse d'un document publié.
 *
 * Elle n'affiche que des images rendues par le serveur : le PDF n'est jamais
 * envoyé au navigateur (voir `lib/pdfRender.ts`). Les gestes de sauvegarde
 * courants — clic droit, glisser-déposer — sont neutralisés, mais c'est
 * l'absence de fichier qui protège réellement le document, pas ces
 * garde-fous : une capture d'écran reste toujours possible, ici comme sur
 * n'importe quel site.
 */
export function DocumentViewer({
  title,
  pages,
}: {
  title: string;
  pages: PublicDocumentPage[];
}) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-bar">
        <span className="small muted">
          {pages.length} page{pages.length > 1 ? "s" : ""}
        </span>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
            disabled={zoom <= 0.5}
            aria-label="Réduire"
          >
            −
          </button>
          <span className="small mono" style={{ minWidth: 52, textAlign: "center" }}>
            {Math.round(zoom * 100)} %
          </span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))}
            disabled={zoom >= 2.5}
            aria-label="Agrandir"
          >
            +
          </button>
        </div>
      </div>

      <div className="doc-viewer-pages" onContextMenu={(event) => event.preventDefault()}>
        {pages.map((page, index) => (
          <figure key={page.url} className="doc-viewer-page" style={{ maxWidth: `${zoom * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- image servie par notre route, dimensions connues */}
            <img
              src={page.url}
              alt={`${title} — page ${index + 1}`}
              width={page.width}
              height={page.height}
              draggable={false}
              loading={index < 2 ? "eager" : "lazy"}
            />
            <figcaption className="small muted">Page {index + 1}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
