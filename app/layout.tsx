import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/components/CartProvider";
import { FavoritesProvider } from "@/components/FavoritesProvider";
import { SetupNotice } from "@/components/SetupNotice";
import { storeConfigurationError } from "@/lib/store";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Hadrishop — petite boutique d'objets utiles",
    template: "%s · Hadrishop",
  },
  description:
    "Hadrishop, la petite boutique en ligne d'objets utiles imprimés en 3D. Paiement sécurisé par Stripe, livraison locale.",
  applicationName: "Hadrishop",
  robots: { index: true, follow: true },
};

/**
 * Le défaut de configuration est intercepté ici, au-dessus de `app/error.tsx` :
 * une page qui lance l'erreur elle-même est rattrapée par la frontière d'erreur,
 * qui ne peut afficher qu'un message générique. Vu d'ici, on sait quoi dire.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const configurationProblem = storeConfigurationError();
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {configurationProblem ? (
          <SetupNotice reason={configurationProblem} />
        ) : (
          <CartProvider>
            <FavoritesProvider>{children}</FavoritesProvider>
          </CartProvider>
        )}
      </body>
    </html>
  );
}
