"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiCall } from "./apiClient";

/**
 * Éditeur de document PDF.
 *
 * Le navigateur ne voit jamais le PDF : il annote les **images** rendues par le
 * serveur, en coordonnées relatives (fractions de 0 à 1, origine en haut à
 * gauche). C'est le serveur qui applique ensuite ces opérations au vrai
 * fichier avec pdf-lib (`lib/pdfEdit.ts`), de sorte que le texte ajouté reste
 * du texte et que le document reste vectoriel.
 *
 * Rotation : une page tournée est affichée via une transformation CSS, et les
 * coordonnées du pointeur sont ramenées au repère de l'image d'origine (voir
 * `pointerFraction`). Les annotations sont donc toujours stockées dans le
 * repère non tourné — celui que le serveur connaît —, et l'affichage suit
 * automatiquement puisque le calque SVG tourne avec l'image.
 */

export interface EditorPage {
  /** Numéro dans le document actuel, à partir de 1. */
  number: number;
  url: string;
  width: number;
  height: number;
}

type Tool = "select" | "text" | "highlight" | "draw";
type Rotation = 0 | 90 | 180 | 270;

interface TextItem {
  id: string;
  type: "text";
  page: number;
  x: number;
  y: number;
  size: number;
  color: string;
  text: string;
}
interface HighlightItem {
  id: string;
  type: "highlight";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}
interface InkItem {
  id: string;
  type: "ink";
  page: number;
  strokes: [number, number][][];
  color: string;
  width: number;
}
type Item = TextItem | HighlightItem | InkItem;

const COLORS = [
  { value: "#d92d20", label: "Rouge" },
  { value: "#101828", label: "Noir" },
  { value: "#1570ef", label: "Bleu" },
  { value: "#067647", label: "Vert" },
  { value: "#f79009", label: "Orange" },
];

/** Taille du texte, en fraction de la hauteur de page (≈ 12 à 32 pt sur A4). */
const TEXT_SIZES = [
  { value: 0.014, label: "Petit" },
  { value: 0.02, label: "Moyen" },
  { value: 0.03, label: "Grand" },
];

const INK_WIDTH = 0.0035;
const HIGHLIGHT_OPACITY = 0.35;

let counter = 0;
const nextId = () => `item-${(counter += 1)}`;

/**
 * Position du pointeur dans le repère de l'image d'origine, en fractions.
 * Les rotations de 90/180/270° sont appliquées en CSS : le rectangle englobant
 * renvoyé par le navigateur est celui de l'image **tournée**, d'où l'échange
 * des axes ci-dessous.
 */
