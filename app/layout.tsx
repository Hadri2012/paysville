import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "VéloLoc — location de vélos",
    template: "%s · VéloLoc",
  },
  description:
    "Demandez la location d'un vélo normal ou d'un vélo électrique. Aucun paiement en ligne : votre demande est étudiée puis acceptée ou refusée par le propriétaire.",
  applicationName: "VéloLoc",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
