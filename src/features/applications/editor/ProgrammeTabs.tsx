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
 * on their own. Overview, the run's week, sessions and registers, is a link
 * for the same two, and says so when the programme names no run yet.
 *
 * Messages, where updates are written to the people taking part, is a link
 * for the same two, by the same answer, and its page refuses anybody else.
 *
 * An incubator has a Teams tab after Groups (`teams`, with how many teams its
 * run has), a link on the same terms as Groups. A fellowship has none.
 */

type Tab = {
  /** The route segment under the programme, for the tabs that have a page. */
  segment: "overview" | "applications" | "groups" | "teams" | "attendance" | "messages" | "setup" | null;
  label: string;
  count?: number | null;
};

export default function ProgrammeTabs({
  base,
  applications,
  groups,
  canEdit,
  groupsOpen,
  teams = null,
}: {
  /** The programme's own address, with no trailing slash. */
  base: string;
  /** People who have applied to this programme. */
  applications: number;
  groups: number | null;
  /** True for the programme's lead and for an admin. */
  canEdit: boolean;
  /** True for an admin and the programme's lead: Overview, Groups, Teams, Attendance and Messages are links. */
  groupsOpen: boolean;
  /** An incubator's Teams tab, with how many teams its run has; null for a fellowship. */
  teams?: { count: number | null } | null;
}) {
  const active = useSelectedLayoutSegment();
  const tabs: Tab[] = [
    { segment: groupsOpen ? "overview" : null, label: "Overview" },
    { segment: null, label: "Interest" },
    { segment: "applications", label: "Applications", count: applications },
    { segment: groupsOpen ? "groups" : null, label: "Groups", count: groups },
    ...(teams ? [{ segment: groupsOpen ? ("teams" as const) : null, label: "Teams", count: teams.count }] : []),
    { segment: groupsOpen ? "attendance" : null, label: "Attendance" },
    { segment: groupsOpen ? "messages" : null, label: "Messages" },
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
