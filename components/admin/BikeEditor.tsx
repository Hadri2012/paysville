"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "./apiClient";
import { bikeImage } from "@/lib/images";
import type { Bike } from "@/lib/types";

export function BikeEditor({ bike }: { bike: Bike }) {
  const router = useRouter();
  const [name, setName] = useState(bike.name);
  const [description, setDescription] = useState(bike.description);
  const [imageUrl, setImageUrl] = useState(bike.imageUrl);
  const [features, setFeatures] = useState(bike.features.join("\n"));
  const [active, setActive] = useState(bike.active);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const preview: Bike = { ...bike, name, description, imageUrl, active };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const result = await apiCall(`/api/admin/bikes/${bike.kind}`, "PATCH", {
      name,
      description,
      imageUrl,
      features: features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
      active,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: "Vélo mis à jour." });
    router.refresh();
  };

  return (
    <div className="card stack">
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <img
          src={bikeImage(preview)}
          alt={name}
          style={{ width: 140, height: 94, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }}
        />
        <div>
          <h3 className="card-title" style={{ marginBottom: 4 }}>
            {bike.kind === "normal" ? "Vélo normal" : "Vélo électrique"}
          </h3>
          <span className={`badge ${active ? "badge-success" : "badge-danger"}`}>
            {active ? "Disponible" : "Désactivé"}
          </span>
        </div>
      </div>

      {message ? (
        <div className={`alert alert-${message.tone === "success" ? "success" : "error"}`} role="status">
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor={`${bike.kind}-name`}>Nom affiché</label>
        <input id={`${bike.kind}-name`} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor={`${bike.kind}-description`}>Description</label>
        <textarea
          id={`${bike.kind}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div className="field">
        <label htmlFor={`${bike.kind}-image`}>URL de la photo</label>
        <input
          id={`${bike.kind}-image`}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://... ou /images/velo.jpg"
        />
        <span className="hint">Laissez vide pour utiliser un visuel généré automatiquement.</span>
      </div>

      <div className="field">
        <label htmlFor={`${bike.kind}-features`}>Caractéristiques (une par ligne)</label>
        <textarea
          id={`${bike.kind}-features`}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          placeholder={"21 vitesses\nPanier avant\nAntivol fourni"}
        />
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>
          Vélo disponible à la location. Décochez pour désactiver temporairement ce vélo :
          plus aucune nouvelle demande ne pourra être envoyée pour lui.
        </span>
      </label>

      <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );
}
