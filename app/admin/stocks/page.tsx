import { StockManager, type StockRow } from "@/components/admin/StockManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { availableStock, reservedQuantity } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stocks" };

export default async function AdminStockPage() {
  await requireAdminPage();
  const state = await readState();

  // Les produits numériques n'ont pas de stock à gérer : cette page ne leur
  // proposerait qu'un compteur sans effet.
  const rows: StockRow[] = state.products
    .filter((product) => !product.archived && product.kind !== "digital")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"))
    .map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      stock: product.stock,
      available: availableStock(state, product),
      reserved: reservedQuantity(state, product.id),
      active: product.active,
    }));

  return <StockManager rows={rows} lowStockThreshold={state.settings.lowStockThreshold} />;
}
