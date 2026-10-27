"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import styles from "./ProgrammeFrame.module.css";

/**
 * The tabs across one programme's pages.
 *
 * Seven are drawn, because that is the programme's whole shape. Only the ones
 * whose pages exist are links: Applications, Settings, and Groups and
 * Attendance for an admin and the programme's lead. The others are drawn the
 * same and are not links, so nobody is sent to a page that is not there, and
 * they say so to assistive technology.
 *
 * Settings is left out for somebody who cannot open it: a reviewer reads and
 * scores, and the settings are the lead's.
 *
 * Groups and Attendance are links for an admin and the programme's lead
 * (`opensProgrammeGroups`), and are drawn like the tabs not built yet for a
 * reviewer: they show the people holding a place by name, in their groups,
 * when they are free and in the registers. Their pages refuse anybody else
 * on their own.
 *
 * People, after Applications (board st-people), is a link on the same terms:
 * everyone who holds a place or gave it back, by name, with their replies.
 * Its count is how many hold a place now (`countPlaceHolders`, the test its
 * own rows ask), given only to the two who open it, and only once decisions
 * have gone out. Overview, the run's week, sessions and registers, is a link
 * for the same two, and says so when the programme names no run yet.
 *
 * Messages, where updates are written to the people taking part, is a link
 * for the same two, by the same answer, and its page refuses anybody else.
 *
 * An incubator has a Teams tab after Groups (`teams`, with how many teams its
 * run has), a link on the same terms as Groups. A fellowship has none.
 *
 * Weeks (board pr-weeks), between Groups (and an incubator's Teams) and
 * Attendance, is a link on the same terms, where the run's weeks are written
 * and marked ready. Its count is how many weeks the run's plan has, given
 * only to the two who open it.
 *
 * Surveys (board sv-programme), between Messages and Settings, is a link on
 * the same terms: the programme's surveys in totals and comments, never a
 * name, with Ratings and the anonymous form's answers linked from it. It is
 * drawn like the tabs not built yet for a reviewer, and its page refuses
 * anybody else on its own.
 */

type Tab = {
  /** The route segment under the programme, for the tabs that have a page. */
  segment: "overview" | "applications" | "people" | "groups" | "teams" | "weeks" | "attendance" | "messages" | "surveys" | "setup" | null;
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
  /** True for an admin and the programme's lead: Overview, Groups, Teams, Attendance, Messages and Surveys are links. */
  groupsOpen: boolean;
  /** An incubator's Teams tab, with how many teams its run has; null for a fellowship. */
  teams?: { count: number | null } | null;
  /** How many weeks the run's plan has, for an admin and the lead while the programme names a run; null otherwise. */
  weeks?: number | null;
}) {
  const active = useSelectedLayoutSegment();
  const tabs: Tab[] = [
    { segment: groupsOpen ? "overview" : null, label: "Overview" },
    { segment: null, label: "Interest" },
    { segment: "applications", label: "Applications", count: applications },
    { segment: groupsOpen ? "people" : null, label: "People", count: groupsOpen ? people : null },
    { segment: groupsOpen ? "groups" : null, label: "Groups", count: groups },
    ...(teams ? [{ segment: groupsOpen ? ("teams" as const) : null, label: "Teams", count: teams.count }] : []),
    { segment: groupsOpen ? "weeks" : null, label: "Weeks", count: groupsOpen ? weeks : null },
    { segment: groupsOpen ? "attendance" : null, label: "Attendance" },
    { segment: groupsOpen ? "messages" : null, label: "Messages" },
    { segment: groupsOpen ? "surveys" : null, label: "Surveys" },
  ];
  if (canEdit) tabs.push({ segment: "setup", label: "Settings" });

  return (
    <nav className={styles.tabs} aria-label="Sections">
      {tabs.map((tab) => {
        const count =
          typeof tab.count === "number" ? <span className={styles.tabCount}>{tab.count}</span> : null;
        if (!tab.segment) {
          return (
            <span
              key={tab.label}
              className={`${styles.tab} ${styles.tabPending}`}
              aria-disabled="true"
              title="Not built yet"
            >
              {tab.label}
              {count}
            </span>
          );
        }
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
