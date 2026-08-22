"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Liste de souhaits. Comme le panier, elle vit dans `localStorage` : pas de compte
 * client à créer, rien à stocker côté serveur, et la liste suit le visiteur d'une
 * visite à l'autre sur le même navigateur.
 */

interface FavoritesContextValue {
  ids: string[];
  count: number;
  hydrated: boolean;
  has: (productId: string) => boolean;
  toggle: (productId: string) => boolean;
  remove: (productId: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "hadrishop.favorites.v1";
const MAX_FAVORITES = 200;

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function readStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // `localStorage` n'existe pas au rendu serveur : lire avant le montage
    // produirait un rendu client différent (erreur d'hydratation React).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec un stockage externe
    setIds(readStorage());
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setIds(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* stockage indisponible (navigation privée) : la liste reste en mémoire */
    }
  }, [ids, hydrated]);

  /**
   * Renvoie l'état APRÈS bascule, pour que l'appelant affiche le bon message.
   *
   * La valeur est déduite de `ids` (l'état rendu), pas d'une variable modifiée
   * dans l'updater : React n'exécute pas forcément l'updater de façon synchrone,
   * et lire une variable qu'il aurait mutée renvoie une réponse fausse dès qu'une
   * mise à jour est déjà en file. L'updater reste donc une fonction pure.
   */
  const toggle = useCallback(
    (productId: string): boolean => {
      const nowFavorite = !ids.includes(productId);
      setIds((current) =>
        current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [productId, ...current].slice(0, MAX_FAVORITES),
      );
      return nowFavorite;
    },
    [ids],
  );

  const remove = useCallback((productId: string) => {
    setIds((current) => current.filter((id) => id !== productId));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  const value = useMemo<FavoritesContextValue>(
    () => ({
      ids,
      count: ids.length,
      hydrated,
      has: (productId: string) => ids.includes(productId),
      toggle,
      remove,
      clear,
    }),
    [ids, hydrated, toggle, remove, clear],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error("useFavorites doit être utilisé dans <FavoritesProvider>");
  return context;
}
