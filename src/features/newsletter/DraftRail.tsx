import type { ReactNode } from "react";
import Link from "next/link";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import styles from "./DraftRail.module.css";

export type RailRow = {
  id: string;
  href: string;
  /** The subject line, or whatever stands in for a missing one. */
  title: ReactNode;
  /** A state worth a chip. A plain draft and a sent edition carry none. */
  chip?: { tone: ChipTone; label: string };
  /** The muted second line: who, when, how many. */
  line: ReactNode;
  /** A reviewer's note on a draft that came back. */
  note?: ReactNode;
  /** A control that belongs to the row but is not the link (a delete button). */
  action?: ReactNode;
};

export type RailGroup = {
  key: string;
  label: string;
  /** Shown after the label as "Drafts · 2". */
  count?: number;
  /** A group that is waiting on the reader. */
  tone?: "warning";
  rows: RailRow[];
  /** What to say when the group has no rows. Left out, an empty group is not drawn. */
  empty?: string;
};

type Props = {
  groups: RailGroup[];
  /** The draft that is open beside the rail, if any. */
  currentId?: string;
  /** A link under the last group. */
  footer?: ReactNode;
  /** Names the list for a screen reader. */
  ariaLabel: string;
};

/**
 * A card of newsletter drafts in named groups, one link per draft.
 *
 * It only draws what it is handed. Which drafts go in which group, whose they
 * are and which row gets a control are all decided by the caller.
 */
export default function DraftRail({ groups, currentId, footer, ariaLabel }: Props) {
  const drawn = groups.filter((group) => group.rows.length > 0 || group.empty);
  return (
    <nav className={styles.rail} aria-label={ariaLabel}>
      {drawn.map((group) => (
        <section key={group.key} className={styles.group}>
          <h2
            className={
              group.tone === "warning" ? `${styles.groupLabel} ${styles.groupWarn}` : styles.groupLabel
            }
          >
            {group.label}
            {group.count !== undefined && ` · ${group.count}`}
          </h2>
          {group.rows.length === 0 ? (
            <p className={styles.empty}>{group.empty}</p>
          ) : (
            <ul className={styles.rows}>
              {group.rows.map((row) => {
                const isCurrent = row.id === currentId;
                return (
                  <li key={row.id} className={styles.item}>
                    <Link
                      href={row.href}
                      className={isCurrent ? `${styles.row} ${styles.rowCurrent}` : styles.row}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      <span className={styles.rowTop}>
                        <span className={styles.rowTitle}>{row.title}</span>
                        {row.chip && (
                          <span className={styles.rowChip}>
                            <Chip tone={row.chip.tone}>{row.chip.label}</Chip>
                          </span>
                        )}
                      </span>
                      <span className={styles.rowLine}>{row.line}</span>
                      {row.note && <span className={styles.rowNote}>{row.note}</span>}
                    </Link>
                    {row.action}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
      {footer && <div className={styles.footer}>{footer}</div>}
    </nav>
  );
}
