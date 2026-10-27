import { printablesPdfPath } from "@/lib/courses/facilitatorGuide/printables";
import {
  ALL_THE_PRINTABLES,
  NOTHING_TO_PRINT,
  PRINT_CARD_LINE,
  PRINT_CARD_TITLE,
  WHOLE_DOCUMENT_PDF,
  downloadSessionPrintablesWords,
  sessionWords,
  thingsToPrintWords,
} from "@/lib/courses/facilitatorGuide/words";
import styles from "./guide.module.css";

/**
 * THE WAYS TO A COURSE'S PRINTABLES AS PDFs: the card on the printables page
 * (one download a session, then the whole document) and the link on a week's
 * page, beside its session plan.
 *
 * Each is a plain link to the PDF route, never a client-side navigation: the
 * route answers with a file to save, which the browser downloads where the
 * reader is. A session with nothing to print is said, never linked, so no
 * link leads to nothing. Drawn on the server, only by pages behind the
 * guide's gate, from counts and numbers: nothing here reads a document.
 */

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={styles.rowArrow}>
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

/** One session's row: how many sections of the printables its PDF carries. */
export type SessionPrintables = { session: number; sections: number };

/** The printables page's card: a download for each session, then the whole document. */
export function PrintablesCard({ courseId, sessions }: { courseId: string; sessions: readonly SessionPrintables[] }) {
  return (
    <section className={`${styles.card} ${styles.downloads}`} aria-labelledby="printables-downloads">
      <h2 id="printables-downloads" className={styles.cardTitle}>
        {PRINT_CARD_TITLE}
      </h2>
      <p className={styles.cardLine}>{PRINT_CARD_LINE}</p>
      <ul className={styles.rows}>
        {sessions.map(({ session, sections }) => (
          <li key={session}>
            {sections > 0 ? (
              <a href={printablesPdfPath(courseId, session)} className={styles.row}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{sessionWords(session)}</span>
                  <span className={styles.rowDetail}>{thingsToPrintWords(sections)}</span>
                </span>
                <DownloadIcon />
              </a>
            ) : (
              <div className={`${styles.row} ${styles.rowQuiet}`}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{sessionWords(session)}</span>
                  <span className={styles.rowDetail}>{NOTHING_TO_PRINT}</span>
                </span>
              </div>
            )}
          </li>
        ))}
        <li>
          <a href={printablesPdfPath(courseId, null)} className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{ALL_THE_PRINTABLES}</span>
              <span className={styles.rowDetail}>{WHOLE_DOCUMENT_PDF}</span>
            </span>
            <DownloadIcon />
          </a>
        </li>
      </ul>
    </section>
  );
}

/** A week's page: that session's printables, beside its session plan. */
export function PrintablesLink({ courseId, session }: { courseId: string; session: number }) {
  return (
    <p className={styles.printLine}>
      <a href={printablesPdfPath(courseId, session)} className={styles.printLink}>
        <DownloadIcon />
        <span>{downloadSessionPrintablesWords(session)}</span>
      </a>
    </p>
  );
}
