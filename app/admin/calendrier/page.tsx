import Link from "next/link";
import { requireAdminPage } from "@/lib/adminGuard";
import { nowBrusselsString } from "@/lib/datetime";
import { readState } from "@/lib/store";
import type { RentalRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Calendrier" };

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Un accepte occupe-t-il ce jour (comparaison sur la seule date, bornes incluses) ? */
function occupiesDay(request: RentalRequest, day: string): boolean {
  return day >= request.startAt.slice(0, 10) && day <= request.endAt.slice(0, 10);
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdminPage();
  const { month } = await searchParams;
  const now = nowBrusselsString();

  let year = Number(now.slice(0, 4));
  let monthIndex = Number(now.slice(5, 7)) - 1;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    year = Number(month.slice(0, 4));
    monthIndex = Number(month.slice(5, 7)) - 1;
  }

  const state = await readState();
  const accepted = state.requests.filter((r) => r.status === "accepted");

  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  // Lundi = 0 ... Dimanche = 6
  const startWeekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells: { date: string; dayOfMonth: number; inMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayOffset = i - startWeekday + 1;
    const cellDate = new Date(Date.UTC(year, monthIndex, dayOffset));
    cells.push({
      date: dayStr(cellDate.getUTCFullYear(), cellDate.getUTCMonth(), cellDate.getUTCDate()),
      dayOfMonth: cellDate.getUTCDate(),
      inMonth: cellDate.getUTCMonth() === monthIndex,
    });
  }

  const prevMonth = monthIndex === 0 ? `${year - 1}-12` : `${year}-${pad(monthIndex)}`;
  const nextMonth = monthIndex === 11 ? `${year + 1}-01` : `${year}-${pad(monthIndex + 2)}`;
  const today = now.slice(0, 10);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Calendrier des locations</h1>
          <p>Locations acceptées, par vélo.</p>
        </div>
      </div>

      <div className="calendar-toolbar">
        <div className="btn-row">
          <Link href={`/admin/calendrier?month=${prevMonth}`} className="btn btn-secondary btn-sm">
            ← Précédent
          </Link>
          <strong style={{ alignSelf: "center", fontSize: "1.1rem" }}>
            {MONTH_NAMES[monthIndex]} {year}
          </strong>
          <Link href={`/admin/calendrier?month=${nextMonth}`} className="btn btn-secondary btn-sm">
            Suivant →
          </Link>
        </div>
        <div className="calendar-legend">
          <span>
            <span className="dot dot-normal" /> Vélo normal
          </span>
          <span>
            <span className="dot dot-electric" /> Vélo électrique
          </span>
        </div>
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {cells.map((cell) => {
          const entries = accepted.filter((r) => occupiesDay(r, cell.date));
          return (
            <div
              key={cell.date}
              className={`calendar-cell${cell.inMonth ? "" : " is-outside"}${
                cell.date === today ? " is-today" : ""
              }`}
            >
              <span className="day-num">{cell.dayOfMonth}</span>
              {entries.map((r) => (
                <Link
                  key={r.id}
                  href={`/admin/demandes/${r.id}`}
                  className={`calendar-entry calendar-entry-${r.bikeKind}`}
                  title={`${r.customer.firstName} ${r.customer.lastName} — ${r.bikeKind === "normal" ? "Vélo normal" : "Vélo électrique"}`}
                >
                  {r.customer.firstName} {r.customer.lastName}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
