import type { ReactNode } from "react";
import styles from "./adminPanels.module.css";

/**
 * Pieces the Publicity and Site settings pages share, beside the list pieces
 * in `adminList`: a row of count cards, and a card with a title, a muted line
 * about itself and its own buttons.
 *
 * No head is drawn here. A page draws its own with the shared `PageHead`, and
 * `tests/app-frame.test.mjs` reads every file a page reaches for one.
 */

/** A row of count cards. `label` names the row for a screen reader. */
export function AdminStats({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.stats} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** One count: the number, what it counts, and a muted line saying which. */
export function AdminStat({
  value,
  label,
  note,
}: {
  value: ReactNode;
  label: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
      {note && <span className={styles.statNote}>{note}</span>}
    </div>
  );
}

/**
 * A card with a title. The title is an `<h2>`: the page's own name is the one
 * `<h1>` above it.
 */
export function AdminPanel({
  title,
  description,
  badges,
  actions,
  tone = "plain",
  children,
}: {
  title: ReactNode;
  /** One muted line or two under the title: what this card is for. */
  description?: ReactNode;
  /** Chips beside the title: a state. */
  badges?: ReactNode;
  /** Buttons at the right of the title. They drop under it on a phone. */
  actions?: ReactNode;
  /** `careful` is the card that holds what cannot be taken back. */
  tone?: "plain" | "careful";
  children?: ReactNode;
}) {
  return (
    <section className={tone === "careful" ? `${styles.panel} ${styles.panelCareful}` : styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelHeadMain}>
          <div className={styles.panelTitleRow}>
            <h2 className={styles.panelTitle}>{title}</h2>
            {badges}
          </div>
          {description && <p className={styles.panelDescription}>{description}</p>}
        </div>
        {actions && <div className={styles.panelActions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Something went wrong, said in a box: a load that failed, a save refused. */
export function AdminProblem({ children }: { children: ReactNode }) {
  return (
    <p className={styles.problem} role="alert">
      {children}
    </p>
  );
}

/**
 * One thing that can be done, on a line of its own inside a card: what it is,
 * a muted line saying what it does, and its button at the right. A Careful
 * card is a list of these.
 */
export function AdminActionRow({
  name,
  note,
  children,
}: {
  name: ReactNode;
  note?: ReactNode;
  /** The button. */
  children: ReactNode;
}) {
  return (
    <div className={styles.actionRow}>
      <div className={styles.actionText}>
        <span className={styles.actionName}>{name}</span>
        {note && <span className={styles.actionNote}>{note}</span>}
      </div>
      <div className={styles.actionButtons}>{children}</div>
    </div>
  );
}

/** A row of small counts inside a card: each a number over its name. */
export function AdminTiles({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.tiles} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function AdminTile({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileValue}>{value}</span>
      <span className={`meta ${styles.tileLabel}`}>{label}</span>
    </div>
  );
}
