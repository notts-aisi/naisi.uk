import type { EmailPreview } from "@/lib/surveys/adminView";
import { SEND_WORDS } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * An email as the Send tab shows it (sv-send-programme): its subject and
 * envelope, then its words, its button and who signs it, written by the same
 * function the send uses. The button here goes nowhere: each person's email
 * carries their own link.
 */
export default function EmailCard({ email }: { email: EmailPreview }) {
  return (
    <article className={styles.email} aria-label={email.subject}>
      <div className={styles.emailHead}>
        <p className={styles.emailSubject}>{email.subject}</p>
        <dl className={styles.envelope}>
          <dt>{SEND_WORDS.from}</dt>
          <dd>{email.from}</dd>
          <dt>{SEND_WORDS.replyTo}</dt>
          <dd>{email.replyTo}</dd>
          <dt>{SEND_WORDS.to}</dt>
          <dd>{email.to}</dd>
          {email.sent && (
            <>
              <dt>{SEND_WORDS.sentAt}</dt>
              <dd>{email.sent}</dd>
            </>
          )}
        </dl>
      </div>
      <div className={styles.emailBody}>
        {email.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <span className={styles.emailButton}>{email.button}</span>
        <p className={styles.emailSign}>{email.signOff.join("\n")}</p>
      </div>
    </article>
  );
}
