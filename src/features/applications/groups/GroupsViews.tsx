import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./GroupsViews.module.css";

/**
 * THE VIEWS OF A PROGRAMME'S GROUPS TAB, and the row they sit in.
 *
 * Four views exist for every run, in the boards' order: Sessions (each
 * group's session in one week, and changing one), People in groups (the run's
 * allocation board), Times (when the people holding a place are free) and
 * Facilitators (who staffs each group). An admin has a fifth beside People in
 * groups, Circles (each group a ring, each person's week against the groups'
 * times, and suggestions drawn over them), which only an admin is offered
 * because it shows painted weeks and Claude's reads. A run with a pitching
 * week has one more, Pitches (the pitches from that week, which teams are
 * made from). Each is its own address under the tab, so a view is a link and
 * the one on screen says so (`aria-current`). The tab itself opens on People
 * in groups.
 */

export type GroupsView = "sessions" | "people" | "circles" | "times" | "facilitators" | "pitches";

const VIEWS: readonly { view: GroupsView; label: string; segment: string }[] = [
  { view: "sessions", label: "Sessions", segment: "/sessions" },
  { view: "people", label: "People in groups", segment: "" },
  { view: "circles", label: "Circles", segment: "/circles" },
  { view: "times", label: "Times", segment: "/times" },
  { view: "facilitators", label: "Facilitators", segment: "/facilitators" },
  { view: "pitches", label: "Pitches", segment: "/pitches" },
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
  pitches = false,
  circles = false,
}: {
  roundId: string;
  programmeId: string;
  current: GroupsView;
  /** The run has a pitching week, so its Pitches view is offered. */
  pitches?: boolean;
  /** The viewer is an admin, so Circles is offered. */
  circles?: boolean;
}) {
  const shown = VIEWS.filter(
    ({ view }) =>
      (view !== "pitches" || pitches || current === "pitches") && (view !== "circles" || circles || current === "circles"),
  );
  return (
    <nav className={styles.views} aria-label="Groups views">
      {shown.map(({ view, label }) => {
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
