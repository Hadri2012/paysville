import { StockManager, type StockRow } from "@/components/admin/StockManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { availableStock, reservedQuantity } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Stocks" };

export default async function AdminStockPage() {
  await requireAdminPage();
  const state = await readState();

  const rows: StockRow[] = state.products
    .filter((product) => !product.archived)
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
