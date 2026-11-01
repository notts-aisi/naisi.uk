import type { WeekWorkWire } from "@/lib/courses/weekWork/model";
import {
  LOCKED,
  SAVED_AS_YOU_GO,
  SUBMITTED,
  askToReopenWords,
  doneOfWords,
  lockedBoxWords,
  type Readers,
} from "@/lib/courses/weekWork/words";
import styles from "./weekWork.module.css";

/**
 * THE WEEK'S STATUS BOX, at the top of the week page for somebody taking
 * part (the week you submit): "1 of 3 done · Saved as you go" while the week
 * takes work; "Submitted" or "Locked" with the count once it does not, what
 * a locked week means, and whom to ask to reopen it. Asking is a plain line:
 * nothing on the site carries the request yet.
 */
export default function WeekStatus({
  work,
  counts,
  readers,
  wroteAnything,
}: {
  work: WeekWorkWire;
  counts: { done: number; of: number };
  /** Who reads the written answer and may reopen the week: the group's facilitators, or the lead. */
  readers: Readers;
  /** Something written in the week, for what a locked week says was saved. */
  wroteAnything: boolean;
}) {
  const count = counts.of > 0 ? doneOfWords(counts.done, counts.of) : null;
  if (work.state === "open" || work.state === "reopened") {
    return (
      <div className={styles.status}>
        <div className={styles.statusRow}>
          <p className={styles.statusCount}>{count ?? SAVED_AS_YOU_GO}</p>
          {count && <p className={styles.statusQuiet}>{SAVED_AS_YOU_GO}</p>}
        </div>
      </div>
    );
  }
  const submitted = work.state === "submitted";
  return (
    <div className={styles.status}>
      <div className={styles.statusRow}>
        <span className={submitted ? `${styles.chip} ${styles.chipDone}` : styles.chip}>{submitted ? SUBMITTED : LOCKED}</span>
        {count && <p className={styles.statusQuiet}>{count}</p>}
      </div>
      {!submitted && <p className={styles.statusLine}>{lockedBoxWords(readers, wroteAnything)}</p>}
      <p className={styles.statusLine}>{askToReopenWords(readers)}</p>
    </div>
  );
}
