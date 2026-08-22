"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "./apiClient";

export interface StockRow {
  id: string;
  sku: string;
  name: string;
  stock: number;
  available: number;
  reserved: number;
  active: boolean;
}

export function StockManager({
  rows,
  lowStockThreshold,
}: {
  rows: StockRow[];
  lowStockThreshold: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, String(row.stock)])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );

  const save = async (row: StockRow, nextValue: string) => {
    setBusyId(row.id);
    setMessage(null);
    const result = await apiCall(`/api/admin/products/${row.id}`, "PATCH", {
      sku: row.sku,
      name: row.name,
      stock: nextValue,
    });
    setBusyId(null);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: `Stock mis à jour pour ${row.sku}.` });
    router.refresh();
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Stocks</h1>
          <p>
            Vue rapide des quantités. « Disponible » = stock physique moins les
            réservations de paniers en cours de paiement.
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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Réf.</th>
              <th className="num">Réservé</th>
              <th className="num">Disponible</th>
              <th>Disponibilité</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  {!row.active ? (
                    <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                      Inactif
                    </span>
                  ) : null}
                </td>
                <td className="mono small">{row.sku}</td>
                <td className="num">{row.reserved}</td>
                <td className="num">{row.available}</td>
                <td>
                  {row.available === 0 ? (
                    <span className="badge badge-danger badge-dot">Rupture de stock</span>
                  ) : row.available <= lowStockThreshold ? (
                    <span className="badge badge-warning badge-dot">Stock faible</span>
                  ) : (
                    <span className="badge badge-success badge-dot">En stock</span>
                  )}
                </td>
                <td>
                  <div className="inline-form" style={{ flexWrap: "nowrap" }}>
                    <input
                      type="number"
                      min={0}
                      value={values[row.id] ?? String(row.stock)}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [row.id]: event.target.value,
                        }))
                      }
                      style={{ maxWidth: 90 }}
                      aria-label={`Stock de ${row.name}`}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => save(row, values[row.id] ?? String(row.stock))}
                    >
                      {busyId === row.id ? "…" : "Enregistrer"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
