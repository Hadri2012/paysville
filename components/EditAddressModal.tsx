"use client";

import { useState } from "react";
import type { PublicOrderView } from "@/lib/orders";

export function EditAddressModal({
  order,
  onAddressUpdated,
  onClose,
}: {
  order: PublicOrderView;
  onAddressUpdated: (updatedOrder: PublicOrderView) => void;
  onClose: () => void;
}) {
  const [street, setStreet] = useState(order.address.street);
  const [streetNumber, setStreetNumber] = useState(order.address.streetNumber);
  const [complement, setComplement] = useState(order.address.complement);
  const [postalCode, setPostalCode] = useState(order.address.postalCode);
  const [city, setCity] = useState(order.address.city);
  const [country, setCountry] = useState(order.address.country);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/update-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: order.number,
          email: order.customer.email,
          street,
          streetNumber,
          complement,
          postalCode,
          city,
          country,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(
          data?.error?.message ??
            "Une erreur est survenue lors de la mise à jour de votre adresse.",
        );
        return;
      }

      onAddressUpdated(data.order);
      onClose();
    } catch {
      setError("Connexion impossible. Merci de réessayer dans un instant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Modifier l&apos;adresse de livraison</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="street">Rue</label>
              <input
                id="street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="streetNumber">Numéro</label>
              <input
                id="streetNumber"
                value={streetNumber}
                onChange={(e) => setStreetNumber(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="complement">Complément (optionnel)</label>
            <input
              id="complement"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Appartement, boîte postale..."
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="postalCode">Code postal</label>
              <input
                id="postalCode"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="city">Ville</label>
              <input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="country">Pays</label>
            <input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Mise à jour…
                </>
              ) : (
                "Enregistrer"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
