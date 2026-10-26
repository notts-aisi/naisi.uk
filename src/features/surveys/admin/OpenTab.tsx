import Link from "next/link";
import type { OpenView } from "@/lib/surveys/adminView";
import { OPEN_WORDS, SEND_WORDS } from "@/lib/surveys/words";
import CloseButton from "./CloseButton";
import OpenButton from "./OpenButton";
import styles from "./surveyAdmin.module.css";

/**
 * A leaving survey's Open tab (Q46), where a sent survey has its Send tab.
 * Nobody presses send: before it is open, what opening does, the way to see
 * it as people will and "Open it"; once open, since when, how many it has
 * reached and how many answered, and "Close it now". Beside it, the summary:
 * its size, who it is for, and when names come off.
 */
export default function OpenTab({ surveyId, view }: { surveyId: string; view: OpenView }) {
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={`${styles.card} ${styles.section}`} aria-labelledby="open-it">
          <h2 id="open-it" className={styles.sectionTitle}>
            {view.state === "draft" ? OPEN_WORDS.heading : OPEN_WORDS.reached}
          </h2>
          <p className={styles.lead}>{OPEN_WORDS.how}</p>
          {view.state === "draft" ? (
            <>
              {view.testHref && (
                <p>
                  <Link href={view.testHref} prefetch={false} className={styles.action}>
                    {OPEN_WORDS.see}
                  </Link>
                </p>
              )}
              <p className={styles.muted}>{OPEN_WORDS.fixes}</p>
              <OpenButton surveyId={surveyId} />
            </>
          ) : (
            <>
              <p className={styles.progress}>{view.since}</p>
              <p className={styles.lead}>{view.reached}</p>
            </>
          )}
        </section>
      </div>

      <aside className={styles.aside}>
        <section className={`${styles.card} ${styles.summary}`} aria-labelledby="open-summary">
          <h2 id="open-summary" className={styles.cardTitle}>
            {SEND_WORDS.summary}
          </h2>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{view.summary.name}</span>
            <span className={styles.muted}>{view.summary.size}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{SEND_WORDS.who}</span>
            <span>{view.summary.who}</span>
          </div>
          {view.summary.namesOff && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{SEND_WORDS.namesOff}</span>
              <span>{view.summary.namesOff}</span>
            </div>
          )}
          {view.state === "open" && (
            <div className={styles.summaryItem}>
              <CloseButton surveyId={surveyId} />
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
