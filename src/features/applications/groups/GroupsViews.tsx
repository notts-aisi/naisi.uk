import Link from "next/link";
import type { ReactNode } from "react";
import { ALL_GROUPS } from "@/lib/courses/allGroups/words";
import { withShow, type BoardShow } from "./boardShow";
import styles from "./GroupsViews.module.css";

/**
 * THE VIEWS OF A PROGRAMME'S GROUPS TAB, and the row they sit in.
 *
 * Four views exist for every run, in the design's order: People in groups
 * (the run's allocation board, shown as Columns or as Rings), All groups
 * (one row per group, each opening the group's page, and the archived groups
 * at the foot; its address is still `/sessions`, the name it had as
 * Sessions, so every link to it keeps working), Times (when the people
 * holding a place are free) and Facilitators (who staffs each group). A run
 * with a pitching week has one more, Pitches (the pitches from that week,
 * which teams are made from, and pitching week's settings), and so does
 * every incubator, which has teams whether or not it has a pitching week:
 * one whose teams are made from the agenda sets their sizes and day there.
 * Each is its own address under the tab, so a
 * view is a link and the one on screen says so (`aria-current`). The tab
 * itself opens on People in groups.
 *
 * Circles was a view of its own here until it became People in groups shown
 * as Rings; its address forwards there. Whether People in groups is shown as
 * Rings is carried in the address alone (`./boardShow.ts`), and every link in
 * this row carries it on, so coming back to People in groups from another
 * view shows it the way it was last looked at.
 */

export type GroupsView = "sessions" | "people" | "times" | "facilitators" | "pitches";

const VIEWS: readonly { view: GroupsView; label: string; segment: string }[] = [
  { view: "people", label: "People in groups", segment: "" },
  { view: "sessions", label: ALL_GROUPS, segment: "/sessions" },
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
  show,
}: {
  roundId: string;
  programmeId: string;
  current: GroupsView;
  /** The run has a pitching week, or the programme has teams, so its Pitches view is offered. */
  pitches?: boolean;
  /** How People in groups was shown on the address this page was reached by, carried on by every link here. */
  show?: BoardShow;
}) {
  const shown = VIEWS.filter(({ view }) => view !== "pitches" || pitches || current === "pitches");
  return (
    <nav className={styles.views} aria-label="Groups views">
      {shown.map(({ view, label }) => {
        const here = view === current;
        return (
          <Link
            key={view}
            href={withShow(groupsViewPath(roundId, programmeId, view), show)}
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
