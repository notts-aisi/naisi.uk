import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./SurveysViews.module.css";

/**
 * THE VIEWS OF A PROGRAMME'S SURVEYS TAB, and the row they sit in.
 *
 * Six, in the order a programme meets them: the Overview the tab opens on;
 * Before, the survey before it; Check-ins, each week's check-ins at the end of
 * its sessions; Facilitators' reports, the session reports, on a page of their
 * own because they name people; End, the survey at the end and the survey
 * about leaving, with Ratings and the anonymous form's answers; and Follow-ups,
 * at 6 and 12 months. Each is its own address under the tab, so a view is a
 * link and the one on screen says so (`aria-current`); a survey's own results
 * page draws the row with its stage's view current.
 *
 * Every view sits behind the same gate as the tab (the programme's lead or an
 * admin), and each page draws this row only once its gate has answered, so a
 * reviewer told the tab is not theirs is never shown its views. The team's
 * ratings of written work have no view until they exist.
 */

export type SurveysView = "overview" | "before" | "check-ins" | "reports" | "end" | "follow-ups";

const VIEWS: readonly { view: SurveysView; label: string; segment: string }[] = [
  { view: "overview", label: "Overview", segment: "" },
  { view: "before", label: "Before", segment: "/before" },
  { view: "check-ins", label: "Check-ins", segment: "/check-ins" },
  { view: "reports", label: "Facilitators’ reports", segment: "/reports" },
  { view: "end", label: "End", segment: "/end" },
  { view: "follow-ups", label: "Follow-ups", segment: "/follow-ups" },
];

/** The Surveys tab's own address, with no trailing slash. */
export function surveysPath(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/surveys`;
}

/** The address of one view. */
export function surveysViewPath(roundId: string, programmeId: string, view: SurveysView): string {
  const found = VIEWS.find((entry) => entry.view === view);
  return `${surveysPath(roundId, programmeId)}${found?.segment ?? ""}`;
}

export default function SurveysViews({
  roundId,
  programmeId,
  current,
}: {
  roundId: string;
  programmeId: string;
  /** The view on screen, or null on a page that is none of them (a survey that is not the programme's). */
  current: SurveysView | null;
}) {
  return (
    <nav className={styles.views} aria-label="Surveys views">
      {VIEWS.map(({ view, label }) => {
        const here = view === current;
        return (
          <Link
            key={view}
            href={surveysViewPath(roundId, programmeId, view)}
            className={here ? `${styles.view} ${styles.viewCurrent}` : styles.view}
            aria-current={here ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A view's page: the row of views over what the view shows. */
export function SurveysFrame({
  roundId,
  programmeId,
  current,
  children,
}: {
  roundId: string;
  programmeId: string;
  current: SurveysView | null;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <SurveysViews roundId={roundId} programmeId={programmeId} current={current} />
      {children}
    </div>
  );
}
