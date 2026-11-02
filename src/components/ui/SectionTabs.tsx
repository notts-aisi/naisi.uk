import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./SectionTabs.module.css";

export type SectionTab = {
  /** What `current` and `onSelect` name this tab by. */
  key: string;
  label: ReactNode;
  /** A number in a pill after the label. Nothing is drawn when it is left out. */
  count?: number;
  /**
   * A few words in a pill after the label, for something waiting on somebody
   * ("4 waiting"), where a bare number would not say what it counts. Nothing
   * is drawn when it is left out.
   */
  note?: string;
  /**
   * A tab with an address is a link to another page. A tab without one is a
   * button that calls `onSelect`, for views that swap in place.
   */
  href?: string;
};

type SectionTabsProps = {
  tabs: readonly SectionTab[];
  /** The key of the tab that is showing. */
  current: string;
  /** Called with a tab's key when a tab without an address is pressed. */
  onSelect?: (key: string) => void;
  /** Names the set for a screen reader: "Sections", "People". */
  ariaLabel: string;
  className?: string;
};

/**
 * Underlined tabs, each with an optional count or note. The current one has
 * the accent line and full-strength text.
 *
 * The set is a <nav> of links or buttons with `aria-current`, not an ARIA
 * tablist: nothing here owns the panels, and a link to another page is not a
 * tab in that sense. On a narrow screen the row scrolls inside itself.
 */
export default function SectionTabs({
  tabs,
  current,
  onSelect,
  ariaLabel,
  className,
}: SectionTabsProps) {
  const cls = [styles.tabs, className ?? ""].filter(Boolean).join(" ");
  return (
    <nav className={cls} aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isCurrent = tab.key === current;
        const tabClass = isCurrent ? `${styles.tab} ${styles.current}` : styles.tab;
        const inner = (
          <>
            {tab.label}
            {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
            {tab.note !== undefined && <span className={styles.note}>{tab.note}</span>}
          </>
        );
        if (tab.href !== undefined) {
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={tabClass}
              aria-current={isCurrent ? "page" : undefined}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={tab.key}
            type="button"
            className={tabClass}
            aria-current={isCurrent ? "true" : undefined}
            onClick={onSelect ? () => onSelect(tab.key) : undefined}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
