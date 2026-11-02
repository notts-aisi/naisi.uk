import type { OpeningView } from "@/lib/surveys/checkIns/adminView";
import { CHECK_IN_ADMIN_WORDS } from "@/lib/surveys/checkIns/words";
import { SEND_WORDS } from "@/lib/surveys/words";
import CloseButton from "./CloseButton";
import styles from "./surveyAdmin.module.css";

/**
 * A check-in's Opening tab, where a sent survey has its Send tab: nobody sends
 * a check-in from here. Its group's facilitator opened it from the register,
 * for the people marked there, and it closes by itself. This says who opened
 * it, when and for how many, how many more were marked there after it opened
 * (each reached with no email), and when it closes; while it is open an admin
 * can close it now. Beside it, when names come off.
 */
export default function OpeningTab({ surveyId, view }: { surveyId: string; view: OpeningView }) {
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <section className={`${styles.card} ${styles.section}`} aria-labelledby="opening">
          <h2 id="opening" className={styles.sectionTitle}>
            {CHECK_IN_ADMIN_WORDS.opened}
          </h2>
          <p className={styles.lead}>{view.opened}</p>
          {view.joined.map((line, at) => (
            <p key={at} className={styles.muted}>
              {line}
            </p>
          ))}
          <p className={styles.muted}>{CHECK_IN_ADMIN_WORDS.fixed}</p>
        </section>
      </div>

      <aside className={styles.aside}>
        <section className={`${styles.card} ${styles.summary}`} aria-labelledby="opening-summary">
          <h2 id="opening-summary" className={styles.cardTitle}>
            {SEND_WORDS.summary}
          </h2>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{view.programme}</span>
          </div>
          {view.closes && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{view.closes.label}</span>
              <span>{view.closes.value}</span>
            </div>
          )}
          {view.namesOff && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{SEND_WORDS.namesOff}</span>
              <span>{view.namesOff}</span>
            </div>
          )}
          {view.open && (
            <div className={styles.summaryItem}>
              <CloseButton surveyId={surveyId} />
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
