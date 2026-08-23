import { ReviewsManager, type AdminReviewRow } from "@/components/admin/ReviewsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Avis clients" };

export default async function AdminReviewsPage() {
  await requireAdminPage();
  const state = await readState();

  const products = new Map(state.products.map((p) => [p.id, p]));

  // Deux files demandent une action : les avis signalés par des visiteurs — qui
  // sont toujours en ligne tant que la boutique n'a pas tranché, donc les plus
  // urgents — puis ceux que le filtre a marqués comme spam.
  const rows: AdminReviewRow[] = [...state.reviews]
    .sort(
      (a, b) =>
        b.reports - a.reports ||
        Number(b.flagged) - Number(a.flagged) ||
        b.createdAt.localeCompare(a.createdAt),
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
        photos: review.photos,
        reports: review.reports,
        createdAt: review.createdAt,
      };
    });

  const flagged = rows.filter((row) => row.flagged).length;
  const unanswered = rows.filter((row) => !row.flagged && !row.reply).length;
  const reported = rows.filter((row) => row.reports > 0).length;

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
          {reported > 0 ? (
            <div className="alert alert-warning" role="status">
              <span>
                {reported} avis {reported > 1 ? "ont" : "a"} été signalé
                {reported > 1 ? "s" : ""} par des visiteurs et {reported > 1 ? "restent" : "reste"}{" "}
                en ligne : {reported > 1 ? "ils apparaissent" : "il apparaît"} en tête de
                liste. À vous de décider.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <ReviewsManager reviews={rows} />
    </div>
  );
}
