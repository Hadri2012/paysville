"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error?.message ?? "Connexion impossible.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Connexion au serveur impossible. Réessayez dans un instant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 420, margin: "40px auto" }}>
      <div className="center">
        <Link href="/" className="logo" style={{ justifyContent: "center" }}>
          <span className="logo-mark" aria-hidden="true">
            VL
          </span>
          VéloLoc
        </Link>
        <h1 style={{ marginTop: 18 }}>Administration</h1>
        <p className="muted small">Espace réservé à la gestion des locations.</p>
      </div>

      <form className="card stack" onSubmit={submit}>
        {error ? (
          <div className="alert alert-error" role="alert">
            <span>{error}</span>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="email">Adresse e-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" /> Connexion…
            </>
          ) : (
            "Se connecter"
          )}
        </button>
      </form>

      <p className="small muted center">
        Identifiants définis par les variables d&apos;environnement{" "}
        <code>ADMIN_EMAIL</code> et <code>ADMIN_PASSWORD</code> lors de la première
        connexion. <Link href="/">Retour au site</Link>
      </p>
    </div>
  );
}
