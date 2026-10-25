import InitialsChip from "@/components/ui/InitialsChip";
import { NO_UPDATES_YET, UPDATES_HEADING } from "@/lib/courses/updates/words";
import styles from "./Updates.module.css";

/**
 * AN UPDATE, AS A PAGE SHOWS IT. Two shapes, both drawn from fields a server
 * worked out, never from a stored document:
 *
 *  - `ReaderUpdateItem`, on a member's programme page (wk-programme): the
 *    writer's initials, the title, "Rahul · to Group B · Mon 16 Nov", and the
 *    message;
 *  - `StaffUpdatesSection`, on a facilitator's group page and the lead's
 *    Messages tab (wk-fac-group): the title and "Rahul → Group B · Mon 16 Nov
 *    · Emailed to 7", opening to the message.
 *
 * THE MESSAGE IS TEXT. It is a React child, so it is escaped, and the
 * stylesheet keeps its line breaks (`white-space: pre-wrap`). Nothing here
 * turns it into markup, and `tests/course-hub-updates-guard.test.mjs` fails on
 * a file under this folder that tries.
 *
 * No hooks and no browser APIs, so a server page and the member page's client
 * section can both draw these.
 */

export type ReaderUpdate = {
  id: string;
  title: string;
  message: string;
  authorUid: string;
  authorName: string;
  authorFirst: string;
  /** "to Group B", "to everyone on AGI Strategy". */
  toWords: string;
  /** "Mon 16 Nov". */
  postedOn: string;
};

export function ReaderUpdateItem({ update }: { update: ReaderUpdate }) {
  return (
    <article className={styles.item}>
      <span className={styles.chip}>
        <InitialsChip name={update.authorName} uid={update.authorUid} size="md" />
      </span>
      <div className={styles.itemBody}>
        <h3 className={styles.itemTitle}>{update.title}</h3>
        <p className={styles.itemMeta}>
          {update.authorFirst} · {update.toWords}
          {update.postedOn ? (
            <>
              {" · "}
              <span className={styles.nowrap}>{update.postedOn}</span>
            </>
          ) : null}
        </p>
        <p className={styles.message}>{update.message}</p>
      </div>
    </article>
  );
}

export type StaffUpdate = {
  id: string;
  title: string;
  message: string;
  /** "Rahul → Group B · Mon 16 Nov · Emailed to 7". */
  meta: string;
};

/** The "Updates" card on a staff page: each update's title and line, opening to its message. */
export function StaffUpdatesSection({
  updates,
  headingId,
}: {
  updates: readonly StaffUpdate[];
  /** For a page that labels the section by its heading. */
  headingId?: string;
}) {
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 className={styles.heading} id={headingId}>
        {UPDATES_HEADING}
      </h2>
      {updates.length === 0 ? (
        <p className={styles.empty}>{NO_UPDATES_YET}</p>
      ) : (
        <ul className={styles.rows}>
          {updates.map((update) => (
            <li key={update.id} className={styles.row}>
              <details className={styles.details}>
                <summary className={styles.summary}>
                  <span className={styles.rowTitle}>{update.title}</span>
                  <span className={styles.rowMeta}>{update.meta}</span>
                </summary>
                <p className={`${styles.message} ${styles.rowMessage}`}>{update.message}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
