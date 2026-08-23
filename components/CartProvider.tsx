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

export interface CartItem {
  productId: string;
  /** Couleur choisie, si le produit en propose. `null` sinon. */
  colorId: string | null;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  hydrated: boolean;
  add: (
    productId: string,
    quantity?: number,
    label?: string,
    max?: number,
    colorId?: string | null,
  ) => void;
  setQuantity: (productId: string, quantity: number, colorId?: string | null) => void;
  remove: (productId: string, colorId?: string | null) => void;
  clear: () => void;
  notify: (message: string) => void;
}

const STORAGE_KEY = "hadrishop.cart.v1";
const MAX_QTY = 20;

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Même produit, couleur différente : deux lignes distinctes. On veut pouvoir
 * mettre un exemplaire noir et un blanc dans la même commande sans que l'un
 * n'écrase l'autre.
 */
function sameLine(a: { productId: string; colorId: string | null }, b: { productId: string; colorId: string | null }): boolean {
  return a.productId === b.productId && (a.colorId ?? null) === (b.colorId ?? null);
}

function readStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { productId: string; colorId?: unknown; quantity: number } =>
          Boolean(item) &&
          typeof item.productId === "string" &&
          Number.isFinite(item.quantity),
      )
      .map((item) => ({
        productId: item.productId,
        // Panier enregistré avant l'existence des couleurs : traité comme
        // « sans couleur », ce qu'il était déjà de fait.
        colorId: typeof item.colorId === "string" ? item.colorId : null,
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
    (
      productId: string,
      quantity = 1,
      label?: string,
      max?: number,
      colorId: string | null = null,
    ) => {
      // `max` (le stock disponible) borne le total obtenu, pas seulement la quantité
      // ajoutée : sans ça, ajouter par petites touches permettrait de dépasser le
      // stock réel avant même que le serveur ne recalcule le panier.
      const cap = max === undefined ? MAX_QTY : Math.min(MAX_QTY, Math.max(0, max));
      const line = { productId, colorId };
      let blocked = false;
      setItems((current) => {
        const existing = current.find((item) => sameLine(item, line));
        if (existing) {
          if (existing.quantity >= cap) {
            blocked = true;
            return current;
          }
          return current.map((item) =>
            sameLine(item, line)
              ? { ...item, quantity: Math.min(cap, item.quantity + quantity) }
              : item,
          );
        }
        if (cap <= 0) {
          blocked = true;
          return current;
        }
        return [...current, { productId, colorId, quantity: Math.min(cap, quantity) }];
      });
      if (blocked) {
        notify("Quantité maximale déjà atteinte dans le panier");
      } else {
        notify(label ? `« ${label} » ajouté au panier` : "Produit ajouté au panier");
      }
    },
    [notify],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number, colorId: string | null = null) => {
      const line = { productId, colorId };
      setItems((current) => {
        if (quantity <= 0) return current.filter((item) => !sameLine(item, line));
        return current.map((item) =>
          sameLine(item, line) ? { ...item, quantity: Math.min(MAX_QTY, quantity) } : item,
        );
      });
    },
    [],
  );

  const remove = useCallback((productId: string, colorId: string | null = null) => {
    const line = { productId, colorId };
    setItems((current) => current.filter((item) => !sameLine(item, line)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      hydrated,
      add,
      setQuantity,
      remove,
      clear,
      notify,
    }),
    [items, hydrated, add, setQuantity, remove, clear, notify],
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
