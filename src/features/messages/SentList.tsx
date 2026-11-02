import Link from "next/link";
import Chip from "@/components/ui/Chip";
import { INCLUDE_SIGN, LEAVE_OUT_SIGN } from "@/lib/audience/words";
import type { SentPersonView, SentSendView, SentView } from "@/lib/messages/sent";
import { SENT_WORDS, byWords } from "@/lib/messages/words";
import styles from "./messages.module.css";

/**
 * MESSAGES' SENT, drawn on the server from what `loadSent` worked out for
 * the person reading (`src/lib/messages/sent.ts`): the two weeks it covers,
 * then each send, newest first, as a card. A card says when, the subject,
 * what it was and who sent it, a message's tags, how many it reached, and
 * behind See who the names: who was emailed, who was not (with why, for an
 * admin), how many had no account, and who was left out by why.
 *
 * Names and counts only: no address and no account id reach this file. See
 * who is a `<details>`, so it opens without any script and its summary is a
 * 44px target.
 */
export default function SentList({ view }: { view: SentView }) {
  return (
    <div className={styles.sent}>
      <div className={styles.window}>
        <p className={styles.windowWords}>{view.window.words}</p>
        <div className={styles.windowLinks}>
          <Link href={view.window.earlierHref} className={styles.windowLink}>
            {SENT_WORDS.earlier}
          </Link>
          {view.window.laterHref && (
            <Link href={view.window.laterHref} className={styles.windowLink}>
              {SENT_WORDS.later}
            </Link>
          )}
        </div>
      </div>
      {view.capped && <p className={styles.quiet}>{SENT_WORDS.capped}</p>}
      {view.sends.length === 0 ? (
        <section className={styles.card}>
          <p className={styles.quiet}>{view.everything ? SENT_WORDS.nothing : SENT_WORDS.nothingYours}</p>
        </section>
      ) : (
        <ol className={styles.sends}>
          {view.sends.map((send) => (
            <SentCard key={send.key} send={send} />
          ))}
        </ol>
      )}
    </div>
  );
}

const nameWords = (person: SentPersonView) => (person.you ? `${person.name} (${SENT_WORDS.you})` : person.name);

function SentCard({ send }: { send: SentSendView }) {
  const emailed = send.people.filter((person) => person.emailed);
  const notEmailed = send.people.filter((person) => !person.emailed);
  const anybody = send.people.length > 0 || send.noAccount !== null || send.reasons.length > 0;
  return (
    <li className={`${styles.card} ${styles.sendCard}`}>
      {send.at && (
        <p className={styles.sendWhen}>
          <time dateTime={send.at}>{send.when}</time>
        </p>
      )}
      <h2 className={styles.sendSubject}>{send.subject}</h2>
      <p className={styles.sendBy}>
        <Chip tone={send.notice ? "accent" : "neutral"}>{send.what}</Chip>
        <span>{byWords(send.from)}</span>
      </p>
      {send.tags.length > 0 && (
        <ul className={styles.sendTags} aria-label={SENT_WORDS.tagsLabel}>
          {send.tags.map((tag, index) => (
            <li key={`${index}-${tag.label}`} className={tag.sign === "include" ? styles.sendTagIn : styles.sendTagOut}>
              <span aria-hidden="true">{tag.sign === "include" ? INCLUDE_SIGN : LEAVE_OUT_SIGN}</span>
              <span className="visually-hidden">{tag.sign === "include" ? SENT_WORDS.included : SENT_WORDS.leftOut}: </span>
              <span className={styles.sendTagLabel}>{tag.label}</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.sendCounts}>{send.counts}</p>
      {send.cutOff && <p className={styles.noteProblem}>{SENT_WORDS.cutOff}</p>}
      {send.posted && <p className={styles.sendNote}>{SENT_WORDS.posted}</p>}
      {anybody && (
        <details className={styles.who}>
          <summary className={styles.whoSummary}>{SENT_WORDS.seeWho}</summary>
          <div className={styles.whoBody}>
            {emailed.length > 0 && (
              <section aria-label={SENT_WORDS.emailed}>
                <h3 className={styles.whoTitle}>
                  {SENT_WORDS.emailed} ({emailed.length})
                </h3>
                <ul className={styles.names}>
                  {emailed.map((person, index) => (
                    <li key={`${index}-${person.name}`}>{nameWords(person)}</li>
                  ))}
                </ul>
              </section>
            )}
            {notEmailed.length > 0 && (
              <section aria-label={SENT_WORDS.notEmailed}>
                <h3 className={styles.whoTitle}>
                  {SENT_WORDS.notEmailed} ({notEmailed.length})
                </h3>
                <ul className={styles.names}>
                  {notEmailed.map((person, index) => (
                    <li key={`${index}-${person.name}`}>
                      {nameWords(person)}
                      {person.why && <span className={styles.why}>{person.why}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {send.noAccount && <p className={styles.sendNote}>{send.noAccount}</p>}
            {send.reasons.length > 0 && (
              <section aria-label={SENT_WORDS.leftOutTitle}>
                <h3 className={styles.whoTitle}>{SENT_WORDS.leftOutTitle}</h3>
                <table className={styles.reasons}>
                  <thead>
                    <tr>
                      <th scope="col">{SENT_WORDS.why}</th>
                      <th scope="col" className={styles.number}>
                        {SENT_WORDS.people}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {send.reasons.map((each) => (
                      <tr key={each.why}>
                        <td>{each.why}</td>
                        <td className={styles.number}>{each.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </details>
      )}
    </li>
  );
}
