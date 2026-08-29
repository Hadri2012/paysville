import { BikeEditor } from "@/components/admin/BikeEditor";
import { requireAdminPage } from "@/lib/adminGuard";
import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vélos" };

export default async function AdminBikesPage() {
  await requireAdminPage();
  const state = await readState();
  const normal = state.bikes.find((b) => b.kind === "normal");
  const electric = state.bikes.find((b) => b.kind === "electric");

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Vélos</h1>
          <p>Nom, description, photo, caractéristiques et disponibilité de chaque vélo.</p>
        </div>
      </div>

      <div className="detail-grid">
        {normal ? <BikeEditor bike={normal} /> : null}
        {electric ? <BikeEditor bike={electric} /> : null}
      </div>
    </div>
  );
}
