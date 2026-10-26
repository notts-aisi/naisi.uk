import type { ReadingList } from "@/lib/courses/leftView";
import { READING_HEADING, READING_NONE, weekHeading } from "@/lib/courses/leavingWords";
import styles from "./Leaving.module.css";
import { ProgrammeBar } from "./Parts";

/**
 * THE READING LIST: every published week's readings, as the person's group
 * reads them, read only, for somebody taking part (somebody who has left is
 * shown the page that says so instead); a reading is a link to where it
 * lives, and a note is its words. Drawn on the server from `loadReadingList`.
 */
export default function ReadingListView({ list }: { list: ReadingList }) {
  return (
    <div className={styles.page}>
      <ProgrammeBar
        backHref={`/learn/${encodeURIComponent(list.runId)}`}
        backLabel={list.name}
        title={READING_HEADING}
      />
      <div className={styles.body}>
        <h1 className={styles.pageTitle}>{READING_HEADING}</h1>
        {list.weeks.length === 0 ? (
          <p className={styles.text}>{READING_NONE}</p>
        ) : (
          <ol className={styles.weekList}>
            {list.weeks.map((week) => (
              <li key={week.weekNumber} className={styles.section}>
                <h2 className={styles.heading}>{weekHeading(week.weekNumber, week.title)}</h2>
                <ul className={styles.panel}>
                  {week.items.map((item) => (
                    <li key={item.id}>
                      <div className={styles.item}>
                        <p className={styles.itemTitle}>
                          {item.href ? (
                            <a href={item.href} className={styles.readingLink} target="_blank" rel="noopener noreferrer">
                              {item.title}
                            </a>
                          ) : (
                            item.title
                          )}
                        </p>
                        {item.meta && <p className={styles.itemMeta}>{item.meta}</p>}
                        {item.body && <p className={styles.itemText}>{item.body}</p>}
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
