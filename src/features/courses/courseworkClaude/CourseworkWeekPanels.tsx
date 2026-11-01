import Link from "next/link";
import tab from "@/features/courses/coursework/coursework.module.css";
import { filterHref, type CourseworkFilter, type CourseworkViewer } from "@/lib/courses/coursework/model";
import { WEEK_PANELS_WORDS } from "@/lib/courses/coursework/claudeWords";
import { weekColumnWords, weekHeadingWords } from "@/lib/courses/coursework/words";
import { weekDocId } from "@/lib/firestore/courses";
import BestAnswersPanel from "./BestAnswersPanel";
import PangramWeek from "./PangramWeek";
import styles from "./CourseworkClaude.module.css";

/**
 * UNDER THE COURSEWORK TAB'S TABLE (privacy v13), FOR AN ADMIN ALONE: one
 * week at a time, chosen by plain links (`?week=3`, which keep the table's
 * filters, as the filters keep the week), then Claude's best answers to that
 * week and Pangram on it. The programme's lead may open the tab but is drawn
 * none of this (privacy v15: what Claude returns is seen by admins only), and
 * both panels' routes turn the lead away too.
 *
 * A server component handing its panels data only: the programme's ids, the
 * week's id, the address each person's page sits under and, for Pangram, the
 * tab's names. Each panel asks its own route what was found, which sends
 * nothing; Claude and Pangram are asked only on a press.
 */

type Props = {
  roundId: string;
  programmeId: string;
  /** The tab's address; each person's page is `<base>/<uid>`. */
  base: string;
  filter: CourseworkFilter;
  columns: ReadonlyArray<{ weekNumber: number; title: string }>;
  week: { weekNumber: number; asked: boolean };
  viewer: CourseworkViewer;
  /** Every row's name by account: handed to Pangram's panel alone, so to an admin alone. */
  names: Readonly<Record<string, string>>;
};

export default function CourseworkWeekPanels({ roundId, programmeId, base, filter, columns, week, viewer, names }: Props) {
  if (viewer !== "admin") return null;
  const column = columns.find((candidate) => candidate.weekNumber === week.weekNumber);
  if (!column) return null;
  const weekId = weekDocId(column.weekNumber);
  const titleId = "coursework-week-panels";
  return (
    <section className={styles.weekPanels} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.weekPanelsTitle}>
        {weekHeadingWords(column.weekNumber, column.title)}
      </h2>
      {columns.length > 1 && (
        <nav aria-label={WEEK_PANELS_WORDS.nav}>
          <ul className={styles.weekLinks}>
            {columns.map((candidate) => {
              const on = candidate.weekNumber === column.weekNumber;
              return (
                <li key={candidate.weekNumber}>
                  <Link
                    href={filterHref(base, filter, candidate.weekNumber)}
                    className={on ? `${tab.filter} ${tab.filterOn}` : tab.filter}
                    aria-current={on ? "page" : undefined}
                  >
                    {weekColumnWords(candidate.weekNumber)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className={styles.panelColumns}>
        <div className={styles.card}>
          <BestAnswersPanel key={weekId} roundId={roundId} programmeId={programmeId} weekId={weekId} personBase={base} />
        </div>
        <div className={styles.card}>
          <PangramWeek key={weekId} roundId={roundId} programmeId={programmeId} weekId={weekId} names={names} personBase={base} />
        </div>
      </div>
    </section>
  );
}
