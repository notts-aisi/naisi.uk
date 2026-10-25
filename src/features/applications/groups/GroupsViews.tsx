import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./GroupsViews.module.css";

/**
 * THE VIEWS OF A PROGRAMME'S GROUPS TAB, and the row they sit in.
 *
 * Three views exist: People in groups (the run's allocation board), Times
 * (when the people holding a place are free) and Facilitators (who staffs
 * each group). Each is its own address under the tab, so a view is a link
 * and the one on screen says so (`aria-current`). The boards draw a fourth,
 * Sessions, which does not exist yet and is not drawn.
 */

export type GroupsView = "people" | "times" | "facilitators";

const VIEWS: readonly { view: GroupsView; label: string; segment: string }[] = [
  { view: "people", label: "People in groups", segment: "" },
  { view: "times", label: "Times", segment: "/times" },
  { view: "facilitators", label: "Facilitators", segment: "/facilitators" },
];

/** The Groups tab's own address, with no trailing slash. */
export function groupsPath(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/groups`;
}

/** The address of one view. */
export function groupsViewPath(roundId: string, programmeId: string, view: GroupsView): string {
  const found = VIEWS.find((entry) => entry.view === view);
  return `${groupsPath(roundId, programmeId)}${found?.segment ?? ""}`;
}

export default function GroupsViews({
  roundId,
  programmeId,
  current,
}: {
  roundId: string;
  programmeId: string;
  current: GroupsView;
}) {
  return (
    <nav className={styles.views} aria-label="Groups views">
      {VIEWS.map(({ view, label }) => {
        const here = view === current;
        return (
          <Link
            key={view}
            href={groupsViewPath(roundId, programmeId, view)}
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

/** One view of the tab: the row of views, anything that sits beside them, then the view itself. */
export function GroupsFrame({
  views,
  beside,
  children,
}: {
  views: ReactNode;
  beside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.frame}>
      <div className={styles.toolbar}>
        {views}
        {beside}
      </div>
      {children}
    </div>
  );
}
