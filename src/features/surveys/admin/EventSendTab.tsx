import Chip from "@/components/ui/Chip";
import { QrCode } from "@/features/qr/QrCode";
import { shortLinkUrl } from "@/lib/qr/shortLinkCode";
import type { EventSendView } from "@/lib/surveys/events/adminView";
import { SEND_TAB_WORDS, joinedButtonFor } from "@/lib/surveys/events/words";
import { REFUSAL, SEND_WORDS } from "@/lib/surveys/words";
import CloseButton from "./CloseButton";
import EmailCard from "./EmailCard";
import EventEmailChoice from "./EventEmailChoice";
import SendActions from "./SendActions";
import SurveyCodeCard from "./SurveyCodeCard";
import styles from "./surveyAdmin.module.css";
import eventStyles from "./eventSurvey.module.css";

/**
 * The Send tab of a survey after an event (sv-send), in three steps: who
 * answers (the event, and who its email goes to), the QR code at the event,
 * and the email. Before the email goes, the choice of who it reaches and,
 * after the email, "Email 14 people"; after it, what went and when, the
 * people who came since and the reminder. Every button says how many people
 * it reaches.
 *
 * Beside it, the summary: its size, the code at the event, the email, when
 * it closes, who reads the results and when names come off.
 */
export default function EventSendTab({ surveyId, view }: { surveyId: string; view: EventSendView }) {
  const blocked = view.gone ? SEND_TAB_WORDS.eventGone : view.noAddress ? REFUSAL.noAddress : "";
  const code = (
    <SurveyCodeCard
      surveyId={surveyId}
      code={view.code}
      qr={view.code ? <QrCode text={shortLinkUrl(view.code.slug)} label={`QR code for ${view.code.address}`} /> : null}
      openSince={view.openSince}
      answers={view.qrAnswers}
      canOpen={view.state === "draft" && view.summary.closes !== null && !view.gone}
    />
  );
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {view.choices && view.choices.length > 0 ? (
          <EventEmailChoice
            surveyId={surveyId}
            eventLine={view.eventLine}
            choices={view.choices}
            initial={view.audience}
            testFresh={view.test.fresh}
            testLine={view.test.line}
            blocked={blocked}
            between={
              <>
                {code}
                <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-email">
                  <h2 id="send-email" className={`${styles.sectionTitle} ${eventStyles.step}`}>
                    <span className={eventStyles.stepNumber} aria-hidden="true">
                      3
                    </span>
                    {SEND_TAB_WORDS.emailHeading}
                  </h2>
                  {view.email ? <EmailCard email={view.email} /> : <p className={styles.muted}>{REFUSAL.closesPast}</p>}
                  <p className={styles.muted}>{SEND_TAB_WORDS.linkLine}</p>
                  {view.summary.closes && (
                    <p>
                      <span className={styles.summaryLabel}>{view.summary.closes.label}</span> {view.summary.closes.value}
                    </p>
                  )}
                  <p className={styles.muted}>{SEND_TAB_WORDS.noReminders}</p>
                </section>
              </>
            }
          />
        ) : (
          <>
            <section className={`${styles.card} ${styles.section}`} aria-labelledby="send-who">
              <h2 id="send-who" className={`${styles.sectionTitle} ${eventStyles.step}`}>
                <span className={eventStyles.stepNumber} aria-hidden="true">
                  1
                </span>
                {SEND_TAB_WORDS.whoHeading}
              </h2>
              <p className={styles.lead}>
                <strong>{SEND_TAB_WORDS.who}</strong> {SEND_TAB_WORDS.whoLine}
              </p>
              <p className={styles.muted}>
                {SEND_TAB_WORDS.event}: {view.eventLine}
              </p>
              {view.log.length > 0 && <p className={styles.muted}>{SEND_TAB_WORDS.emailed(view.audience)}</p>}
            </section>
            {code}
          </>
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
              {view.audience === "event-came" ? "Came since" : view.audience === "event-signups" ? "Signed up since" : "With a place since"}
            </h2>
            {view.joined.emails === 0 ? (
              <p className={`${styles.muted} ${styles.dashed}`}>{view.joined.nobody}</p>
            ) : (
              <>
                <p className={styles.lead}>{view.joined.names.join(", ")}</p>
                <SendActions
                  surveyId={surveyId}
                  kind="joined"
                  emails={view.joined.emails}
                  testFresh
                  testLine=""
                  blocked={blocked}
                  sendLabel={joinedButtonFor(view.audience, view.joined.emails)}
                />
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
            <span>
              <Chip tone="accent" size="sm">
                Confidential
              </Chip>
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{SEND_TAB_WORDS.atEvent}</span>
            <span>{view.summary.atEvent}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{SEND_TAB_WORDS.byEmail}</span>
            <span>{view.summary.byEmail}</span>
          </div>
          {view.summary.closes && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>{view.summary.closes.label}</span>
              <span>{view.summary.closes.value}</span>
            </div>
          )}
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>{SEND_TAB_WORDS.results}</span>
            <span>{view.summary.results}</span>
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
