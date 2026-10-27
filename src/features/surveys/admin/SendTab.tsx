import type { SendView } from "@/lib/surveys/adminView";
import { REFUSAL, SEND_WORDS, TAB_WORDS } from "@/lib/surveys/words";
import CloseButton from "./CloseButton";
import EmailCard from "./EmailCard";
import SendActions from "./SendActions";
import styles from "./surveyAdmin.module.css";

/**
 * The Send tab (sv-send-programme). Before the first send: the email as it
 * will go, "Send a test to me" and "Email 30 people". After it: what went and
 * when, "20 of 32 have answered", the people who joined since and the button
 * that sends it to them, and the reminder with its own test and button. Every
 * button says how many people it reaches.
 *
 * Beside it, the summary: the survey's size, who it is for, when it closes
 * and when names come off.
 */
export default function SendTab({ surveyId, view }: { surveyId: string; view: SendView }) {
  const blocked = view.gone ? REFUSAL.formGone : view.noAddress ? REFUSAL.noAddress : "";
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {view.first && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-first">
            <h2 id="send-first" className={styles.sectionTitle}>
              {TAB_WORDS.send}
            </h2>
            {view.first.email ? <EmailCard email={view.first.email} /> : <p className={styles.muted}>{REFUSAL.closesPast}</p>}
            <SendActions
              surveyId={surveyId}
              kind="first"
              emails={view.first.emails}
              testFresh={view.first.test.fresh}
              testLine={view.first.test.line}
              blocked={blocked}
            />
          </section>
        )}

        {view.log.length > 0 && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-sent">
            <h2 id="send-sent" className={styles.sectionTitle}>
              {SEND_WORDS.sent}
            </h2>
            <div>
              {view.log.map((entry, index) => (
                <div key={index} className={styles.logRow}>
                  <span className={styles.logWhen}>{entry.at}</span>
                  <div className={styles.section}>
                    <p className={styles.logLine}>{entry.line}</p>
                    {entry.email && (
                      <details>
                        <summary className={styles.toggle}>{SEND_WORDS.seeEmail}</summary>
                        <EmailCard email={entry.email} />
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {view.progress && (
              <div>
                <p className={styles.progress}>{view.progress}</p>
                <span className={styles.bar} aria-hidden="true">
                  <span className={styles.barFill} style={{ width: `${Math.round(view.share * 100)}%` }} />
                </span>
              </div>
            )}
          </section>
        )}

        {view.joined && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-joined">
            <h2 id="send-joined" className={styles.sectionTitle}>
              {view.joined.heading}
            </h2>
            {view.joined.emails === 0 ? (
              <p className={`${styles.muted} ${styles.dashed}`}>{view.joined.nobody}</p>
            ) : (
              <>
                <p className={styles.lead}>{view.joined.names.join(", ")}</p>
                <SendActions surveyId={surveyId} kind="joined" audienceKind={view.audienceKind} emails={view.joined.emails} testFresh testLine="" blocked={blocked} />
              </>
            )}
          </section>
        )}

        {view.remind && (
          <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-remind">
            <h2 id="send-remind" className={styles.sectionTitle}>
              {SEND_WORDS.remind}
            </h2>
            <p className={styles.lead}>{view.remind.lead}</p>
            {view.remind.emails > 0 && (
              <>
                {view.remind.email && <EmailCard email={view.remind.email} />}
                <SendActions
                  surveyId={surveyId}
                  kind="remind"
                  emails={view.remind.emails}
                  testFresh={view.remind.test.fresh}
                  testLine={view.remind.test.line}
                  blocked={blocked}
                />
                <p className={styles.note}>{SEND_WORDS.remindersGoTo}</p>
              </>
            )}
          </section>
        )}
      </div>

      <aside className={styles.aside}>
        <section className={`${styles.card} ${styles.summary}`} aria-labelledby="send-summary">
          <h2 id="send-summary" className={styles.cardTitle}>
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
          {view.summary.closes && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{view.summary.closes.label}</span>
              <span>{view.summary.closes.value}</span>
            </div>
          )}
          {view.summary.namesOff && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{SEND_WORDS.namesOff}</span>
              <span>{view.summary.namesOff}</span>
            </div>
          )}
          {view.summary.labelled && (
            <div className={styles.summaryItem}>
              <span className={styles.muted}>{SEND_WORDS.labelled}</span>
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
