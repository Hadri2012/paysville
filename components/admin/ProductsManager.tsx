"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { centsToInput, formatPrice } from "@/lib/money";
import { MAX_PRODUCT_COLORS, type ProductKind } from "@/lib/types";
import { apiCall, type ApiResult } from "./apiClient";
import { ProductAssets, type AdminProductFile } from "./ProductAssets";

export interface AdminProductColor {
  id: string;
  name: string;
  hex: string;
}

export interface AdminProductRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  available: number;
  imageUrl: string;
  resolvedImageUrl: string;
  category: string;
  sortOrder: number;
  active: boolean;
  archived: boolean;
  kind: ProductKind;
  digitalFiles: AdminProductFile[];
  model3d: AdminProductFile | null;
  colors: AdminProductColor[];
}

interface Draft {
  id: string | null;
  sku: string;
  name: string;
  description: string;
  price: string;
  stock: string;
  imageUrl: string;
  category: string;
  sortOrder: string;
  active: boolean;
  kind: ProductKind;
  colors: AdminProductColor[];
}

/** Pastille par défaut d'une couleur qu'on vient d'ajouter, avant réglage. */
const DEFAULT_COLOR_HEX = "#6b7280";

function emptyDraft(nextOrder: number): Draft {
  return {
    id: null,
    sku: "",
    name: "",
    description: "",
    price: "",
    stock: "0",
    imageUrl: "",
    category: "",
    sortOrder: String(nextOrder),
    active: true,
    kind: "physical",
    colors: [],
  };
}

function toDraft(product: AdminProductRow): Draft {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: centsToInput(product.priceCents),
    stock: String(product.stock),
    imageUrl: product.imageUrl,
    category: product.category,
    sortOrder: String(product.sortOrder),
    active: product.active,
    kind: product.kind,
    colors: product.colors,
  };
}

