import { redirect } from "next/navigation";
import { getCurrentAdmin, type AdminIdentity } from "./auth";

/** Garde d'accès des pages /admin : redirige vers la connexion si la session est absente. */
export async function requireAdminPage(): Promise<AdminIdentity> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
