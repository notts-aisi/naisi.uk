import {
  CREDIT_ASK,
  CREDIT_CARD_TITLE,
  CREDIT_CHANGE,
  CREDIT_LABEL,
  CREDIT_NONE,
  creditAsLine,
  creditFrom,
  creditPrints,
} from "@/lib/courses/certificates/words";
// The Settings tab's own stylesheet, by the specifier its page's suites know.
import styles from "@/features/applications/editor/ProgrammeSetup.module.css";

/**
 * THE CREDIT LINE ON A PROGRAMME'S SETTINGS (board pr-settings, v20; Zach,
 * Sun 25 Oct: kept on the course): what every certificate of the run's
 * course prints after its weeks, shown here read-only, as a line of its own,
 * with how it prints and where it is changed. The link is offered only to
 * those whose own permissions open the course's page; anybody else is told
 * who can change it.
 *
 * No state and nothing to press here: a Server Component may render it.
 */
export default function CertificateCredit({
  credit,
  courseTitle,
  changeHref,
}: {
  credit: string;
  courseTitle: string;
  /** The course's page, for someone who can change it there; null for anybody else. */
  changeHref: string | null;
}) {
  return (
    <section className={styles.creditCard} aria-labelledby="settings-certificates">
      <h2 id="settings-certificates" className={styles.creditTitle}>
        {CREDIT_CARD_TITLE}
      </h2>
      <p className={styles.creditLabel}>{CREDIT_LABEL}</p>
      <p className={styles.creditLine}>{credit ? creditAsLine(credit) : CREDIT_NONE}</p>
      <p className={styles.creditHint}>
        {credit ? `${creditPrints(credit)} ` : ""}
        {creditFrom(courseTitle)}{" "}
        {changeHref ? (
          <a href={changeHref} className={styles.link}>
            {CREDIT_CHANGE}
          </a>
        ) : (
          CREDIT_ASK
        )}
      </p>
    </section>
  );
}
