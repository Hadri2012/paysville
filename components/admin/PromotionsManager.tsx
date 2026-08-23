"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { centsToInput, formatPrice } from "@/lib/money";
import { apiCall, type ApiResult } from "./apiClient";

export interface PromotionRow {
  id: string;
  code: string;
  active: boolean;
  type: "fixed" | "percent";
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  minSubtotalCents: number | null;
  maxUses: number | null;
  uses: number;
  oncePerCustomer: boolean;
  archived: boolean;
}

interface Draft {
  id: string | null;
  code: string;
  type: "fixed" | "percent";
  value: string;
  startsAt: string;
  endsAt: string;
  minSubtotal: string;
  maxUses: string;
  oncePerCustomer: boolean;
  active: boolean;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const EMPTY: Draft = {
  id: null,
  code: "",
  type: "percent",
  value: "10",
  startsAt: "",
  endsAt: "",
  minSubtotal: "",
  maxUses: "",
  oncePerCustomer: false,
  active: true,
};

export function PromotionsManager({
  promotions,
  currency,
}: {
  promotions: PromotionRow[];
  currency: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const update = (key: keyof Draft, value: string | boolean) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    setFieldErrors({});

    const payload = {
      code: draft.code,
      type: draft.type,
      value: draft.value,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      minSubtotal: draft.minSubtotal,
      maxUses: draft.maxUses,
      oncePerCustomer: draft.oncePerCustomer,
      active: draft.active,
    };

    const result = draft.id
      ? await apiCall(`/api/admin/promotions/${draft.id}`, "PATCH", payload)
      : await apiCall("/api/admin/promotions", "POST", payload);

    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      if (result.details) setFieldErrors(result.details);
      return;
    }
    setDraft(null);
    setMessage({ tone: "success", text: "Code promotionnel enregistré." });
    router.refresh();
  };

