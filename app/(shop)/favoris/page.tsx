import type { Metadata } from "next";
import { FavoritesView } from "@/components/FavoritesView";
import { reviewSummaries } from "@/lib/reviews";
import { listPublicProducts } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes favoris",
  description: "Les produits Hadrishop que vous avez mis de côté.",
  robots: { index: false, follow: true },
};

/**
 * La liste des favoris vit dans le navigateur : le serveur envoie donc tout le
 * catalogue (il est petit et déjà public) et le filtrage se fait côté client.
 */
export default async function FavoritesPage() {
  const state = await readState();
  const ratings = reviewSummaries(state);

  return (
    <FavoritesView
      products={listPublicProducts(state)}
      currency={state.settings.currency}
      lowStockThreshold={state.settings.lowStockThreshold}
      ratings={Object.fromEntries(ratings)}
    />
  );
}
