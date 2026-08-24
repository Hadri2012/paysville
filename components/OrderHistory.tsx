"use client";

import { useMemo, useState } from "react";
import { isReorderable, type OrderHistoryEntry } from "@/lib/history";
import { formatPrice } from "@/lib/money";
import { normalizeLoose, normalizeSearch } from "@/lib/validation";
import type { OrderStatus } from "@/lib/types";
import { useCart } from "./CartProvider";
import { StatusBadge } from "./OrderDetails";

/**
 * Historique des commandes d'un client, avec filtres et reprise de commande.
 *
 * Les filtres s'appliquent dans le navigateur, sans rappeler le serveur : la
 * liste est celle d'une seule personne, donc courte, et un filtre qui répond au
 * caractère près vaut mieux qu'un aller-retour réseau par frappe.
 */

/**
 * Regroupements proposés au filtre. Les huit statuts internes sont un détail de
 * gestion ; côté client, seules trois questions se posent — est-ce en route,
 * est-ce arrivé, est-ce annulé.
 */
const STATUS_GROUPS = {
  toutes: "Toutes",
  "en-cours": "En cours",
  livrees: "Livrées",
  annulees: "Annulées",
} as const;

type StatusGroup = keyof typeof STATUS_GROUPS;

const GROUP_STATUSES: Record<Exclude<StatusGroup, "toutes">, OrderStatus[]> = {
  "en-cours": ["awaiting_payment", "paid", "preparing", "ready", "shipped"],
  livrees: ["delivered"],
  annulees: ["canceled", "refunded"],
};

const SORTS = {
  recentes: "Plus récentes",
  anciennes: "Plus anciennes",
  montant: "Montant décroissant",
} as const;

type SortKey = keyof typeof SORTS;

/**
 * En dessous, la barre de filtres encombre plus qu'elle ne sert : chercher ou
 * trier deux lignes qu'on voit déjà en entier n'apporte rien.
 */
const FILTERS_FROM = 3;

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Brussels",
  });
}

/** « 2 articles », « 1 article ». */
function itemCountLabel(count: number): string {
  return `${count} article${count > 1 ? "s" : ""}`;
}

/**
 * Une commande correspond-elle à la recherche ?
 *
 * Deux normalisations plutôt qu'une : le numéro est comparé sans séparateur
 * (`normalizeLoose`), pour que « HAD2026 » retrouve `HAD-2026-000001` ; les noms
 * d'articles gardent leurs espaces (`normalizeSearch`), pour qu'un mot isolé
 * reste retrouvable au milieu d'un libellé.
 */
function matchesQuery(entry: OrderHistoryEntry, query: string): boolean {
  const loose = normalizeLoose(query);
  const search = normalizeSearch(query);
  if (!loose && !search) return true;

  if (loose && normalizeLoose(entry.number).includes(loose)) return true;
  if (!search) return false;

  const names = normalizeSearch(entry.items.map((item) => item.name).join(" "));
  return names.includes(search);
}

