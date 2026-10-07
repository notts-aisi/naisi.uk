"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import styles from "./ProgrammeFrame.module.css";

/**
 * The tabs across one programme's pages.
 *
 * Seven are drawn, because that is the programme's whole shape. Only the ones
 * whose pages exist are links: Applications and Settings. The others are
 * drawn the same and are not links, so nobody is sent to a page that is not
 * there, and they say so to assistive technology.
 *
 * Settings is left out for somebody who cannot open it: a reviewer reads and
 * scores, and the settings are the lead's.
 */

type Tab = {
  /** The route segment under the programme, for the tabs that have a page. */
  segment: "applications" | "setup" | null;
  label: string;
  count?: number | null;
};

export default function ProgrammeTabs({
  base,
  applications,
  groups,
  canEdit,
}: {
  /** The programme's own address, with no trailing slash. */
  base: string;
  /** People who have applied to this programme. */
  applications: number;
  groups: number | null;
  /** True for the programme's lead and for an admin. */
  canEdit: boolean;
}) {
  const active = useSelectedLayoutSegment();
  const tabs: Tab[] = [
    { segment: null, label: "Overview" },
    { segment: null, label: "Interest" },
    { segment: "applications", label: "Applications", count: applications },
    { segment: null, label: "Groups", count: groups },
    { segment: null, label: "Attendance" },
    { segment: null, label: "Messages" },
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
