import type { AffiliationStatus, StudyChange } from "@/lib/firestore/users";
import { studyChangeWords } from "./studyChangeWords";
import styles from "./MemberItem.module.css";

type Props = {
  /** The person's own changes, newest first, as `normalizeUser` gives them. */
  changes: readonly StudyChange[] | undefined;
  /** What the page calls the person. */
  firstName: string;
  /** Their stored status, which decides what the degree field is called. */
  status: AffiliationStatus | undefined;
};

/**
 * What a member has changed about their own degree or graduation, and what
 * each said before, newest first. It sits in the Profile card on the admin's
 * page for one person, above the fields it is about, and is drawn like the
 * entries in the History card: a record, not a control.
 *
 * It draws nothing for somebody who has changed neither. The words are in
 * `studyChangeWords.ts`, where the unit suite reads them.
 *
 * No directive: it draws what it is given.
 */
export default function StudyChangeNotes({ changes, firstName, status }: Props) {
  const words = studyChangeWords({ changes, firstName, status });
  if (!words) return null;
  return (
    <div className={styles.changes}>
      <p className="meta">Earlier answers</p>
      <p className={styles.changesLead}>{words.lead}</p>
      <ol className={styles.changeList}>
        {words.rows.map((row) => (
          <li key={row.id} className={styles.change}>
            {row.dateTime ? (
              <time className="meta" dateTime={row.dateTime}>
                {row.when}
              </time>
            ) : (
              <span className="meta">No date</span>
            )}
            <span className={styles.changeFacts}>
              {row.facts.map((fact) => (
                <span key={fact.label}>
                  {fact.label} <span className={styles.changeValue}>{fact.value}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
