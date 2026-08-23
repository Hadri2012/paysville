import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { readState } from "@/lib/store";

/**
 * Le pied de page affiche l'e-mail de contact, réglable depuis l'administration :
 * ce layout lit donc la base à chaque rendu.
 *
 * D'où le rendu à la demande, imposé ici pour tout le groupe `(shop)`. Sans lui,
 * Next.js prérend au build les pages du groupe qui n'ont pas de données propres
 * (`/commande`, `/panier`, `/suivi`) — ce qui exige une base joignable pendant la
 * compilation, et fige au passage un réglage que l'admin peut changer ensuite.
 */
export const dynamic = "force-dynamic";

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
