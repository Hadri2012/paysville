"use client";

import Link from "next/link";
import { useState } from "react";
import type { BikeKind } from "@/lib/types";

interface Props {
  bikeKind: BikeKind;
  bikeName: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  message: string;
  terms: boolean;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  startDate: "",
  startTime: "10:00",
  endDate: "",
  endTime: "18:00",
  message: "",
  terms: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[+0-9][0-9 ().\-/]{5,24}$/;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (form.firstName.trim().length < 2) errors.firstName = "Prénom requis (2 caractères minimum).";
  if (form.lastName.trim().length < 2) errors.lastName = "Nom requis (2 caractères minimum).";
  if (!EMAIL_RE.test(form.email)) errors.email = "Adresse e-mail invalide.";
  if (!PHONE_RE.test(form.phone)) errors.phone = "Numéro de téléphone invalide.";
  if (!form.startDate || !form.startTime) errors.startDate = "Date et heure de début requises.";
  if (!form.endDate || !form.endTime) errors.endDate = "Date et heure de fin requises.";
  if (form.startDate && form.startTime && form.endDate && form.endTime) {
    const start = `${form.startDate}T${form.startTime}`;
    const end = `${form.endDate}T${form.endTime}`;
    if (end <= start) {
      errors.endDate = "La date de fin doit être après la date de début.";
    } else if (start < `${todayStr()}T00:00`) {
      errors.startDate = "La date de début ne peut pas être dans le passé.";
    }
  }
  if (!form.terms) errors.terms = "Vous devez accepter les conditions de location.";
  return errors;
}

export function RequestForm({ bikeKind, bikeName }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ number: string } | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, bikeKind }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setServerError(data?.error?.message ?? "Impossible d'envoyer la demande.");
        if (data?.error?.details && typeof data.error.details === "object") {
          setFieldErrors(data.error.details);
        }
        return;
      }
      setSuccess({ number: data.request.number });
    } catch {
      setServerError("Connexion au serveur impossible. Réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="card stack" style={{ textAlign: "center" }}>
        <div className="badge badge-success badge-lg" style={{ margin: "0 auto" }}>
          Demande envoyée
        </div>
        <h2 style={{ margin: 0 }}>Votre demande a bien été envoyée.</h2>
        <p className="muted" style={{ margin: 0 }}>
          Elle doit encore être acceptée par le propriétaire. Vous recevrez une réponse
          par e-mail dès qu&apos;elle aura été étudiée.
        </p>
        <div className="panel">
          <div className="small muted">Numéro de demande</div>
          <div className="mono" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
            {success.number}
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Conservez ce numéro : il vous permettra de suivre le statut de votre demande.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/suivi" className="btn btn-primary">
            Suivre ma demande
          </Link>
          <Link href="/" className="btn btn-secondary">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      {serverError ? (
        <div className="alert alert-error" role="alert">
          <span>{serverError}</span>
        </div>
      ) : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="firstName">Prénom</label>
          <input
            id="firstName"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            aria-invalid={Boolean(fieldErrors.firstName)}
            required
          />
          {fieldErrors.firstName ? <span className="field-error">{fieldErrors.firstName}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="lastName">Nom</label>
          <input
            id="lastName"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            aria-invalid={Boolean(fieldErrors.lastName)}
            required
          />
          {fieldErrors.lastName ? <span className="field-error">{fieldErrors.lastName}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            required
          />
          {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="phone">Numéro de téléphone</label>
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
            placeholder="+32 470 12 34 56"
            required
          />
          {fieldErrors.phone ? <span className="field-error">{fieldErrors.phone}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="startDate">Date de début</label>
          <input
            id="startDate"
            type="date"
            min={todayStr()}
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            aria-invalid={Boolean(fieldErrors.startDate)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="startTime">Heure de début</label>
          <input
            id="startTime"
            type="time"
            value={form.startTime}
            onChange={(e) => set("startTime", e.target.value)}
            required
          />
          {fieldErrors.startDate ? <span className="field-error">{fieldErrors.startDate}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="endDate">Date de fin</label>
          <input
            id="endDate"
            type="date"
            min={form.startDate || todayStr()}
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            aria-invalid={Boolean(fieldErrors.endDate)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="endTime">Heure de fin</label>
          <input
            id="endTime"
            type="time"
            value={form.endTime}
            onChange={(e) => set("endTime", e.target.value)}
            required
          />
          {fieldErrors.endDate ? <span className="field-error">{fieldErrors.endDate}</span> : null}
        </div>

        <div className="field field-full">
          <label htmlFor="message">Message (facultatif)</label>
          <textarea
            id="message"
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            maxLength={500}
            placeholder={`Une précision à nous transmettre pour le ${bikeName.toLowerCase()} ?`}
          />
        </div>
      </div>

      <div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.terms}
            onChange={(e) => set("terms", e.target.checked)}
            aria-invalid={Boolean(fieldErrors.terms)}
          />
          <span>
            J&apos;accepte les conditions de location (le vélo doit être rendu en bon état,
            à l&apos;heure convenue, et reste sous ma responsabilité durant la période
            réservée).
          </span>
        </label>
        {fieldErrors.terms ? <span className="field-error">{fieldErrors.terms}</span> : null}
      </div>

      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" /> Envoi…
          </>
        ) : (
          "Envoyer ma demande"
        )}
      </button>
    </form>
  );
}
