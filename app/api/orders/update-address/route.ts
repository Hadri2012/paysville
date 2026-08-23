import { errors } from "@/lib/errors";
import { handle, jsonOk, limit, readJson } from "@/lib/http";
import { findOrderByNumber, publicOrderView } from "@/lib/orders";
import { resolveShipping } from "@/lib/shop";
import { readState, transaction } from "@/lib/store";
import { cleanString, parseCheckoutIdentity } from "@/lib/validation";
import type { OrderAddress } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Met à jour l'adresse de livraison d'une commande non expédiée.
 * Authentification : numéro de commande + adresse e-mail du client.
 */
export async function POST(request: Request) {
  return handle(async () => {
    limit(request, "update-address", 10, 60_000);
    const body = await readJson(request);

    const number = cleanString(body.number, 40);
    const email = cleanString(body.email, 160).toLowerCase();
    if (!number || !email) throw errors.orderNotFound();

    const updatedOrder = await transaction((state) => {
      const order = findOrderByNumber(state, number);
      if (!order || order.customer.email.toLowerCase() !== email) {
        throw errors.orderNotFound();
      }

      // Seules les commandes non expédiées peuvent avoir leur adresse modifiée.
      const editableStatuses = ["awaiting_payment", "paid", "preparing", "ready"];
      if (!editableStatuses.includes(order.status)) {
        throw errors.orderNotEditable();
      }

      // Une commande entièrement composée de fichiers n'a rien à expédier : même
      // règle qu'au checkout, l'adresse y sert seulement de facturation.
      const digitalOnly =
        order.items.length > 0 && order.items.every((item) => item.kind === "digital");

      // Valide l'adresse de la même façon que lors du checkout.
      const parsed = parseCheckoutIdentity(
        {
          firstName: order.customer.firstName,
          lastName: order.customer.lastName,
          email: order.customer.email,
          phone: order.customer.phone,
          street: body.street,
          streetNumber: body.streetNumber,
          complement: body.complement,
          postalCode: body.postalCode,
          city: body.city,
          country: body.country,
        },
        { requireAddress: !digitalOnly },
      );

      const newAddress: OrderAddress = {
        street: parsed.address.street,
        streetNumber: parsed.address.streetNumber,
        complement: parsed.address.complement,
        postalCode: parsed.address.postalCode,
        city: parsed.address.city,
        country: parsed.address.country,
      };

      // La nouvelle adresse doit rester desservie, et à un tarif de livraison
      // identique à celui déjà payé — sinon la commande finirait avec une adresse
      // non livrable, ou des frais de port qui ne correspondent plus à ce qui a
      // été réglé (voir `resolveShipping`, la même règle qu'au checkout).
      if (!digitalOnly) {
        const shipping = resolveShipping(state, newAddress.postalCode, newAddress.city);
        if (!shipping.covered) throw errors.shippingNotCovered();
        if (shipping.feeCents !== order.shippingCents) throw errors.shippingFeeChanged();
      }

      order.address = newAddress;
      order.updatedAt = new Date().toISOString();
      return order;
    });

    // Avec l'état, la vue reconstruit les liens de téléchargement : sans lui, une
    // commande de fichiers déjà payée semblait perdre l'accès à ses fichiers après
    // la simple correction d'une adresse.
    return jsonOk({ order: publicOrderView(updatedOrder, await readState()) });
  });
}