export function ProductsManager({
  products,
  currency,
  lowStockThreshold,
}: {
  products: AdminProductRow[];
  currency: string;
  lowStockThreshold: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);
  // Produit dont le panneau « fichiers et 3D » est déplié (un seul à la fois).
  const [assetsFor, setAssetsFor] = useState<string | null>(null);

  const nextOrder =
    products.reduce((max, product) => Math.max(max, product.sortOrder), 0) + 10;
  const visible = products.filter((product) => showArchived || !product.archived);

  const update = (key: keyof Draft, value: string | boolean) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const addColor = () =>
    setDraft((current) =>
      current
        ? {
            ...current,
            colors: [
              ...current.colors,
              {
                id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `c${Date.now()}`,
                name: "",
                hex: DEFAULT_COLOR_HEX,
              },
            ],
          }
        : current,
    );

  const updateColor = (index: number, patch: Partial<AdminProductColor>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            colors: current.colors.map((color, i) =>
              i === index ? { ...color, ...patch } : color,
            ),
          }
        : current,
    );

  const removeColor = (index: number) =>
    setDraft((current) =>
      current ? { ...current, colors: current.colors.filter((_, i) => i !== index) } : current,
    );

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    setFieldErrors({});

    const payload = {
      sku: draft.sku,
      name: draft.name,
      description: draft.description,
      price: draft.price,
      stock: draft.stock,
      imageUrl: draft.imageUrl,
      category: draft.category,
      sortOrder: draft.sortOrder,
      active: draft.active,
      kind: draft.kind,
      colors: draft.colors,
    };

    const result = draft.id
      ? await apiCall(`/api/admin/products/${draft.id}`, "PATCH", payload)
      : await apiCall("/api/admin/products", "POST", payload);

    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      if (result.details) setFieldErrors(result.details);
      return;
    }
    const savedId =
      draft.id ??
      (result.ok && typeof result.data.product === "object" && result.data.product
        ? ((result.data.product as { id?: string }).id ?? null)
        : null);
    const needsFiles = draft.kind === "digital";

    setDraft(null);
    setMessage({
      tone: "success",
      text: needsFiles
        ? "Produit enregistré. Ajoutez maintenant les fichiers vendus via « Fichiers / 3D »."
        : "Produit enregistré.",
    });
    // Un produit numérique sans fichier n'est pas vendable : on ouvre directement
    // le panneau qui permet d'en joindre.
    if (needsFiles && savedId) setAssetsFor(savedId);
    router.refresh();
  };

  const runAction = async (
    action: () => Promise<ApiResult>,
    successText: string,
  ) => {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setMessage({ tone: "success", text: successText });
    router.refresh();
  };

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Produits</h1>
          <p>Créez, modifiez, activez ou archivez les produits de la boutique.</p>
        </div>
        <div className="btn-row">
          <label className="checkbox small">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            <span>Afficher les archivés</span>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDraft(emptyDraft(nextOrder));
              setFieldErrors({});
            }}
          >
            + Nouveau produit
          </button>
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

      {draft ? (
        <form className="card stack" onSubmit={save}>
          <h2 className="card-title">
            {draft.id ? "Modifier le produit" : "Nouveau produit"}
          </h2>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="p-name">Nom *</label>
              <input
                id="p-name"
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                aria-invalid={Boolean(fieldErrors.name)}
                required
              />
              {fieldErrors.name ? (
                <span className="field-error">{fieldErrors.name}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="p-sku">Référence *</label>
              <input
                id="p-sku"
                value={draft.sku}
                onChange={(event) => update("sku", event.target.value.toUpperCase())}
                aria-invalid={Boolean(fieldErrors.sku)}
                placeholder="P15"
                required
              />
              {fieldErrors.sku ? (
                <span className="field-error">{fieldErrors.sku}</span>
              ) : null}
            </div>

            <div className="field field-full">
              <label htmlFor="p-description">Description</label>
              <textarea
                id="p-description"
                value={draft.description}
                onChange={(event) => update("description", event.target.value)}
                maxLength={2000}
              />
            </div>

            <div className="field">
              <label htmlFor="p-price">Prix (€) *</label>
              <input
                id="p-price"
                value={draft.price}
                onChange={(event) => update("price", event.target.value)}
                inputMode="decimal"
                placeholder="2,99"
                aria-invalid={Boolean(fieldErrors.price)}
                required
              />
              {fieldErrors.price ? (
                <span className="field-error">{fieldErrors.price}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="p-kind">Type de produit *</label>
              <select
                id="p-kind"
                value={draft.kind}
                onChange={(event) => update("kind", event.target.value)}
              >
                <option value="physical">Objet à livrer</option>
                <option value="digital">Fichier à télécharger</option>
              </select>
              <span className="hint">
                {draft.kind === "digital"
                  ? "Ni stock ni frais de livraison : l'acheteur télécharge les fichiers dès le paiement confirmé."
                  : "Produit expédié : stock décompté et frais de livraison selon la zone."}
              </span>
            </div>

            {draft.kind === "digital" ? (
              <div className="field">
                <label>Stock</label>
                <p className="hint" style={{ marginTop: 8 }}>
                  Sans objet pour un fichier : il reste disponible indéfiniment.
                </p>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="p-stock">Stock *</label>
                <input
                  id="p-stock"
                  type="number"
                  min={0}
                  value={draft.stock}
                  onChange={(event) => update("stock", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.stock)}
                  required
                />
                {fieldErrors.stock ? (
                  <span className="field-error">{fieldErrors.stock}</span>
                ) : null}
              </div>
            )}

            <div className="field">
              <label htmlFor="p-category">Catégorie</label>
              <input
                id="p-category"
                value={draft.category}
                onChange={(event) => update("category", event.target.value)}
                list="categories"
              />
              <datalist id="categories">
                {[...new Set(products.map((p) => p.category).filter(Boolean))].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div className="field">
              <label htmlFor="p-order">Ordre d&apos;affichage</label>
              <input
                id="p-order"
                type="number"
                value={draft.sortOrder}
                onChange={(event) => update("sortOrder", event.target.value)}
              />
            </div>

            <div className="field field-full">
              <label htmlFor="p-image">URL de l&apos;image</label>
              <input
                id="p-image"
                value={draft.imageUrl}
                onChange={(event) => update("imageUrl", event.target.value)}
                placeholder="https://… ou /images/mon-produit.jpg"
                aria-invalid={Boolean(fieldErrors.imageUrl)}
              />
              <span className="hint">
                Laissez vide pour utiliser le visuel généré automatiquement. Une image
                déposée dans le dossier <code>public/</code> s&apos;utilise avec un chemin
                comme <code>/images/mon-produit.jpg</code>.
              </span>
              {fieldErrors.imageUrl ? (
                <span className="field-error">{fieldErrors.imageUrl}</span>
              ) : null}
            </div>

            {draft.kind === "physical" ? (
              <div className="field field-full">
                <label>Couleurs proposées</label>
                <span className="hint" style={{ display: "block", marginBottom: 8 }}>
                  Facultatif. Dès qu&apos;une couleur est ajoutée, les clients doivent en
                  choisir une avant de commander. Le stock reste unique, partagé entre
                  toutes les couleurs.
                </span>

                {draft.colors.length > 0 ? (
                  <div className="color-rows">
                    {draft.colors.map((color, index) => (
                      <div className="color-row" key={color.id}>
                        <input
                          type="color"
                          value={color.hex}
                          onChange={(event) => updateColor(index, { hex: event.target.value })}
                          aria-label={`Pastille de la couleur « ${color.name || "sans nom"} »`}
                        />
                        <input
                          type="text"
                          value={color.name}
                          onChange={(event) => updateColor(index, { name: event.target.value })}
                          placeholder="Ex. Noir"
                          maxLength={40}
                          aria-label="Nom de la couleur"
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon-danger"
                          onClick={() => removeColor(index)}
                        >
                          Retirer
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ marginTop: 8 }}
                  disabled={draft.colors.length >= MAX_PRODUCT_COLORS}
                  onClick={addColor}
                >
                  + Ajouter une couleur
                </button>
              </div>
            ) : null}

            <div className="field field-full">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => update("active", event.target.checked)}
                />
                <span>Produit actif (visible dans la boutique)</span>
              </label>
            </div>
          </div>

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Enregistrement…
                </>
              ) : (
                "Enregistrer"
              )}
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
              <th>Produit</th>
              <th>Réf.</th>
              <th>Type</th>
              <th className="num">Prix</th>
              <th className="num">Stock</th>
              <th className="num">Dispo.</th>
              <th>État</th>
              <th className="num">Ordre</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="center muted">
                  Aucun produit.
                </td>
              </tr>
            ) : (
              visible.map((product) => (
                <Fragment key={product.id}>
                <tr>
                  <td>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.resolvedImageUrl}
                        alt=""
                        width={40}
                        height={40}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          objectFit: "cover",
                          border: "1px solid var(--line)",
                        }}
                      />
                      <div>
                        <strong>{product.name}</strong>
                        <div className="small muted">
                          {product.category || "Sans catégorie"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="mono small">{product.sku}</td>
                  <td>
                    {product.kind === "digital" ? (
                      <span className="badge badge-info">
                        Fichier ×{product.digitalFiles.length}
                      </span>
                    ) : (
                      <span className="badge">Objet</span>
                    )}
                    {product.model3d ? (
                      <span className="badge badge-3d" title="Aperçu 3D disponible">
                        🧊 3D
                      </span>
                    ) : null}
                    {product.colors.length > 0 ? (
                      <span
                        className="badge"
                        title={product.colors.map((c) => c.name).join(", ")}
                      >
                        🎨 {product.colors.length}
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{formatPrice(product.priceCents, currency)}</td>
                  <td className="num">
                    {product.kind === "digital" ? (
                      <span className="muted">—</span>
                    ) : (
                      product.stock
                    )}
                  </td>
                  <td className="num">
                    {product.kind === "digital" ? (
                      product.digitalFiles.length > 0 ? (
                        <span className="badge badge-success">∞</span>
                      ) : (
                        <span className="badge badge-danger" title="Aucun fichier joint">
                          0
                        </span>
                      )
                    ) : product.available === 0 ? (
                      <span className="badge badge-danger">0</span>
                    ) : product.available <= lowStockThreshold ? (
                      <span className="badge badge-warning">{product.available}</span>
                    ) : (
                      product.available
                    )}
                  </td>
                  <td>
                    {product.archived ? (
                      <span className="badge">Archivé</span>
                    ) : product.active ? (
                      <span className="badge badge-success">Actif</span>
                    ) : (
                      <span className="badge badge-warning">Inactif</span>
                    )}
                  </td>
                  <td className="num">{product.sortOrder}</td>
                  <td>
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setDraft(toDraft(product));
                          setFieldErrors({});
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-expanded={assetsFor === product.id}
                        onClick={() =>
                          setAssetsFor((current) =>
                            current === product.id ? null : product.id,
                          )
                        }
                      >
                        Fichiers / 3D
                      </button>
                      {!product.archived ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              () =>
                                apiCall(`/api/admin/products/${product.id}`, "PATCH", {
                                  sku: product.sku,
                                  name: product.name,
                                  active: !product.active,
                                }),
                              product.active ? "Produit désactivé." : "Produit activé.",
                            )
                          }
                        >
                          {product.active ? "Désactiver" : "Activer"}
                        </button>
                      ) : null}
                      {product.archived ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() =>
                            runAction(
                              () =>
                                apiCall(`/api/admin/products/${product.id}`, "PATCH", {
                                  archived: false,
                                }),
                              "Produit restauré.",
                            )
                          }
                        >
                          Restaurer
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Archiver « ${product.name} » ? Il disparaîtra de la boutique.`,
                              )
                            ) {
                              return;
                            }
                            void runAction(
                              () => apiCall(`/api/admin/products/${product.id}`, "DELETE"),
                              "Produit archivé.",
                            );
                          }}
                        >
                          Archiver
                        </button>
                      )}
                      <Link
                        href={`/produit/${product.slug}`}
                        className="btn btn-ghost btn-sm"
                        target="_blank"
                      >
                        Voir
                      </Link>
                    </div>
                  </td>
                </tr>
                {assetsFor === product.id ? (
                  <tr>
                    <td colSpan={9}>
                      <ProductAssets
                        productId={product.id}
                        productName={product.name}
                        files={product.digitalFiles}
                        model3d={product.model3d}
                      />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
