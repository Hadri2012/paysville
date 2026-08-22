"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { centsToInput, formatPrice } from "@/lib/money";
import { previewZoneFeeCents } from "@/lib/shop";
import { apiCall, type ApiResult } from "./apiClient";

export interface ZoneRow {
  id: string;
  postalCode: string;
  cities: string[];
  feeCents: number | null;
  active: boolean;
}

export interface ShippingSettings {
  defaultShippingFeeCents: number;
  freeShippingThresholdCents: number | null;
  reservationMinutes: number;
  lowStockThreshold: number;
  currency: string;
}

export function ShippingManager({
  zones,
  settings,
}: {
  zones: ZoneRow[];
  settings: ShippingSettings;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const [newZone, setNewZone] = useState({ postalCode: "", cities: "", fee: "" });
  const [edits, setEdits] = useState<Record<string, { cities: string; fee: string }>>(() =>
    Object.fromEntries(
      zones.map((zone) => [
        zone.id,
        {
          cities: zone.cities.join(", "),
          fee: zone.feeCents !== null ? centsToInput(zone.feeCents) : "",
        },
      ]),
    ),
  );

  const [general, setGeneral] = useState({
    defaultShippingFee: centsToInput(settings.defaultShippingFeeCents),
    freeShippingThreshold:
      settings.freeShippingThresholdCents !== null
        ? centsToInput(settings.freeShippingThresholdCents)
        : "",
    reservationMinutes: String(settings.reservationMinutes),
    lowStockThreshold: String(settings.lowStockThreshold),
  });

  const run = async (fn: () => Promise<ApiResult>, text: string) => {
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return false;
    }
    setMessage({ tone: "success", text });
    router.refresh();
    return true;
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Livraison</h1>
          <p>
            Codes postaux et communes desservis. Une adresse hors zone ne peut pas être
            commandée.
          </p>
        </div>
      </div>

      {message ? (
        <div
          className={`alert alert-${message.tone === "success" ? "success" : "error"}`}
          role="status"
        >
          <span>{message.text}</span>
        </div>
      ) : null}

      <section className="card stack">
        <h2 className="card-title">Ajouter un code postal</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="z-code">Code postal</label>
            <input
              id="z-code"
              value={newZone.postalCode}
              onChange={(event) =>
                setNewZone((current) => ({ ...current, postalCode: event.target.value }))
              }
              placeholder="1435"
            />
          </div>
          <div className="field">
            <label htmlFor="z-fee">Frais de livraison (€)</label>
            <input
              id="z-fee"
              value={newZone.fee}
              onChange={(event) =>
                setNewZone((current) => ({ ...current, fee: event.target.value }))
              }
              placeholder="Vide = calcul à la distance"
              inputMode="decimal"
            />
          </div>
          <div className="field field-full">
            <label htmlFor="z-cities">Communes (séparées par des virgules)</label>
            <input
              id="z-cities"
              value={newZone.cities}
              onChange={(event) =>
                setNewZone((current) => ({ ...current, cities: event.target.value }))
              }
              placeholder="Mont-Saint-Guibert, Corbais, Hévillers"
            />
            <span className="hint">
              Laisser vide pour accepter toutes les communes de ce code postal.
            </span>
          </div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !newZone.postalCode}
            onClick={async () => {
              const ok = await run(
                () =>
                  apiCall("/api/admin/shipping", "POST", {
                    postalCode: newZone.postalCode,
                    cities: newZone.cities,
                    fee: newZone.fee,
                    active: true,
                  }),
                "Zone de livraison ajoutée.",
              );
              if (ok) setNewZone({ postalCode: "", cities: "", fee: "" });
            }}
          >
            Ajouter la zone
          </button>
        </div>
      </section>

      <section className="stack">
        <h2>Zones configurées</h2>
        {zones.length === 0 ? (
          <div className="empty-state">Aucune zone de livraison configurée.</div>
        ) : (
          zones.map((zone) => {
            const edit = edits[zone.id] ?? { cities: "", fee: "" };
            return (
              <div className="card stack" key={zone.id}>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0 }} className="mono">
                    {zone.postalCode}{" "}
                    {zone.active ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge badge-warning">Inactive</span>
                    )}
                  </h3>
                  <span className="small muted">
                    Frais actuels :{" "}
                    {zone.feeCents !== null
                      ? formatPrice(zone.feeCents, settings.currency)
                      : (() => {
                          const auto = previewZoneFeeCents(
                            zone,
                            settings.defaultShippingFeeCents,
                          );
                          return auto === 0
                            ? "offerte"
                            : `${formatPrice(auto, settings.currency)} (calculé à la distance)`;
                        })()}
                  </span>
                </div>

                <div className="form-grid">
                  <div className="field field-full">
                    <label htmlFor={`cities-${zone.id}`}>Communes desservies</label>
                    <input
                      id={`cities-${zone.id}`}
                      value={edit.cities}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [zone.id]: { ...edit, cities: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`fee-${zone.id}`}>Frais de livraison (€)</label>
                    <input
                      id={`fee-${zone.id}`}
                      value={edit.fee}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [zone.id]: { ...edit, fee: event.target.value },
                        }))
                      }
                      placeholder="Vide = calcul à la distance"
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiCall(`/api/admin/shipping/${zone.id}`, "PATCH", {
                            postalCode: zone.postalCode,
                            cities: edit.cities,
                            fee: edit.fee,
                            active: zone.active,
                          }),
                        "Zone mise à jour.",
                      )
                    }
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          apiCall(`/api/admin/shipping/${zone.id}`, "PATCH", {
                            postalCode: zone.postalCode,
                            active: !zone.active,
                          }),
                        zone.active ? "Zone désactivée." : "Zone activée.",
                      )
                    }
                  >
                    {zone.active ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Retirer le code postal ${zone.postalCode} de la zone de livraison ?`,
                        )
                      ) {
                        return;
                      }
                      void run(
                        () => apiCall(`/api/admin/shipping/${zone.id}`, "DELETE"),
                        "Zone supprimée.",
                      );
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="card stack">
        <h2 className="card-title">Paramètres généraux</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="s-fee">Frais de livraison par défaut (€)</label>
            <input
              id="s-fee"
              value={general.defaultShippingFee}
              onChange={(event) =>
                setGeneral((current) => ({
                  ...current,
                  defaultShippingFee: event.target.value,
                }))
              }
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label htmlFor="s-free">Livraison offerte à partir de (€)</label>
            <input
              id="s-free"
              value={general.freeShippingThreshold}
              onChange={(event) =>
                setGeneral((current) => ({
                  ...current,
                  freeShippingThreshold: event.target.value,
                }))
              }
              placeholder="Vide = jamais offerte"
              inputMode="decimal"
            />
            <span className="hint">
              Non utilisé actuellement : la livraison offerte est réservée à la zone
              1435 (Mont-Saint-Guibert) ; les autres zones sont facturées à la distance.
            </span>
          </div>
          <div className="field">
            <label htmlFor="s-res">Durée de réservation du stock (minutes)</label>
            <input
              id="s-res"
              type="number"
              min={5}
              max={120}
              value={general.reservationMinutes}
              onChange={(event) =>
                setGeneral((current) => ({
                  ...current,
                  reservationMinutes: event.target.value,
                }))
              }
            />
            <span className="hint">
              Durée pendant laquelle le stock est bloqué le temps du paiement.
            </span>
          </div>
          <div className="field">
            <label htmlFor="s-low">Seuil d&apos;alerte de stock faible</label>
            <input
              id="s-low"
              type="number"
              min={0}
              value={general.lowStockThreshold}
              onChange={(event) =>
                setGeneral((current) => ({
                  ...current,
                  lowStockThreshold: event.target.value,
                }))
              }
            />
          </div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(
                () => apiCall("/api/admin/settings", "PATCH", general),
                "Paramètres enregistrés.",
              )
            }
          >
            Enregistrer les paramètres
          </button>
        </div>
      </section>
    </div>
  );
}
