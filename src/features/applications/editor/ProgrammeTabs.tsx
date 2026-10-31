"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import styles from "./ProgrammeFrame.module.css";

/**
 * The tabs across one programme's pages.
 *
 * Only tabs whose pages the person can open are drawn, and every tab drawn is
 * a link, so nobody is shown a tab that leads nowhere.
 *
 * For an admin and the programme's lead (`groupsOpen`, which is
 * `opensProgrammeGroups`), every tab the programme has:
 *
 *  - Overview, the run's week, sessions and registers, which says so when the
 *    programme names no run yet.
 *  - Applications.
 *  - People (board st-people): everyone who holds a place or gave it back, by
 *    name, with their replies. Its count is how many hold a place now
 *    (`countPlaceHolders`, the test its own rows ask), given only once
 *    decisions have gone out.
 *  - Groups, and an incubator's Teams after it (`teams`, with how many teams
 *    its run has). A fellowship has no Teams tab.
 *  - Weeks (board pr-weeks), where the run's weeks are written and marked
 *    ready. Its count is how many weeks the run's plan has.
 *  - Attendance, then Coursework (Zach, Fri 30 Oct): what everybody holding a
 *    place has written, week by week, by name.
 *  - Messages, where updates are written to the people taking part.
 *  - Surveys (board sv-programme): the programme's surveys in totals and
 *    comments, never a name, with Ratings and the anonymous form's answers
 *    linked from it.
 *
 * For a reviewer, Applications alone. A reviewer reads and scores, and every
 * other tab shows the people holding a place by name, or is the lead's to
 * run, so their pages refuse anybody else on their own as well.
 *
 * Settings is drawn last for somebody who can open it (`canEdit`), and left
 * out for somebody who cannot: the settings are the lead's.
 */

type Tab = {
  /** The route segment under the programme. */
  segment: "overview" | "applications" | "people" | "groups" | "teams" | "weeks" | "attendance" | "coursework" | "messages" | "surveys" | "setup";
  label: string;
  count?: number | null;
};

export default function ProgrammeTabs({
  base,
  applications,
  people = null,
  groups,
  canEdit,
  groupsOpen,
  teams = null,
  weeks = null,
}: {
  /** The programme's own address, with no trailing slash. */
  base: string;
  /** People who have applied to this programme. */
  applications: number;
  /** How many hold a place on it now, for an admin and its lead once decisions have gone out; null otherwise. */
  people?: number | null;
  groups: number | null;
  /** True for the programme's lead and for an admin. */
  canEdit: boolean;
  /** True for an admin and the programme's lead: every tab is drawn. False for a reviewer: Applications alone. */
  groupsOpen: boolean;
  /** An incubator's Teams tab, with how many teams its run has; null for a fellowship. */
  teams?: { count: number | null } | null;
  /** How many weeks the run's plan has, for an admin and the lead while the programme names a run; null otherwise. */
  weeks?: number | null;
}) {
  const active = useSelectedLayoutSegment();
  const applicationsTab: Tab = { segment: "applications", label: "Applications", count: applications };
  const tabs: Tab[] = groupsOpen
    ? [
        { segment: "overview", label: "Overview" },
        applicationsTab,
        { segment: "people", label: "People", count: people },
        { segment: "groups", label: "Groups", count: groups },
        ...(teams ? [{ segment: "teams" as const, label: "Teams", count: teams.count }] : []),
        { segment: "weeks", label: "Weeks", count: weeks },
        { segment: "attendance", label: "Attendance" },
        { segment: "coursework", label: "Coursework" },
        { segment: "messages", label: "Messages" },
        { segment: "surveys", label: "Surveys" },
      ]
    : [applicationsTab];
  if (canEdit) tabs.push({ segment: "setup", label: "Settings" });

  return (
    <nav className={styles.tabs} aria-label="Sections">
      {tabs.map((tab) => {
        const count =
          typeof tab.count === "number" ? <span className={styles.tabCount}>{tab.count}</span> : null;
        const current = active === tab.segment;
        return (
          <Link
            key={tab.label}
            href={`${base}/${tab.segment}`}
            className={`${styles.tab} ${current ? styles.tabCurrent : ""}`}
            aria-current={current ? "page" : undefined}
          >
            {tab.label}
            {count}
          </Link>
        );
      })}
    </nav>
  );
}
