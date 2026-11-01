import Link from "next/link";
import Chip from "@/components/ui/Chip";
import type { ListRow, ListView } from "@/lib/surveys/adminView";
import type { CheckInListGroup } from "@/lib/surveys/checkIns/adminView";
import { CHECK_IN_ADMIN_WORDS } from "@/lib/surveys/checkIns/words";
import { LIST_WORDS, peopleWords } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * Run NAISI › Surveys, for admins (sv-list): every survey, open, then drafts,
 * then closed, each with how private it is, its answers and when it closes,
 * and the way to its Send tab or its results. Beside it, what "confidential"
 * means.
 *
 * Below them, the check-ins at the end of sessions, one line a programme,
 * each opening on its check-ins.
 */

function Row({ row }: { row: ListRow }) {
  const base = `/admin/surveys/${encodeURIComponent(row.id)}`;
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowName}>
          <Link href={row.state === "draft" ? `${base}/questions` : `${base}/results`} className={styles.rowLink}>
            {row.name}
          </Link>
          <Chip tone="accent" size="sm">
            {LIST_WORDS.confidential}
          </Chip>
        </div>
        <p className={styles.rowSub}>{row.programme}</p>
      </div>
      <div>
        <span className={row.state === "draft" ? styles.rowSub : styles.answers}>{row.answers}</span>
        {row.share !== null && (
          <span className={styles.bar} aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${Math.round(row.share * 100)}%` }} />
          </span>
        )}
        {row.closes && <p className={styles.rowSub}>{row.closes}</p>}
      </div>
      <div className={styles.actions}>
        {row.state === "draft" ? (
          <Link href={`${base}/questions`} className={styles.action} aria-label={`${LIST_WORDS.edit} ${row.name}`}>
            {LIST_WORDS.edit}
          </Link>
        ) : (
          <>
            {row.unanswered && (
              <span className={styles.remind}>
                <Link
                  href={`${base}/send`}
                  className={styles.remindButton}
                  aria-label={`Remind people who haven’t answered ${row.name}: opens its Send tab`}
                >
                  {LIST_WORDS.remind}
                </Link>
                <span className={styles.actionNote}>{row.unanswered}</span>
              </span>
            )}
            <Link href={`${base}/results`} className={styles.action} aria-label={`${LIST_WORDS.results} for ${row.name}`}>
              {LIST_WORDS.results}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: ListRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className={styles.group} aria-label={title}>
      <h2 className={styles.groupTitle}>
        {title} <span className={styles.groupCount}>{rows.length}</span>
      </h2>
      {rows.map((row) => (
        <Row key={row.id} row={row} />
      ))}
    </section>
  );
}

/**
 * THE CHECK-INS, one line a programme, each opening on its check-ins: the
 * week, the group and the day, whether it is open, when it closes and how
 * many it reached, each the way to its results. A programme's line says how
 * many it has had.
 */
function CheckIns({ groups }: { groups: readonly CheckInListGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <section className={`${styles.card} ${styles.checkIns}`} aria-labelledby="check-ins">
      <h2 id="check-ins" className={styles.cardTitle}>
        {CHECK_IN_ADMIN_WORDS.listHeading}
      </h2>
      <p className={styles.muted}>{CHECK_IN_ADMIN_WORDS.listLede}</p>
      {groups.map((group) => (
        <details key={group.key} className={styles.checkInGroup}>
          <summary className={styles.checkInSummary}>
            <span className={styles.rowName}>{group.programme}</span>
            <span className={styles.rowSub}>{group.line}</span>
          </summary>
          <ul className={styles.checkInRows}>
            {group.rows.map((row) => (
              <li key={row.id} className={styles.checkInRow}>
                <Link href={`/admin/surveys/${encodeURIComponent(row.id)}/results`} className={styles.rowLink}>
                  {row.label}
                </Link>
                {row.open && (
                  <Chip tone="success" size="sm" dot>
                    {LIST_WORDS.open}
                  </Chip>
                )}
                <span className={styles.rowSub}>{[row.closes, peopleWords(row.reached)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

export default function SurveyList({ view, checkIns = [] }: { view: ListView; checkIns?: readonly CheckInListGroup[] }) {
  const any = view.open.length + view.drafts.length + view.closed.length > 0;
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.table}>
          <div className={styles.tableHead} aria-hidden="true">
            <span>Survey</span>
            <span>Answers</span>
            <span>Actions</span>
          </div>
          {any ? (
            <>
              <Group title={LIST_WORDS.open} rows={view.open} />
              <Group title={LIST_WORDS.drafts} rows={view.drafts} />
              <Group title={LIST_WORDS.closed} rows={view.closed} />
            </>
          ) : (
            <p className={`${styles.muted} ${styles.empty}`}>{LIST_WORDS.empty}</p>
          )}
        </div>
        <CheckIns groups={checkIns} />
      </div>
      <aside className={styles.aside}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{LIST_WORDS.howTitle}</h2>
          <Chip tone="accent" size="sm">
            {LIST_WORDS.confidential}
          </Chip>
          <p className={`${styles.muted} ${styles.spaced}`}>
            {LIST_WORDS.howConfidential}
          </p>
        </section>
      </aside>
    </div>
  );
}
