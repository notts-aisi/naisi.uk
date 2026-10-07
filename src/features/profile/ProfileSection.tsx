import type { ReactNode } from "react";
import styles from "./ProfileSection.module.css";

/**
 * One section of the profile page: what it is and a line about it on the
 * left, the card that holds it on the right.
 *
 * The two sit side by side when the page has room and stack when it does
 * not, on the page's own width: the card never gets narrower than its
 * contents need while there is a heading beside it.
 *
 * No directive: it draws what it is given, on the server or in the browser.
 */

type Section = {
  /** The id the section's heading carries, so the section is named by it. */
  headingId: string;
  title: string;
  description?: ReactNode;
  /** A badge beside the heading. */
  badge?: ReactNode;
  children: ReactNode;
  /** Passed to the card, for a section something else links to. */
  cardId?: string;
};

export default function ProfileSection({
  headingId,
  title,
  description,
  badge,
  children,
  cardId,
}: Section) {
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.label}>
        <div className={styles.headingRow}>
          <h2 id={headingId} className={styles.heading}>
            {title}
          </h2>
          {badge}
        </div>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      <div className={styles.body}>
        <div className={styles.card} id={cardId}>
          {children}
        </div>
      </div>
    </section>
  );
}
