import type { WeekWorkWire } from "@/lib/courses/weekWork/model";
import { SAVED_AS_YOU_GO, doneOfWords } from "@/lib/courses/weekWork/words";
import styles from "./weekWork.module.css";

/**
 * THE BOX AT THE TOP OF THE WEEK, for somebody taking part (the week stays
 * open): "1 of 3 done · Saved as you go" while the programme takes work,
 * the count alone once it has closed (the line under the title says so), and
 * under it one line when there is one to say: once the session they are due
 * at has started, that the group met, that they can still finish it and that
 * anything added or changed now shows as late to the people who read their
 * work (`sessionMetWords`); for a facilitator's own work, who reads it and
 * that what they add after their group's session shows those people as late
 * (`ownWorkWords`). A fact, not a warning: drawn in the box's own neutral
 * colours, never the warning colour.
 */
export default function WeekStatus({
  work,
  counts,
  line,
}: {
  work: WeekWorkWire;
  counts: { done: number; of: number };
  /** The line under the count, or null with none. */
  line: string | null;
}) {
  const count = counts.of > 0 ? doneOfWords(counts.done, counts.of) : null;
  const open = !work.closed;
  if (!count && !open && !line) return null;
  return (
    <div className={styles.status}>
      {(count || open) && (
        <div className={styles.statusRow}>
          <p className={styles.statusCount}>{count ?? SAVED_AS_YOU_GO}</p>
          {count && open && <p className={styles.statusQuiet}>{SAVED_AS_YOU_GO}</p>}
        </div>
      )}
      {line && <p className={styles.statusLine}>{line}</p>}
    </div>
  );
}
