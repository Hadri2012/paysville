import { headers } from "next/headers";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { siteUrl } from "@/lib/http";
import { centsToInput } from "@/lib/money";
import { getStore, readState } from "@/lib/store";
import { isStripeConfigured, isWebhookConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export const metadata = { title: "Paramètres" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const state = await readState();
  const headerList = await headers();

  const resolvedUrl = siteUrl(
    new Request("http://placeholder.local", {
      headers: {
        host: headerList.get("host") ?? "",
        "x-forwarded-proto": headerList.get("x-forwarded-proto") ?? "",
      },
    }),
  );

  return (
    <SettingsManager
      initial={{
        contactEmail: state.settings.contactEmail,
        companyName: state.settings.legal.companyName,
        address: state.settings.legal.address,
        email: state.settings.legal.email,
        phone: state.settings.legal.phone,
        vatNumber: state.settings.legal.vatNumber,
        cashOnDeliveryEnabled: state.settings.cashOnDeliveryEnabled,
        cashOnDeliveryMax:
          state.settings.cashOnDeliveryMaxCents !== null
            ? centsToInput(state.settings.cashOnDeliveryMaxCents)
            : "",
      }}
      environment={{
        stripeConfigured: isStripeConfigured(),
        webhookConfigured: isWebhookConfigured(),
        driver: getStore().driver,
        siteUrl: resolvedUrl,
      }}
    />
  );
}
