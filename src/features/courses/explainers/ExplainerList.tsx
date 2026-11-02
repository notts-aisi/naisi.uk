import type { ExplainerRow } from "@/lib/courses/explainers/readers";
import CancelExplainer from "./CancelExplainer";
import styles from "./explainers.module.css";

/**
 * The explainers still on that were scheduled from one week's review: each
 * one's topic, how long and who, and the sessions it opens. On the review
 * (an admin's) each has Cancel; on the week's page (the lead's and an
 * admin's) it is read only. Drawn on the server from rows the page read, which
 * hold the admin's topic and nothing of the review.
 */
export default function ExplainerList({
  rows,
  cancel = null,
}: {
  rows: readonly ExplainerRow[];
  /** The programme's ids, for Cancel on the review; null on the week's page. */
  cancel?: { roundId: string; programmeId: string } | null;
}) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.id} className={styles.item}>
          <div className={styles.itemText}>
            <p className={styles.itemTitle}>{row.topic}</p>
            <p className={styles.itemLine}>{row.lengthAndWho}</p>
            <ul className={styles.sessions}>
              {row.sessions.map((session, index) => (
                <li key={index}>{session}</li>
              ))}
            </ul>
          </div>
          {cancel && (
            <CancelExplainer
              roundId={cancel.roundId}
              programmeId={cancel.programmeId}
              explainerId={row.id}
              by={row.by}
              tasks={row.sessions.length}
              topic={row.topic}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
