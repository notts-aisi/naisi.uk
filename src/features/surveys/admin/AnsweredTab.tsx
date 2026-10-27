import type { AnsweredRow } from "@/lib/surveys/adminView";
import ExportButton from "./ExportButton";
import styles from "./surveyAdmin.module.css";

/**
 * Who answered, for admins only: everybody a survey was sent to, by name,
 * whether and when they answered, how, and whether it came after their
 * group first met. Names are here so an admin can remind people and answer a
 * request about someone's answers; nobody else is shown who has answered.
 */
export default function AnsweredTab({
  surveyId,
  rows,
  answered,
  sent,
  heading,
}: {
  surveyId: string;
  rows: AnsweredRow[];
  answered: number;
  sent: number;
  /** The tab's heading, when the survey's own count says more than "of" (a survey after an event's QR code). */
  heading?: string;
}) {
  return (
    <div className={styles.main}>
      <section className={`${styles.card} ${styles.section}`} aria-labelledby="answered-title">
        <h2 id="answered-title" className={styles.sectionTitle}>
          {heading ?? `${answered} of ${sent} have answered`}
        </h2>
        {rows.length === 0 ? (
          <p className={styles.muted}>It hasn’t been sent to anybody yet.</p>
        ) : (
          <div className={styles.peopleScroll}>
            <table className={styles.people}>
              <caption className={styles.srOnlyCaption}>Who it was sent to, and who has answered</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Sent</th>
                  <th scope="col">Answered</th>
                  <th scope="col">How</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.name}</td>
                    <td>{row.sent}</td>
                    <td>{row.answered || "Not yet"}</td>
                    <td>{row.how}</td>
                    <td>{[row.label, row.reminded].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {answered > 0 && <ExportButton surveyId={surveyId} />}
    </div>
  );
}