  const act = async (fn: () => Promise<ApiResult>, text: string) => {
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text });
    router.refresh();
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Codes promotionnels</h1>
          <p>
            Toutes les validations (dates, montant minimum, limite d&apos;utilisation) sont
            appliquées côté serveur au moment de la commande.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setDraft({ ...EMPTY });
            setFieldErrors({});
          }}
        >
          + Nouveau code
        </button>
      </div>

      {message ? (
        <div
          className={`alert alert-${message.tone === "success" ? "success" : "error"}`}
          role="status"
        >
          <span>{message.text}</span>
        </div>
      ) : null}

      {draft ? (
        <form className="card stack" onSubmit={save}>
          <h2 className="card-title">{draft.id ? "Modifier le code" : "Nouveau code"}</h2>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="c-code">Code *</label>
              <input
                id="c-code"
                value={draft.code}
                onChange={(event) => update("code", event.target.value.toUpperCase())}
                placeholder="BIENVENUE"
                aria-invalid={Boolean(fieldErrors.code)}
                required
              />
              {fieldErrors.code ? (
                <span className="field-error">{fieldErrors.code}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="c-type">Type de remise *</label>
              <select
                id="c-type"
                value={draft.type}
                onChange={(event) => update("type", event.target.value)}
              >
                <option value="percent">Pourcentage (%)</option>
                <option value="fixed">Montant fixe (€)</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="c-value">
                Valeur * {draft.type === "percent" ? "(en %)" : "(en €)"}
              </label>
              <input
                id="c-value"
                value={draft.value}
                onChange={(event) => update("value", event.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(fieldErrors.value)}
                required
              />
              {fieldErrors.value ? (
                <span className="field-error">{fieldErrors.value}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="c-min">Montant minimum d&apos;achat (€)</label>
              <input
                id="c-min"
                value={draft.minSubtotal}
                onChange={(event) => update("minSubtotal", event.target.value)}
                placeholder="Aucun"
                inputMode="decimal"
              />
            </div>

            <div className="field">
              <label htmlFor="c-start">Début de validité</label>
              <input
                id="c-start"
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => update("startsAt", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="c-end">Fin de validité</label>
              <input
                id="c-end"
                type="datetime-local"
                value={draft.endsAt}
                onChange={(event) => update("endsAt", event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="c-max">Nombre maximal d&apos;utilisations</label>
              <input
                id="c-max"
                type="number"
                min={1}
                value={draft.maxUses}
                onChange={(event) => update("maxUses", event.target.value)}
                placeholder="Illimité"
              />
            </div>

            <div className="field">
              <label className="checkbox" style={{ marginTop: 28 }}>
                <input
                  type="checkbox"
                  checked={draft.oncePerCustomer}
                  onChange={(event) => update("oncePerCustomer", event.target.checked)}
                />
                <span>Une seule fois par client</span>
              </label>
              <span className="hint">
                Vérifié sur l&apos;adresse e-mail de la commande. Indépendant du
                nombre maximal ci-contre, qui compte toutes les personnes.
              </span>
            </div>

            <div className="field">
              <label className="checkbox" style={{ marginTop: 28 }}>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => update("active", event.target.checked)}
                />
                <span>Code actif</span>
              </label>
            </div>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              Annuler
            </button>
          </div>
        </form>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Remise</th>
              <th>Validité</th>
              <th>Conditions</th>
              <th className="num">Utilisations</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={7} className="center muted">
                  Aucun code promotionnel.
                </td>
              </tr>
            ) : (
              promotions.map((promotion) => (
                <tr key={promotion.id}>
                  <td className="mono">
                    <strong>{promotion.code}</strong>
                  </td>
                  <td>
                    {promotion.type === "percent"
                      ? `${promotion.value} %`
                      : formatPrice(promotion.value, currency)}
                  </td>
                  <td className="small muted">
                    {promotion.startsAt
                      ? `du ${new Date(promotion.startsAt).toLocaleDateString("fr-BE")}`
                      : "sans date de début"}
                    <br />
                    {promotion.endsAt
                      ? `au ${new Date(promotion.endsAt).toLocaleDateString("fr-BE")}`
                      : "sans date de fin"}
                  </td>
                  <td className="small muted">
                    {promotion.minSubtotalCents
                      ? `min. ${formatPrice(promotion.minSubtotalCents, currency)}`
                      : "aucun minimum"}
                  </td>
                  <td className="num">
                    {promotion.uses}
                    {promotion.maxUses ? ` / ${promotion.maxUses}` : ""}
                    {promotion.oncePerCustomer ? (
                      <div className="small muted">1 / client</div>
                    ) : null}
                  </td>
                  <td>
                    {promotion.archived ? (
                      <span className="badge">Archivé</span>
                    ) : promotion.active ? (
                      <span className="badge badge-success">Actif</span>
                    ) : (
                      <span className="badge badge-warning">Inactif</span>
                    )}
                  </td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setDraft({
                            id: promotion.id,
                            code: promotion.code,
                            type: promotion.type,
                            value:
                              promotion.type === "percent"
                                ? String(promotion.value)
                                : centsToInput(promotion.value),
                            startsAt: toLocalInput(promotion.startsAt),
                            endsAt: toLocalInput(promotion.endsAt),
                            minSubtotal:
                              promotion.minSubtotalCents !== null
                                ? centsToInput(promotion.minSubtotalCents)
                                : "",
                            maxUses:
                              promotion.maxUses !== null ? String(promotion.maxUses) : "",
                            oncePerCustomer: promotion.oncePerCustomer,
                            active: promotion.active,
                          });
                          setFieldErrors({});
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Modifier
                      </button>
                      {!promotion.archived ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() =>
                            act(
                              () =>
                                apiCall(`/api/admin/promotions/${promotion.id}`, "PATCH", {
                                  code: promotion.code,
                                  type: promotion.type,
                                  active: !promotion.active,
                                }),
                              promotion.active ? "Code désactivé." : "Code activé.",
                            )
                          }
                        >
                          {promotion.active ? "Désactiver" : "Activer"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Supprimer le code « ${promotion.code} » ?`)) {
                            return;
                          }
                          void act(
                            () => apiCall(`/api/admin/promotions/${promotion.id}`, "DELETE"),
                            "Code supprimé ou archivé.",
                          );
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
