import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { readState } from "@/lib/store";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await readState();
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter contactEmail={state.settings.contactEmail || undefined} />
    </>
  );
}
