import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s · Admin VéloLoc" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return (
      <main className="page">
        <div className="container page-narrow">{children}</div>
      </main>
    );
  }

  return (
    <div className="admin-shell">
      <AdminNav email={admin.email} />
      <main className="admin-main">{children}</main>
    </div>
  );
}
