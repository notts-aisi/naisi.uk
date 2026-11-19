import type { BeforeTheSession as Before } from "@/lib/courses/groupPage/model";
import * as W from "@/lib/courses/groupPage/words";
import { namesWords } from "@/lib/courses/sessionChange/words";
import styles from "./GroupPage.module.css";

/**
 * BEFORE THE SESSION, on a facilitator's group page, phone first: the
 * group's next session still to end, and who has said what about it, a row
 * each: who has asked to be excused and is waiting, who is excused or can't
 * make it, who is joining online, who is visiting from another group that
 * week (with their line), who of the group is at another group's session,
 * and who is coming.
 *
 * Drawn on the server from `loadGroupPage`'s facilitator view
 * (`beforeTheSessionOf`): the names the reader is shown people by, and one of
 * two facts about a request to be excused, as the register says them. Never a
 * reason, never when anybody asked, never an address. Nothing to press: the
 * register is where a line is marked.
 */
export default function BeforeTheSession({ before }: { before: Before }) {
  return (
    <section className={`${styles.card} ${styles.facCard}`} aria-labelledby="before-the-session" data-testid="before-the-session">
      <div>
        <h2 id="before-the-session" className={styles.cardTitle}>
          {W.BEFORE_THE_SESSION}
        </h2>
        <p className={styles.cardLine}>{W.beforeWhenWords(before.weekNumber, before.dateKey)}</p>
      </div>
      <ul className={styles.beforeList}>
        {before.rows.map((row) => {
          const chip = W.BEFORE_CHIP[row.kind];
          const says =
            row.kind === "visiting" || row.kind === "away" ? row.line : W.beforeSaysWords(row.kind, before.online);
          return (
            <li key={`${row.kind} ${row.names.join(" ")}`} className={styles.beforeRow} data-kind={row.kind}>
              <span className={styles.beforeText}>
                <span className={styles.beforeNames}>{namesWords(row.names)}</span>
                <span className={styles.beforeSays}>{says}</span>
              </span>
              {chip && (
                <span
                  className={`${styles.excuseChip} ${
                    row.kind === "waiting" ? styles.excuseWaiting : row.kind === "excused" ? styles.excuseExcused : ""
                  }`}
                >
                  {chip}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
