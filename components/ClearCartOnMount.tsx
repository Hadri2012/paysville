"use client";

import { useEffect } from "react";
import { useCart } from "./CartProvider";
import { storePromo } from "@/lib/clientPromo";

/** Vide le panier local une fois le paiement confirmé par le serveur. */
export function ClearCartOnMount() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
    storePromo("");
  }, [clear]);
  return null;
}
