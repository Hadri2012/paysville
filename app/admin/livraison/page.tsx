import { ShippingManager } from "@/components/admin/ShippingManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Livraison" };

export default async function AdminShippingPage() {
  await requireAdminPage();
  const state = await readState();

  return (
    <ShippingManager
      zones={state.shippingZones.map((zone) => ({
        id: zone.id,
        postalCode: zone.postalCode,
        cities: zone.cities,
        feeCents: zone.feeCents,
        active: zone.active,
      }))}
      settings={{
        defaultShippingFeeCents: state.settings.defaultShippingFeeCents,
        freeShippingThresholdCents: state.settings.freeShippingThresholdCents,
        reservationMinutes: state.settings.reservationMinutes,
        lowStockThreshold: state.settings.lowStockThreshold,
        currency: state.settings.currency,
      }}
    />
  );
}
