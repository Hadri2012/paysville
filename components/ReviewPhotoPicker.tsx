"use client";

import { useRef, useState } from "react";
import { MAX_REVIEW_PHOTOS, MAX_REVIEW_PHOTO_BYTES } from "@/lib/types";

/**
 * Choix des photos jointes à un avis.
 *
 * Le redimensionnement a lieu ici, dans le navigateur : une photo de téléphone pèse
 * plusieurs mégaoctets, et ces images finissent dans le document JSON de la boutique
 * — que chaque lecture de page recharge en entier. On envoie donc au serveur une
 * image déjà réduite, jamais le fichier d'origine. Le serveur revérifie de son côté,
 * puisque rien de ce qui vient du navigateur ne fait autorité.
 */

/** Côté le plus long après réduction. Assez pour montrer un objet, pas pour imprimer. */
const MAX_DIMENSION = 1000;

/** Qualité JPEG de départ, abaissée par paliers si l'image reste trop lourde. */
const QUALITY_STEPS = [0.75, 0.6, 0.45];

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image illisible"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Réduit une image et renvoie un data-URI JPEG, ou `null` si rien n'y fait. */
async function shrink(file: File): Promise<string | null> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_REVIEW_PHOTO_BYTES) return dataUrl;
  }
  return null;
}

export function ReviewPhotoPicker({
  photos,
  onChange,
  disabled,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const room = MAX_REVIEW_PHOTOS - photos.length;
    const added: string[] = [];
    let rejected = 0;

    for (const file of [...files].slice(0, room)) {
      try {
        const shrunk = await shrink(file);
        if (shrunk) added.push(shrunk);
        else rejected += 1;
      } catch {
        rejected += 1;
      }
    }

    if (added.length > 0) onChange([...photos, ...added]);
    if (rejected > 0) {
      setError(
        rejected > 1
          ? `${rejected} photos n'ont pas pu être ajoutées.`
          : "Cette photo n'a pas pu être ajoutée. Essayez une autre image.",
      );
    }
    // Le champ doit être vidé pour qu'un même fichier puisse être re-choisi.
    if (input.current) input.current.value = "";
    setBusy(false);
  };

  const full = photos.length >= MAX_REVIEW_PHOTOS;

  return (
    <div className="field">
      <span className="label-like">Photos (facultatif)</span>

      {photos.length > 0 ? (
        <ul className="review-photo-picks">
          {photos.map((photo, index) => (
            <li key={photo.slice(-24) + index}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`Photo ${index + 1}`} />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disabled}
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
                aria-label={`Retirer la photo ${index + 1}`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(event) => void pick(event.target.files)}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled || busy || full}
        onClick={() => input.current?.click()}
      >
        {busy ? "Préparation…" : full ? "Maximum atteint" : "Ajouter une photo"}
      </button>

      {error ? <span className="field-error">{error}</span> : null}
      <span className="hint">
        Jusqu&apos;à {MAX_REVIEW_PHOTOS} photos, redimensionnées automatiquement
        avant l&apos;envoi.
      </span>
    </div>
  );
}
