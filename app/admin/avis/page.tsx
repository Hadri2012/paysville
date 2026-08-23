import { ReviewsManager, type AdminReviewRow } from "@/components/admin/ReviewsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Avis clients" };

export default async function AdminReviewsPage() {
  await requireAdminPage();
  const state = await readState();

  const products = new Map(state.products.map((p) => [p.id, p]));

  // Les avis marqués comme spam d'abord : c'est la seule file qui demande une action.
  const rows: AdminReviewRow[] = [...state.reviews]
    .sort(
      (a, b) =>
        Number(b.flagged) - Number(a.flagged) || b.createdAt.localeCompare(a.createdAt),
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
        flagged: review.flagged,
        verified: review.verified,
        reply: review.reply,
        helpfulYes: review.helpfulYes,
        helpfulNo: review.helpfulNo,
        createdAt: review.createdAt,
      };
    });

  const flagged = rows.filter((row) => row.flagged).length;
  const unanswered = rows.filter((row) => !row.flagged && !row.reply).length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Avis clients</h1>
          <p>
            {rows.length} avis au total
            {flagged > 0
              ? ` — ${flagged} marqué${flagged > 1 ? "s" : ""} comme spam`
              : " — aucun spam détecté"}
            {unanswered > 0
              ? `, ${unanswered} sans réponse de votre part.`
              : rows.length > 0
                ? ", tous ont reçu une réponse."
                : "."}{" "}
            Les avis sont publiés immédiatement, mais ceux soupçonnés de spam sont marqués.
            Votre réponse apparaît sous l&apos;avis, sur la fiche produit.
          </p>
        </div>
      </div>

      <ReviewsManager reviews={rows} />
    </div>
  );
}
