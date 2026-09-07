"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SHOP_MONOGRAM } from "@/lib/brand";

const LINKS = [
  { href: "/admin", label: "Tableau de bord", exact: true },
  { href: "/admin/commandes", label: "Commandes" },
  { href: "/admin/produits", label: "Produits" },
  { href: "/admin/stocks", label: "Stocks" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/avis", label: "Avis clients" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/livraison", label: "Livraison" },
  { href: "/admin/emails", label: "E-mails" },
  { href: "/admin/parametres", label: "Paramètres" },
];

export function AdminNav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="admin-side">
      <Link href="/admin" className="logo">
        <span className="logo-mark" aria-hidden="true">
          {SHOP_MONOGRAM}
        </span>
        Hadrishop
      </Link>

      <nav>
        {LINKS.map((link) => {
          const current = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        <div style={{ marginBottom: 8, wordBreak: "break-all" }}>{email}</div>
        <div className="btn-row">
          <Link href="/" className="btn btn-sm btn-secondary">
            Voir la boutique
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={logout}
            disabled={loading}
          >
            {loading ? "…" : "Déconnexion"}
          </button>
        </div>
      </div>
    </aside>
  );
}
