"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatBytes } from "@/lib/digital";
import { MAX_DOCUMENT_BYTES } from "@/lib/types";
import { apiCall } from "./apiClient";

export interface AdminDocumentRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  visible: boolean;
  pageCount: number;
  sizeBytes: number;
  updatedAt: string;
  firstPageUrl: string | null;
}

/** Lit un fichier local en data-URI (même format d'envoi que les fichiers produit). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible."));
    reader.readAsDataURL(file);
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
}

export function DocumentsManager({ documents }: { documents: AdminDocumentRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState<AdminDocumentRow | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setMessage({ tone: "error", text: "Choisissez un fichier PDF." });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setMessage({
        tone: "error",
        text: `Ce PDF dépasse ${formatBytes(MAX_DOCUMENT_BYTES)}.`,
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    const data = await readAsDataUrl(file).catch(() => null);
    if (data === null) {
      setBusy(false);
      setMessage({ tone: "error", text: "Ce fichier n'a pas pu être lu." });
      return;
    }

    const result = await apiCall("/api/admin/documents", "POST", {
      name: file.name,
      data,
      title,
      description,
      visible,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setTitle("");
    setDescription("");
    setVisible(false);
    if (fileInput.current) fileInput.current.value = "";
    setMessage({ tone: "success", text: "Document publié." });
    router.refresh();
  };

  const patch = async (id: string, body: Record<string, unknown>, text: string) => {
    setBusy(true);
    setMessage(null);
    const result = await apiCall(`/api/admin/documents/${id}`, "PATCH", body);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return false;
    }
    setMessage({ tone: "success", text });
    router.refresh();
    return true;
  };

  const remove = async (row: AdminDocumentRow) => {
    if (
      !window.confirm(
        `Supprimer « ${row.title} » ? Le document et toutes ses pages disparaissent définitivement.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await apiCall(`/api/admin/documents/${row.id}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: "Document supprimé." });
    router.refresh();
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>
            Les PDF publiés sont lus en ligne, page par page. Le fichier lui-même ne quitte
            jamais le serveur : il n&apos;y a rien à télécharger, même en inspectant la page.
          </p>
        </div>
      </div>

      {message ? (
        <div className={`alert alert-${message.tone === "success" ? "success" : "error"}`} role="status">
          <span>{message.text}</span>
        </div>
      ) : null}

      <section className="card">
        <h2 className="card-title">Publier un PDF</h2>
        <form className="stack" onSubmit={upload}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="doc-title">Titre</label>
              <input
                id="doc-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Laissez vide pour reprendre le nom du fichier"
                maxLength={160}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-file">Fichier PDF</label>
              <input id="doc-file" ref={fileInput} type="file" accept="application/pdf,.pdf" required />
              <span className="hint">{formatBytes(MAX_DOCUMENT_BYTES)} maximum.</span>
            </div>
            <div className="field field-full">
              <label htmlFor="doc-description">Description (facultative)</label>
              <textarea
                id="doc-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
              />
            </div>
          </div>

          <label className="checkbox">
            <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
            <span>Rendre visible publiquement dès la publication</span>
          </label>

          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Conversion des pages…
                </>
              ) : (
                "Publier le document"
              )}
            </button>
          </div>
        </form>
      </section>

      {documents.length === 0 ? (
        <div className="empty-state">Aucun document publié pour l&apos;instant.</div>
      ) : (
        <div className="doc-grid">
          {documents.map((row) => (
            <article className="card doc-card" key={row.id}>
              <div className="doc-card-preview">
                {row.firstPageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- image servie par notre route
                  <img src={row.firstPageUrl} alt="" draggable={false} />
                ) : (
                  <span className="small muted">Aucune page</span>
                )}
              </div>

              <div className="doc-card-body">
                <div className="btn-row" style={{ marginBottom: 6 }}>
                  <span className={`badge ${row.visible ? "badge-success" : "badge-warning"}`}>
                    {row.visible ? "Visible" : "Masqué"}
                  </span>
                  <span className="small muted">
                    {row.pageCount} page{row.pageCount > 1 ? "s" : ""} · {formatBytes(row.sizeBytes)}
                  </span>
                </div>

                {editing?.id === row.id ? (
                  <div className="stack">
                    <div className="field">
                      <label htmlFor={`title-${row.id}`}>Titre</label>
                      <input
                        id={`title-${row.id}`}
                        value={editing.title}
                        onChange={(event) =>
                          setEditing({ ...editing, title: event.target.value })
                        }
                        maxLength={160}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`desc-${row.id}`}>Description</label>
                      <textarea
                        id={`desc-${row.id}`}
                        value={editing.description}
                        onChange={(event) =>
                          setEditing({ ...editing, description: event.target.value })
                        }
                        maxLength={1000}
                      />
                    </div>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busy}
                        onClick={async () => {
                          const saved = await patch(
                            row.id,
                            { title: editing.title, description: editing.description },
                            "Document mis à jour.",
                          );
                          if (saved) setEditing(null);
                        }}
                      >
                        Enregistrer
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="card-title" style={{ marginBottom: 4 }}>
                      {row.title}
                    </h3>
                    {row.description ? <p className="small">{row.description}</p> : null}
                    <p className="small muted">Modifié le {formatDate(row.updatedAt)}</p>

                    <div className="btn-row">
                      <Link href={`/admin/documents/${row.id}/editeur`} className="btn btn-sm btn-primary">
                        Éditer le PDF
                      </Link>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          void patch(
                            row.id,
                            { visible: !row.visible },
                            row.visible ? "Document masqué." : "Document rendu visible.",
                          )
                        }
                      >
                        {row.visible ? "Masquer" : "Rendre visible"}
                      </button>
                      <Link href={`/documents/${row.slug}`} className="btn btn-sm btn-ghost" target="_blank">
                        Voir
                      </Link>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(row)}>
                        Renommer
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost btn-icon-danger"
                        disabled={busy}
                        onClick={() => void remove(row)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