function pointerFraction(
  event: { clientX: number; clientY: number },
  rect: DOMRect,
  rotation: Rotation,
): { u: number; v: number } {
  const px = (event.clientX - rect.left) / rect.width;
  const py = (event.clientY - rect.top) / rect.height;
  switch (rotation) {
    case 90:
      return { u: py, v: 1 - px };
    case 180:
      return { u: 1 - px, v: 1 - py };
    case 270:
      return { u: 1 - py, v: px };
    default:
      return { u: px, v: py };
  }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function DocumentEditor({
  documentId,
  documentTitle,
  version,
  pages: initialPages,
}: {
  documentId: string;
  documentTitle: string;
  version: number;
  pages: EditorPage[];
}) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [current, setCurrent] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0].value);
  const [textSize, setTextSize] = useState(TEXT_SIZES[1].value);
  const [items, setItems] = useState<Item[]>([]);
  const [rotations, setRotations] = useState<Record<number, Rotation>>({});
  const [draft, setDraft] = useState<Item | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);

  const page = pages[current];
  const rotation = page ? (rotations[page.number] ?? 0) : 0;
  const pageItems = page ? items.filter((item) => item.page === page.number) : [];
  const dirty =
    items.length > 0 ||
    Object.values(rotations).some((value) => value !== 0) ||
    pages.length !== initialPages.length ||
    pages.some((p, index) => p.number !== initialPages[index]?.number);

  if (!page) {
    return (
      <div className="empty-state">
        <h2>Document vide</h2>
        <p>Ce document n&apos;a plus aucune page.</p>
      </div>
    );
  }

  const fractionAt = (event: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { u: 0, v: 0 };
    const { u, v } = pointerFraction(event, rect, rotation);
    return { u: clamp01(u), v: clamp01(v) };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (tool === "select" || pendingText) return;
    const { u, v } = fractionAt(event);

    if (tool === "text") {
      setPendingText({ x: u, y: v, value: "" });
      return;
    }

    (event.target as Element).setPointerCapture?.(event.pointerId);
    drawing.current = true;
    if (tool === "highlight") {
      setDraft({
        id: nextId(),
        type: "highlight",
        page: page.number,
        x: u,
        y: v,
        width: 0,
        height: 0,
        color,
        opacity: HIGHLIGHT_OPACITY,
      });
    } else {
      setDraft({
        id: nextId(),
        type: "ink",
        page: page.number,
        strokes: [[[u, v]]],
        color,
        width: INK_WIDTH,
      });
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drawing.current || !draft) return;
    const { u, v } = fractionAt(event);
    setDraft((currentDraft) => {
      if (!currentDraft) return currentDraft;
      if (currentDraft.type === "highlight") {
        return { ...currentDraft, width: u - currentDraft.x, height: v - currentDraft.y };
      }
      if (currentDraft.type === "ink") {
        const strokes = currentDraft.strokes.map((stroke, index) =>
          index === currentDraft.strokes.length - 1
            ? ([...stroke, [u, v]] as [number, number][])
            : stroke,
        );
        return { ...currentDraft, strokes };
      }
      return currentDraft;
    });
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setDraft((currentDraft) => {
      if (!currentDraft) return null;
      // Un surlignage de surface nulle ou un trait d'un seul point est un clic
      // manqué, pas une annotation : on ne l'enregistre pas.
      if (currentDraft.type === "highlight") {
        if (Math.abs(currentDraft.width) < 0.004 || Math.abs(currentDraft.height) < 0.004) {
          return null;
        }
        const normalized: HighlightItem = {
          ...currentDraft,
          x: Math.min(currentDraft.x, currentDraft.x + currentDraft.width),
          y: Math.min(currentDraft.y, currentDraft.y + currentDraft.height),
          width: Math.abs(currentDraft.width),
          height: Math.abs(currentDraft.height),
        };
        setItems((list) => [...list, normalized]);
        return null;
      }
      if (currentDraft.type === "ink" && currentDraft.strokes[0]?.length < 2) return null;
      setItems((list) => [...list, currentDraft]);
      return null;
    });
  };

  const commitText = () => {
    if (!pendingText) return;
    const text = pendingText.value.trim();
    if (text) {
      setItems((list) => [
        ...list,
        {
          id: nextId(),
          type: "text",
          page: page.number,
          x: pendingText.x,
          y: pendingText.y,
          size: textSize,
          color,
          text: pendingText.value,
        },
      ]);
    }
    setPendingText(null);
  };

  const rotate = () => {
    setRotations((current) => ({
      ...current,
      [page.number]: (((current[page.number] ?? 0) + 90) % 360) as Rotation,
    }));
  };

  const removePage = () => {
    if (pages.length <= 1) {
      setMessage({ tone: "error", text: "Un document doit garder au moins une page." });
      return;
    }
    if (!window.confirm(`Supprimer la page ${current + 1} du document ?`)) return;
    setItems((list) => list.filter((item) => item.page !== page.number));
    setPages((list) => list.filter((_, index) => index !== current));
    setCurrent((index) => Math.max(0, Math.min(index, pages.length - 2)));
  };

  const movePage = (direction: -1 | 1) => {
    const target = current + direction;
    if (target < 0 || target >= pages.length) return;
    setPages((list) => {
      const next = [...list];
      [next[current], next[target]] = [next[target], next[current]];
      return next;
    });
    setCurrent(target);
  };

  const undo = () => {
    setItems((list) => list.slice(0, -1));
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const orderChanged =
      pages.length !== initialPages.length ||
      pages.some((p, index) => p.number !== initialPages[index]?.number);

    const result = await apiCall(`/api/admin/documents/${documentId}/edition`, "POST", {
      version,
      // L'identifiant est purement local (clé de rendu, annulation) : le
      // serveur n'en a pas l'usage.
      annotations: items.map((item) => {
        const { id, ...rest } = item;
        void id;
        return rest;
      }),
      rotations,
      order: orderChanged ? pages.map((p) => p.number) : null,
    });
    setBusy(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: "Document enregistré." });
    // L'éditeur repart des nouvelles pages : les numéros ont changé, garder les
    // annotations déjà appliquées les ferait dessiner une seconde fois.
    router.refresh();
    router.push(`/admin/documents`);
  };

  const px = (fraction: number, axis: "x" | "y") =>
    fraction * (axis === "x" ? page.width : page.height);

  return (
    <div className="stack">
      {message ? (
        <div className={`alert alert-${message.tone === "success" ? "success" : "error"}`} role="status">
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="doc-toolbar">
        <div className="btn-row" role="group" aria-label="Outils">
          {(
            [
              ["select", "Naviguer"],
              ["text", "Texte"],
              ["highlight", "Surligner"],
              ["draw", "Dessiner"],
            ] as [Tool, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn btn-sm ${tool === value ? "btn-primary" : "btn-secondary"}`}
              onClick={() => {
                setTool(value);
                setPendingText(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="doc-toolbar-group">
          <span className="small muted">Couleur</span>
          {COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`doc-color${color === option.value ? " is-active" : ""}`}
              style={{ background: option.value }}
              aria-label={option.label}
              aria-pressed={color === option.value}
              onClick={() => setColor(option.value)}
            />
          ))}
        </div>

        {tool === "text" ? (
          <div className="doc-toolbar-group">
            <span className="small muted">Taille</span>
            {TEXT_SIZES.map((option) => (
              <button
                key={option.label}
                type="button"
                className={`btn btn-sm ${textSize === option.value ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTextSize(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="btn-row" style={{ marginLeft: "auto" }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={undo} disabled={items.length === 0}>
            Annuler la dernière
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="doc-editor">
        <aside className="doc-pages">
          {pages.map((item, index) => (
            <button
              key={item.number}
              type="button"
              className={`doc-thumb${index === current ? " is-active" : ""}`}
              onClick={() => {
                setCurrent(index);
                setPendingText(null);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- image servie par notre route, dimensions connues */}
              <img src={item.url} alt="" draggable={false} />
              <span>{index + 1}</span>
            </button>
          ))}
        </aside>

        <div className="doc-stage-wrap">
          <div className="doc-page-actions">
            <span className="small muted">
              Page {current + 1} sur {pages.length}
            </span>
            <div className="btn-row">
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => movePage(-1)} disabled={current === 0}>
                ↑ Monter
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => movePage(1)}
                disabled={current === pages.length - 1}
              >
                ↓ Descendre
              </button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={rotate}>
                ⟳ Pivoter
              </button>
              <button type="button" className="btn btn-sm btn-secondary btn-icon-danger" onClick={removePage}>
                Supprimer la page
              </button>
            </div>
          </div>

          <div
            className={`doc-stage-outer${rotation === 90 || rotation === 270 ? " is-sideways" : ""}`}
            style={{ aspectRatio: `${page.width} / ${page.height}` }}
          >
            <div
              ref={stageRef}
              className={`doc-stage tool-${tool}`}
              style={{ transform: `rotate(${rotation}deg)`, aspectRatio: `${page.width} / ${page.height}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- image servie par notre route, dimensions connues */}
              <img src={page.url} alt={`Page ${current + 1} de ${documentTitle}`} draggable={false} />

              <svg
                className="doc-overlay"
                viewBox={`0 0 ${page.width} ${page.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {[...pageItems, ...(draft && draft.page === page.number ? [draft] : [])].map((item) => {
                  if (item.type === "highlight") {
                    const x = Math.min(item.x, item.x + item.width);
                    const y = Math.min(item.y, item.y + item.height);
                    return (
                      <rect
                        key={item.id}
                        x={px(x, "x")}
                        y={px(y, "y")}
                        width={px(Math.abs(item.width), "x")}
                        height={px(Math.abs(item.height), "y")}
                        fill={item.color}
                        opacity={item.opacity}
                      />
                    );
                  }
                  if (item.type === "ink") {
                    return (
                      <g key={item.id}>
                        {item.strokes.map((stroke, index) => (
                          <polyline
                            key={index}
                            points={stroke.map(([u, v]) => `${px(u, "x")},${px(v, "y")}`).join(" ")}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={px(item.width, "y")}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                      </g>
                    );
                  }
                  return (
                    <text
                      key={item.id}
                      x={px(item.x, "x")}
                      y={px(item.y + item.size * 1.03, "y")}
                      fontSize={px(item.size, "y")}
                      fill={item.color}
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {item.text.split("\n").map((line, index) => (
                        <tspan
                          key={index}
                          x={px(item.x, "x")}
                          dy={index === 0 ? 0 : px(item.size * 1.25, "y")}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                })}
              </svg>
            </div>

            {pendingText ? (
              <div
                className="doc-text-input"
                style={{
                  left: `${pendingText.x * 100}%`,
                  top: `${pendingText.y * 100}%`,
                }}
              >
                <input
                  autoFocus
                  value={pendingText.value}
                  placeholder="Votre texte…"
                  onChange={(event) =>
                    setPendingText((current) =>
                      current ? { ...current, value: event.target.value } : current,
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitText();
                    if (event.key === "Escape") setPendingText(null);
                  }}
                />
                <button type="button" className="btn btn-sm btn-primary" onClick={commitText}>
                  Ajouter
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPendingText(null)}>
                  Annuler
                </button>
              </div>
            ) : null}
          </div>

          <p className="small muted">
            {tool === "select"
              ? "Choisissez un outil pour annoter la page."
              : tool === "text"
                ? "Cliquez à l'endroit voulu, tapez votre texte, puis Entrée."
                : tool === "highlight"
                  ? "Faites glisser pour surligner une zone."
                  : "Dessinez à main levée en gardant le bouton enfoncé."}{" "}
            Les modifications ne sont appliquées au fichier qu&apos;à l&apos;enregistrement.
          </p>
        </div>
      </div>
    </div>
  );
}
