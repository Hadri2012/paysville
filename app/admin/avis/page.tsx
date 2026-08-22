import { ReviewsManager, type AdminReviewRow } from "@/components/admin/ReviewsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Avis clients" };

export default async function AdminReviewsPage() {
  await requireAdminPage();
  const state = await readState();

  const products = new Map(state.products.map((p) => [p.id, p]));

  // Les avis en attente d'abord : c'est la seule file qui demande une action.
  const rows: AdminReviewRow[] = [...state.reviews]
    .sort(
      (a, b) =>
        Number(a.approved) - Number(b.approved) || b.createdAt.localeCompare(a.createdAt),
    )
    .map((review) => {
      const product = products.get(review.productId);
      return {
        id: review.id,
        productName: product?.name ?? "Produit supprimé",
        productSlug: product?.slug ?? "",
        author: review.author,
        rating: review.rating,
        comment: review.comment,
        approved: review.approved,
        createdAt: review.createdAt,
      };
    });

  const pending = rows.filter((row) => !row.approved).length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Avis clients</h1>
          <p>
            {rows.length} avis au total
            {pending > 0
              ? ` — ${pending} en attente de validation.`
              : " — rien en attente."}{" "}
            Un avis n&apos;apparaît sur la boutique qu&apos;une fois publié.
          </p>
        </div>
      </div>

      <ReviewsManager reviews={rows} />
    </div>
  );
}
