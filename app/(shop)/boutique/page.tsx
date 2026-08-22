import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { reviewSummaries } from "@/lib/reviews";
import {
  SORT_OPTIONS,
  isSortKey,
  listPublicProducts,
  searchProducts,
  sortProducts,
  type SortKey,
} from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Boutique",
  description:
    "Tous les objets disponibles chez Hadrishop : rangements, supports, porte-clés et accessoires imprimés en 3D.",
};

interface SearchParams {
  categorie?: string;
  tri?: string;
  q?: string;
}

/** Conserve les filtres actifs quand on change une seule dimension. */
function buildHref(current: SearchParams, changes: Partial<SearchParams>): string {
  const merged = { ...current, ...changes };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.categorie) params.set("categorie", merged.categorie);
  if (merged.tri && merged.tri !== "pertinence") params.set("tri", merged.tri);
  const query = params.toString();
  return query ? `/boutique?${query}` : "/boutique";
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await searchParams;
  const state = await readState();
  const all = listPublicProducts(state);
  const ratings = reviewSummaries(state);

  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  const query = (filters.q ?? "").trim();
  const selected =
    filters.categorie && categories.includes(filters.categorie) ? filters.categorie : null;
  const sort: SortKey = isSortKey(filters.tri) ? filters.tri : "pertinence";
  const active = { q: query, categorie: selected ?? undefined, tri: sort };

  const filtered = selected ? all.filter((p) => p.category === selected) : all;
  const visible = sortProducts(searchProducts(filtered, query), sort, ratings);

  const hasFilters = Boolean(query || selected || sort !== "pertinence");

  return (
    <main className="page">
      <div className="container stack-lg">
        <div className="page-head">
          <div>
            <h1>Boutique Hadrishop</h1>
            <p>
              {all.length} produit{all.length > 1 ? "s" : ""} au catalogue. Les
              quantités affichées sont les stocks réellement disponibles.
            </p>
          </div>
        </div>

        {/* Formulaire GET : la recherche et le tri fonctionnent sans JavaScript,
            et chaque état du catalogue a sa propre URL, partageable. */}
        <form className="card shop-filters" method="get">
          <div className="field" style={{ flex: "2 1 260px" }}>
            <label htmlFor="q">Rechercher un produit</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Ex. porte-clé, cuisine, support…"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="tri">Trier par</label>
            <select id="tri" name="tri" defaultValue={sort}>
              {Object.entries(SORT_OPTIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* La catégorie est pilotée par les puces ci-dessous : on la réinjecte
              pour qu'une recherche ne la fasse pas disparaître silencieusement. */}
          {selected ? <input type="hidden" name="categorie" value={selected} /> : null}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary">
              Rechercher
            </button>
            {hasFilters ? (
              <Link href="/boutique" className="btn btn-ghost">
                Réinitialiser
              </Link>
            ) : null}
          </div>
        </form>

        {categories.length > 0 ? (
          <nav className="btn-row" aria-label="Filtrer par catégorie">
            <Link
              href={buildHref(active, { categorie: undefined })}
              className={`btn btn-sm ${selected ? "btn-secondary" : "btn-primary"}`}
            >
              Tout
            </Link>
            {categories.map((category) => (
              <Link
                key={category}
                href={buildHref(active, { categorie: category })}
                className={`btn btn-sm ${
                  selected === category ? "btn-primary" : "btn-secondary"
                }`}
              >
                {category}
              </Link>
            ))}
          </nav>
        ) : null}

        {hasFilters ? (
          <p className="small muted" role="status">
            {visible.length} produit{visible.length > 1 ? "s" : ""} correspond
            {visible.length > 1 ? "ent" : ""} à votre recherche
            {query ? ` « ${query} »` : ""}
            {selected ? ` dans « ${selected} »` : ""}.
          </p>
        ) : null}

        {visible.length === 0 ? (
          <div className="empty-state">
            <h2>Aucun produit ne correspond</h2>
            <p>
              Essayez un autre mot-clé, ou parcourez le catalogue complet — il évolue
              régulièrement.
            </p>
            <Link href="/boutique" className="btn btn-secondary" style={{ marginTop: 12 }}>
              Voir tout le catalogue
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {visible.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={state.settings.currency}
                lowStockThreshold={state.settings.lowStockThreshold}
                rating={ratings.get(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
