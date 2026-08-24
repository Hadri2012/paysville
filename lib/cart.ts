/**
 * Calcul d'un ajout groupé au panier (« Recommander »).
 *
 * Isolé du composant qui l'utilise (`components/CartProvider.tsx`) parce que
 * c'est la partie qui se trompe : plafonner au stock, distinguer les
 * exemplaires réellement ajoutés des lignes traitées, et repérer celles qui
 * n'ont pas pu prendre toute la quantité demandée. Une fonction pure se vérifie
 * dans `npm run selftest`, un état React non.
 */

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartAddition {
  productId: string;
  quantity: number;
  /** Stock disponible : borne le total obtenu, panier compris. */
  max?: number;
}

export interface CartAdditionResult {
  /** Le panier après ajout. Inchangé (même tableau logique) si rien n'a pu entrer. */
  items: CartLine[];
  /**
   * Exemplaires réellement ajoutés — et non lignes traitées : reprendre une
   * commande de deux exemplaires dont un seul reste en stock ajoute un
   * exemplaire, et l'annoncer autrement tromperait le client.
   */
  added: number;
  /** Lignes qui n'ont pas pu prendre toute la quantité demandée (stock atteint). */
  capped: number;
}

/**
 * Applique des ajouts à un panier, sans le modifier sur place.
 *
 * Le plafond de chaque ligne porte sur le total obtenu, panier compris — même
 * règle que l'ajout à l'unité : sans cela, reprendre deux fois la même commande
 * dépasserait le stock réel avant même que le serveur ne recalcule le panier.
 */
export function applyAdditions(
  items: CartLine[],
  additions: CartAddition[],
  maxPerLine: number,
): CartAdditionResult {
  const next = items.map((item) => ({ ...item }));
  let added = 0;
  let capped = 0;

  for (const addition of additions) {
    const cap =
      addition.max === undefined
        ? maxPerLine
        : Math.min(maxPerLine, Math.max(0, addition.max));
    const existing = next.find((item) => item.productId === addition.productId);
    const before = existing?.quantity ?? 0;
    const wanted = before + addition.quantity;
    const target = Math.min(cap, wanted);

    if (target < wanted) capped += 1;
    if (target <= before) continue;

    if (existing) existing.quantity = target;
    else next.push({ productId: addition.productId, quantity: target });
    added += target - before;
  }

  return { items: added > 0 ? next : items, added, capped };
}
