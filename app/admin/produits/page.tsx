import { ProductsManager, type AdminProductRow } from "@/components/admin/ProductsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { productImage } from "@/lib/images";
import { availableStock } from "@/lib/shop";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produits" };

export default async function AdminProductsPage() {
  await requireAdminPage();
  const state = await readState();

  const products: AdminProductRow[] = [...state.products]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"))
    .map((product) => ({
      id: product.id,
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      stock: product.stock,
      available: availableStock(state, product),
      imageUrl: product.imageUrl,
      resolvedImageUrl: productImage(product),
      category: product.category,
      sortOrder: product.sortOrder,
      active: product.active,
      archived: product.archived,
      kind: product.kind,
      digitalFiles: product.digitalFiles.map((file) => ({
        id: file.id,
        name: file.name,
        sizeBytes: file.sizeBytes,
      })),
      model3d: product.model3d
        ? {
            id: product.model3d.id,
            name: product.model3d.name,
            sizeBytes: product.model3d.sizeBytes,
          }
        : null,
      colors: product.colors,
    }));

  return (
    <ProductsManager
      products={products}
      currency={state.settings.currency}
      lowStockThreshold={state.settings.lowStockThreshold}
    />
  );
}
