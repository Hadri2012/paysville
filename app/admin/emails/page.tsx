import { EmailPreview } from "@/components/admin/EmailPreview";
import { requireAdminPage } from "@/lib/adminGuard";
import { isEmailConfigured } from "@/lib/email/transport";

export const dynamic = "force-dynamic";

export const metadata = { title: "E-mails" };

export default async function AdminEmailsPage() {
  await requireAdminPage();
  return <EmailPreview configured={isEmailConfigured()} />;
}
