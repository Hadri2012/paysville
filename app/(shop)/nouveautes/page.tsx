import type { Metadata } from "next";
import {
  CHANGELOG,
  CHANGE_KIND_BADGES,
  CHANGE_KIND_LABELS,
  changelogByDay,
  deployedVersion,
  formatChangeTime,
} from "@/lib/changelog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouveautés",
  description:
    "Ce qui a changé sur Hadrishop : nouvelles fonctionnalités, améliorations et correctifs, avec leur date et leur heure de mise en ligne.",
};

export default function ChangelogPage() {
  const days = changelogByDay(CHANGELOG);
  const version = deployedVersion();

  return (
    <main className="page">
      <div className="container page-narrow stack-lg">
        <div>
          <h1>Nouveautés</h1>
          <p className="muted">
            Tout ce qui change sur Hadrishop, du plus récent au plus ancien :
            nouvelles fonctionnalités, améliorations et correctifs. Les heures
            indiquées sont celles de Bruxelles.
          </p>
        </div>

        {days.map((day) => (
          <section className="card" key={day.key}>
            <h2 className="changelog-day">{day.label}</h2>
            <ol className="changelog">
              {day.entries.map((entry) => (
                <li className="changelog-entry" key={`${entry.at}-${entry.title}`}>
                  <div className="changelog-head">
                    <time className="changelog-time mono" dateTime={entry.at}>
                      {formatChangeTime(entry.at)}
                    </time>
                    <span className={`badge ${CHANGE_KIND_BADGES[entry.kind]}`}>
                      {CHANGE_KIND_LABELS[entry.kind]}
                    </span>
                  </div>
                  <strong className="changelog-title">{entry.title}</strong>
                  <p className="changelog-details">{entry.details}</p>
                  {entry.bullets ? (
                    <ul className="changelog-bullets">
                      {entry.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ))}

        {/* Repère technique : il dit quelle version du code répond réellement,
            ce que la seule lecture des nouveautés ne permet pas de savoir. */}
        <p className="small muted changelog-version">
          {version.local ? (
            <>Site lancé en local, hors déploiement.</>
          ) : version.commit ? (
            <>
              Version en ligne : <code className="mono">{version.commit}</code>
              {version.branch ? <> · branche {version.branch}</> : null}
            </>
          ) : (
            <>Version en ligne inconnue.</>
          )}
        </p>
      </div>
    </main>
  );
}
