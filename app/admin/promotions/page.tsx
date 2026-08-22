import { PromotionsManager } from "@/components/admin/PromotionsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Promotions" };

export default async function AdminPromotionsPage() {
  await requireAdminPage();
  const state = await readState();

  const promotions = [...state.promotions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((promotion) => ({
      id: promotion.id,
      code: promotion.code,
      active: promotion.active,
      type: promotion.type,
      value: promotion.value,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      minSubtotalCents: promotion.minSubtotalCents,
      maxUses: promotion.maxUses,
      uses: promotion.uses,
      archived: promotion.archived,
    }));

  return (
    <PromotionsManager promotions={promotions} currency={state.settings.currency} />
  );
}
