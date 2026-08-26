"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "./apiClient";

export interface SettingsForm {
  contactEmail: string;
  companyName: string;
  address: string;
  email: string;
  phone: string;
  vatNumber: string;
  cashOnDeliveryEnabled: boolean;
  /** Chaîne d'affichage (« 150,00 »), vide = aucun plafond. */
  cashOnDeliveryMax: string;
}

export function SettingsManager({
  initial,
  environment,
}: {
  initial: SettingsForm;
  environment: {
    stripeConfigured: boolean;
    webhookConfigured: boolean;
    driver: string;
    siteUrl: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const update = (key: keyof SettingsForm) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { cashOnDeliveryMax, ...rest } = form;
    const result = await apiCall("/api/admin/settings", "PATCH", {
      ...rest,
      cashOnDeliveryMaxCents: cashOnDeliveryMax,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: "Paramètres enregistrés." });
    router.refresh();
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
          <p>
            Informations affichées dans les CGV, la politique de confidentialité et le pied
            de page.
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

      <form className="card stack" onSubmit={save}>
        <h2 className="card-title">Informations de la boutique</h2>
        <div className="form-grid">
          <div className="field field-full">
            <label htmlFor="contactEmail">E-mail de contact (affiché publiquement)</label>
            <input
              id="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={update("contactEmail")}
            />
          </div>
          <div className="field field-full">
            <label htmlFor="companyName">Dénomination / nom du vendeur</label>
            <input id="companyName" value={form.companyName} onChange={update("companyName")} />
          </div>
          <div className="field field-full">
            <label htmlFor="address">Adresse du vendeur</label>
            <input id="address" value={form.address} onChange={update("address")} />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail légal (CGV / RGPD)</label>
            <input id="email" type="email" value={form.email} onChange={update("email")} />
          </div>
          <div className="field">
            <label htmlFor="phone">Téléphone</label>
            <input id="phone" value={form.phone} onChange={update("phone")} />
          </div>
          <div className="field field-full">
            <label htmlFor="vatNumber">Numéro d&apos;entreprise / TVA</label>
            <input id="vatNumber" value={form.vatNumber} onChange={update("vatNumber")} />
          </div>
        </div>

        <h2 className="card-title">Paiement en espèces à la livraison</h2>
        <p className="small muted" style={{ marginTop: -8 }}>
          Une fois activé, le client peut choisir de régler en liquide à la remise plutôt
          que par carte. La commande est alors confirmée et son stock retiré du catalogue
          immédiatement — avant tout encaissement, exactement comme pour un paiement par
          carte.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.cashOnDeliveryEnabled}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                cashOnDeliveryEnabled: event.target.checked,
              }))
            }
          />
          <span>Proposer le paiement en espèces à la livraison</span>
        </label>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="cashOnDeliveryMax">Plafond (facultatif)</label>
            <input
              id="cashOnDeliveryMax"
              inputMode="decimal"
              placeholder="Aucun plafond"
              value={form.cashOnDeliveryMax}
              onChange={update("cashOnDeliveryMax")}
              disabled={!form.cashOnDeliveryEnabled}
            />
            <span className="hint">
              Total maximal réglable en espèces, en euros. Au-delà, seule la carte est
              proposée — le livreur ne transporte pas la caisse pour faire la monnaie.
            </span>
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

      <section className="card">
        <h2 className="card-title">Configuration technique</h2>
        <p className="small muted">
          Ces éléments se règlent avec les variables d&apos;environnement du serveur, jamais
          depuis le navigateur.
        </p>
        <dl className="kv">
          <div>
            <dt>Clé secrète Stripe (STRIPE_SECRET_KEY)</dt>
            <dd>
              {environment.stripeConfigured ? (
                <span className="badge badge-success">Configurée</span>
              ) : (
                <span className="badge badge-danger">Manquante</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Secret du webhook (STRIPE_WEBHOOK_SECRET)</dt>
            <dd>
              {environment.webhookConfigured ? (
                <span className="badge badge-success">Configuré</span>
              ) : (
                <span className="badge badge-warning">Manquant</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Base de données</dt>
            <dd>
              {environment.driver === "postgres" ? (
                <span className="badge badge-success">PostgreSQL</span>
              ) : (
                <span className="badge badge-warning">Fichier local</span>
              )}
            </dd>
          </div>
          <div>
            <dt>URL publique du site</dt>
            <dd className="mono small">{environment.siteUrl}</dd>
          </div>
          <div>
            <dt>URL du webhook à déclarer chez Stripe</dt>
            <dd className="mono small">{environment.siteUrl}/api/stripe/webhook</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
