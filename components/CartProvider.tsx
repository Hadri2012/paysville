"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { applyAdditions, type CartAddition, type CartAdditionResult } from "@/lib/cart";

export interface CartItem {
  productId: string;
  quantity: number;
}

export type { CartAddition, CartAdditionResult } from "@/lib/cart";

interface CartContextValue {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  add: (productId: string, quantity?: number, label?: string, max?: number) => void;
  /** Ajoute plusieurs lignes d'un coup. Renvoie ce qui a réellement été ajouté. */
  addMany: (additions: CartAddition[]) => CartAdditionResult;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  notify: (message: string) => void;
}

const STORAGE_KEY = "hadrishop.cart.v1";
const MAX_QTY = 20;

const CartContext = createContext<CartContextValue | null>(null);

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CartItem =>
          Boolean(item) &&
          typeof item.productId === "string" &&
          Number.isFinite(item.quantity),
      )
      .map((item) => ({
        productId: item.productId,
        quantity: Math.min(MAX_QTY, Math.max(1, Math.trunc(item.quantity))),
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Le panier vit dans localStorage, indisponible au rendu serveur. La lecture
    // DOIT donc rester après le montage : l'anticiper produirait un rendu client
    // différent du rendu serveur (erreur d'hydratation React).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation avec un stockage externe
    setItems(readStorage());
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setItems(readStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* stockage indisponible (navigation privée) : le panier reste en mémoire */
    }
  }, [items, hydrated]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const add = useCallback(
    (productId: string, quantity = 1, label?: string, max?: number) => {
      // `max` (le stock disponible) borne le total obtenu, pas seulement la quantité
      // ajoutée : sans ça, ajouter par petites touches permettrait de dépasser le
      // stock réel avant même que le serveur ne recalcule le panier.
      const cap = max === undefined ? MAX_QTY : Math.min(MAX_QTY, Math.max(0, max));
      let blocked = false;
      setItems((current) => {
        const existing = current.find((item) => item.productId === productId);
        if (existing) {
          if (existing.quantity >= cap) {
            blocked = true;
            return current;
          }
          return current.map((item) =>
            item.productId === productId
              ? { ...item, quantity: Math.min(cap, item.quantity + quantity) }
              : item,
          );
        }
        if (cap <= 0) {
          blocked = true;
          return current;
        }
        return [...current, { productId, quantity: Math.min(cap, quantity) }];
      });
      if (blocked) {
        notify("Quantité maximale déjà atteinte dans le panier");
      } else {
        notify(label ? `« ${label} » ajouté au panier` : "Produit ajouté au panier");
      }
    },
    [notify],
  );

  /**
   * Ajout groupé, pour reprendre une commande entière en un clic.
   *
   * Répéter `add()` produirait un message par article, chacun masquant le
   * précédent : le client lirait « X ajouté au panier » pour une commande de
   * quatre lignes. Ici le calcul est fait d'un bloc, sur l'état courant, et
   * c'est l'appelant qui annonce le résultat — lui seul sait ce qui a été
   * écarté, et pourquoi.
   */
  const addMany = useCallback(
    (additions: CartAddition[]): CartAdditionResult => {
      const result = applyAdditions(items, additions, MAX_QTY);
      if (result.added > 0) setItems(result.items);
      return result;
    },
    [items],
  );

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) => {
      if (quantity <= 0) return current.filter((item) => item.productId !== productId);
      return current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(MAX_QTY, quantity) }
          : item,
      );
    });
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    // Écriture immédiate, indépendante de l'effet d'hydratation : sur un
    // chargement de page complet (la redirection Stripe après paiement en est
    // un), React monte les enfants avant le parent — `ClearCartOnMount`
    // s'exécute donc avant l'effet d'hydratation de ce fournisseur, qui
    // écraserait sinon un panier vidé mais pas encore persisté en relisant
    // l'ancien contenu de `localStorage`.
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, "[]");
      } catch {
        /* stockage indisponible (navigation privée) */
      }
    }
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      hydrated,
      add,
      addMany,
      setQuantity,
      remove,
      clear,
      notify,
    }),
    [items, hydrated, add, addMany, setQuantity, remove, clear, notify],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      ) : null}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart doit être utilisé dans <CartProvider>");
  return context;
}
