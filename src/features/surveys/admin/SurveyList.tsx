import Link from "next/link";
import Chip from "@/components/ui/Chip";
import type { ListRow, ListView } from "@/lib/surveys/adminView";
import { LIST_WORDS } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * Run NAISI › Surveys, for admins (sv-list): every survey, open, then drafts,
 * then closed, each with how private it is, its answers and when it closes,
 * and the way to its Send tab or its results. Beside it, what "confidential"
 * means.
 *
 * Built from what exists: programme surveys. Event surveys, public numbers
 * and this term in numbers come later, and nothing here offers them.
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

export default function SurveyList({ view }: { view: ListView }) {
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
