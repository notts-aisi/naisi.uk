import type { OwnNotes } from "@/lib/courses/leftView";
import {
  NOTES_HEADING,
  NOTES_NONE,
  YOUR_COMMENT,
  YOUR_NOTE,
  ratedWords,
  weekHeading,
} from "@/lib/courses/leavingWords";
import styles from "./Leaving.module.css";
import { ProgrammeBar } from "./Parts";

/**
 * THEIR NOTES AND REFLECTIONS: what the person wrote on the programme's
 * readings (a star rating, a comment for the run, a note of their own), week
 * by week, read only. Nobody else's words are on it. Drawn on the server from
 * `loadOwnNotes`.
 */
export default function OwnNotesView({ notes }: { notes: OwnNotes }) {
  return (
    <div className={styles.page}>
      <ProgrammeBar
        backHref={`/learn/${encodeURIComponent(notes.runId)}`}
        backLabel={notes.name}
        title={NOTES_HEADING}
      />
      <div className={styles.body}>
        <h1 className={styles.pageTitle}>{NOTES_HEADING}</h1>
        {notes.weeks.length === 0 ? (
          <p className={styles.text}>{NOTES_NONE}</p>
        ) : (
          <ol className={styles.weekList}>
            {notes.weeks.map((week) => (
              <li key={week.weekNumber} className={styles.section}>
                <h2 className={styles.heading}>{weekHeading(week.weekNumber, week.title)}</h2>
                <ul className={styles.panel}>
                  {week.items.map((item) => (
                    <li key={item.id}>
                      <div className={styles.item}>
                        <p className={styles.itemTitle}>{item.title}</p>
                        {item.rating !== null && <p className={styles.itemMeta}>{ratedWords(item.rating)}</p>}
                        {item.comment && (
                          <p className={styles.itemText}>
                            <span className={styles.itemLabel}>{YOUR_COMMENT}:</span> {item.comment}
                          </p>
                        )}
                        {item.note && (
                          <p className={styles.itemText}>
                            <span className={styles.itemLabel}>{YOUR_NOTE}:</span> {item.note}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
