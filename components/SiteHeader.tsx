"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "./CartProvider";

const LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/boutique", label: "Boutique" },
  { href: "/livraison", label: "Livraison" },
  { href: "/suivi", label: "Suivi de commande" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { count, hydrated } = useCart();
  const [open, setOpen] = useState(false);

  // Le menu mobile se referme à chaque navigation. Ajustement pendant le rendu
  // (et non dans un effet) : React ré-exécute le rendu sans passe d'affichage
  // intermédiaire, donc pas de cascade de rendus.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="Hadrishop — accueil">
          <span className="logo-mark" aria-hidden="true">
            HS
          </span>
          Hadrishop
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav id="main-nav" className={`main-nav${open ? " open" : ""}`}>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/panier" className="cart-link" aria-current={isCurrent("/panier") ? "page" : undefined}>
            <span aria-hidden="true">🛒</span>
            Panier
            <span className="cart-count" aria-hidden={!hydrated}>
              {hydrated ? count : 0}
            </span>
            <span className="sr-only" style={{ position: "absolute", left: "-9999px" }}>
              {hydrated ? `${count} article${count > 1 ? "s" : ""} dans le panier` : ""}
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