function OrderRow({
  entry,
  current,
  busy,
  onOpen,
}: {
  entry: OrderHistoryEntry;
  current: boolean;
  busy: boolean;
  onOpen: (number: string) => void;
}) {
  const { addMany, notify } = useCart();

  const reorder = () => {
    const takeable = entry.items.filter(isReorderable);
    const owned = entry.items.filter((item) => item.alreadyOwned).length;
    const gone = entry.items.filter(
      (item) => !item.alreadyOwned && item.available === 0,
    ).length;

    const { added, capped } = addMany(
      takeable.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        max: item.available,
      })),
    );

    // Ce qui n'a pas suivi doit être dit : reprendre une commande sans retrouver
    // ce qu'elle contenait, sans savoir pourquoi, laisserait le client croire à
    // une erreur du panier.
    const notes: string[] = [];
    if (capped > 0) notes.push("quantité limitée au stock disponible");
    if (gone > 0) notes.push(`${gone} article${gone > 1 ? "s" : ""} indisponible${gone > 1 ? "s" : ""}`);
    if (owned > 0) {
      notes.push(
        `${owned} fichier${owned > 1 ? "s" : ""} déjà téléchargeable${owned > 1 ? "s" : ""}`,
      );
    }
    const suffix = notes.length > 0 ? ` · ${notes.join(", ")}` : "";

    if (added === 0) {
      notify(`Rien à ajouter${suffix}`);
      return;
    }
    notify(
      `${added} article${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} au panier${suffix}`,
    );
  };

  return (
    <li className={`history-row${current ? " history-row-current" : ""}`}>
      <div className="history-row-head">
        <div>
          <span className="mono history-number">{entry.number}</span>
          {current ? (
            <span className="badge badge-info" style={{ marginLeft: 8 }}>
              Affichée
            </span>
          ) : null}
          <div className="small muted">
            {formatDay(entry.createdAt)} · {itemCountLabel(entry.itemCount)}
          </div>
        </div>
        <div className="history-row-right">
          <StatusBadge status={entry.status} />
          <strong>{formatPrice(entry.totalCents, entry.currency)}</strong>
        </div>
      </div>

      <p className="small muted history-items">
        {entry.items.map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", ")}
      </p>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpen(entry.number)}
          disabled={busy || current}
        >
          {busy ? (
            <>
              <span className="spinner spinner-dark" aria-hidden="true" /> Ouverture…
            </>
          ) : current ? (
            "Détail affiché"
          ) : (
            "Voir le détail"
          )}
        </button>
        {entry.canReorder ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={reorder}>
            ↻ Recommander
          </button>
        ) : (
          <span className="small muted">Plus recommandable</span>
        )}
      </div>
    </li>
  );
}

export function OrderHistory({
  entries,
  currentNumber,
  loadingNumber,
  onOpen,
}: {
  entries: OrderHistoryEntry[];
  /** Commande dont le détail est affiché sous la liste. */
  currentNumber: string | null;
  /** Commande en cours de chargement, pour n'occuper qu'un bouton à la fois. */
  loadingNumber: string | null;
  onOpen: (number: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<StatusGroup>("toutes");
  const [sort, setSort] = useState<SortKey>("recentes");
  const showFilters = entries.length >= FILTERS_FROM;

  const visible = useMemo(() => {
    const filtered = entries.filter((entry) => {
      if (group !== "toutes" && !GROUP_STATUSES[group].includes(entry.status)) {
        return false;
      }
      return matchesQuery(entry, query);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "montant") return b.totalCents - a.totalCents;
      if (sort === "anciennes") return a.createdAt.localeCompare(b.createdAt);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [entries, group, query, sort]);

  return (
    <section className="card stack">
      <div>
        <h3 className="card-title" style={{ marginBottom: 4 }}>
          Mes commandes
        </h3>
        <p className="small muted" style={{ margin: 0 }}>
          {entries.length === 1
            ? "Une seule commande passée avec cette adresse e-mail."
            : `Les ${entries.length} commandes passées avec cette adresse e-mail.`}
        </p>
      </div>

      {showFilters ? (
      <div className="shop-filters">
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="history-query">Rechercher</label>
          <input
            id="history-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Numéro ou nom d'article"
          />
        </div>
        <div className="field" style={{ flex: "1 1 150px" }}>
          <label htmlFor="history-group">Statut</label>
          <select
            id="history-group"
            value={group}
            onChange={(event) => setGroup(event.target.value as StatusGroup)}
          >
            {Object.entries(STATUS_GROUPS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 170px" }}>
          <label htmlFor="history-sort">Trier par</label>
          <select
            id="history-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {Object.entries(SORTS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Aucune commande ne correspond à cette recherche.
        </p>
      ) : (
        <ul className="history-list">
          {visible.map((entry) => (
            <OrderRow
              key={entry.number}
              entry={entry}
              current={entry.number === currentNumber}
              busy={entry.number === loadingNumber}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
