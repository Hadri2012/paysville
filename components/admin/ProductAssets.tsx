"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fileExtension, formatBytes } from "@/lib/digital";
import {
  MAX_DIGITAL_FILES,
  MAX_DIGITAL_FILE_BYTES,
  MAX_MODEL3D_BYTES,
} from "@/lib/types";
import { apiCall } from "./apiClient";

export interface AdminProductFile {
  id: string;
  name: string;
  sizeBytes: number;
}

/**
 * Lit un fichier local en data-URI. Les routes d'upload attendent du JSON :
 * c'est le format le plus simple à valider côté serveur, et il évite d'avoir à
 * gérer le multipart pour des fichiers de quelques mégaoctets.
 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible."));
    reader.readAsDataURL(file);
  });
}

/**
 * Fichiers vendus avec un produit numérique, et modèle 3D de la fiche.
 *
 * Les deux passent par des routes dédiées plutôt que par le formulaire produit :
 * un envoi de plusieurs mégaoctets n'a pas à repartir à chaque changement de
 * prix, et un échec d'upload ne doit jamais faire perdre le reste de la saisie.
 */
export function ProductAssets({
  productId,
  productName,
  files,
  model3d,
}: {
  productId: string;
  productName: string;
  files: AdminProductFile[];
  model3d: AdminProductFile | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filesInput = useRef<HTMLInputElement | null>(null);
  const modelInput = useRef<HTMLInputElement | null>(null);

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Opération impossible.");
      return false;
    }
    router.refresh();
    return true;
  };

  const uploadFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    const room = MAX_DIGITAL_FILES - files.length;
    if (room <= 0) {
      setError(`Ce produit a déjà ${MAX_DIGITAL_FILES} fichiers.`);
      return;
    }

    setBusy(true);
    setError(null);
    // Un fichier à la fois : chaque envoi est indépendant, et le premier refus
    // (taille, quota) arrête la série au lieu de la poursuivre pour rien.
    for (const file of [...selected].slice(0, room)) {
      if (file.size > MAX_DIGITAL_FILE_BYTES) {
        setError(
          `« ${file.name} » dépasse ${formatBytes(MAX_DIGITAL_FILE_BYTES)} et n'a pas été envoyé.`,
        );
        break;
      }
      const data = await readAsDataUrl(file).catch(() => null);
      if (data === null) {
        setError(`« ${file.name} » n'a pas pu être lu.`);
        break;
      }
      const result = await apiCall(`/api/admin/products/${productId}/files`, "POST", {
        name: file.name,
        data,
      });
      if (!result.ok) {
        setError(result.message);
        break;
      }
    }
    setBusy(false);
    if (filesInput.current) filesInput.current.value = "";
    router.refresh();
  };

  const uploadModel = async (selected: FileList | null) => {
    const file = selected?.[0];
    if (!file) return;
    if (file.size > MAX_MODEL3D_BYTES) {
      setError(`Le modèle 3D ne doit pas dépasser ${formatBytes(MAX_MODEL3D_BYTES)}.`);
      return;
    }
    const data = await readAsDataUrl(file).catch(() => null);
    if (data === null) {
      setError("Ce fichier n'a pas pu être lu.");
      return;
    }
    await run(() =>
      apiCall(`/api/admin/products/${productId}/model`, "POST", {
        name: file.name,
        data,
      }),
    );
    if (modelInput.current) modelInput.current.value = "";
  };

  return (
    <div className="stack product-assets">
      {error ? (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <section>
        <h3 className="card-title">Fichiers vendus — {productName}</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Tout format accepté (STL, 3MF, STEP, PDF, ZIP…), {MAX_DIGITAL_FILES} fichiers
          maximum, {formatBytes(MAX_DIGITAL_FILE_BYTES)} par fichier. Ajouter un fichier
          bascule le produit en « fichier numérique » : il n&apos;a alors ni stock ni
          frais de livraison.
        </p>

        {files.length === 0 ? (
          <p className="small muted">Aucun fichier attaché pour l&apos;instant.</p>
        ) : (
          <ul className="admin-file-list">
            {files.map((file) => (
              <li key={file.id}>
                <span className="file-format">{fileExtension(file.name) || "FIC"}</span>
                <span className="admin-file-name">{file.name}</span>
                <span className="small muted">{formatBytes(file.sizeBytes)}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon-danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Retirer « ${file.name} » ? Les clients qui l'ont acheté ne pourront plus le télécharger.`,
                      )
                    ) {
                      return;
                    }
                    void run(() =>
                      apiCall(
                        `/api/admin/products/${productId}/files?fichier=${encodeURIComponent(
                          file.id,
                        )}`,
                        "DELETE",
                      ),
                    );
                  }}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="field">
          <label htmlFor={`files-${productId}`}>Ajouter des fichiers</label>
          <input
            id={`files-${productId}`}
            ref={filesInput}
            type="file"
            multiple
            disabled={busy || files.length >= MAX_DIGITAL_FILES}
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </div>
      </section>

      <section>
        <h3 className="card-title">Aperçu 3D</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Fichier <code>.glb</code> uniquement ({formatBytes(MAX_MODEL3D_BYTES)} maximum) :
          c&apos;est le format que la visionneuse sait afficher. Un STL ou un OBJ se
          convertit en GLB avec la plupart des trancheurs et éditeurs 3D. Le modèle
          s&apos;affiche sur la fiche produit, en plus des photos.
        </p>

        {model3d ? (
          <div className="admin-file-list">
            <div>
              <span className="file-format">3D</span>
              <span className="admin-file-name">{model3d.name}</span>
              <span className="small muted">{formatBytes(model3d.sizeBytes)}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon-danger"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Retirer l'aperçu 3D de cette fiche produit ?")) {
                    return;
                  }
                  void run(() =>
                    apiCall(`/api/admin/products/${productId}/model`, "DELETE"),
                  );
                }}
              >
                Retirer
              </button>
            </div>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor={`model-${productId}`}>
            {model3d ? "Remplacer le modèle" : "Ajouter un modèle"}
          </label>
          <input
            id={`model-${productId}`}
            ref={modelInput}
            type="file"
            accept=".glb,model/gltf-binary"
            disabled={busy}
            onChange={(event) => void uploadModel(event.target.files)}
          />
        </div>
      </section>

      {busy ? (
        <p className="small muted">
          <span className="spinner" aria-hidden="true" /> Envoi en cours…
        </p>
      ) : null}
    </div>
  );
}
