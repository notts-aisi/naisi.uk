import Link from "next/link";
import type { CourseworkTabView } from "@/lib/courses/coursework/tabLoad";
import type { WaitingRow } from "@/lib/courses/coursework/overview";
import {
  COURSEWORK_SHOWS,
  NOT_IN_A_GROUP,
  cellStateOf,
  filterHref,
  type CellState,
  type CourseworkCell,
  type CourseworkRow,
  type CourseworkSection,
} from "@/lib/courses/coursework/model";
import {
  ALL_GROUPS,
  CHANGED_SINCE_FEEDBACK,
  COURSEWORK,
  DONE,
  FACILITATING,
  GROUP,
  KEY,
  NAME,
  NOBODY_HERE,
  NOT_IN_A_GROUP_YET,
  NOT_READ_YET,
  NOT_STARTED,
  NOT_TOLD_YET,
  NOTHING_WAITING,
  NO_BLOCK_WEEKS,
  NO_COURSEWORK,
  READ,
  READ_ONE_QUESTION,
  SHOW,
  SHOW_WORDS,
  STARTED,
  WAITING_FOR_FEEDBACK,
  WAITING_LINE,
  WAITING_TITLE,
  WEEKS,
  cellLabelWords,
  cellStateWords,
  courseworkSummaryWords,
  courseworkWhoLine,
  nextWeekWords,
  nobodyHoldsWords,
  previousWeekWords,
  readAnswerLabelWords,
  showAllWords,
  waitingChangedWords,
  waitingNotSentWords,
  waitingSentWords,
  weekColumnWords,
  writtenAnswerOfWeekWords,
} from "@/lib/courses/coursework/words";
import { DONE_LATE, JOINED_LATE, lateAfterSessionWords } from "@/lib/courses/weekWork/words";
import styles from "./coursework.module.css";

/**
 * A PROGRAMME'S COURSEWORK TAB (Zach, Fri 30 Oct; redrawn Fri 13 Nov 2026),
 * for its lead and admins: a row per person holding a place (in a group or not
 * yet) and per facilitator, marked as facilitating, grouped by group with each
 * group's facilitators named; a column per week of the run written as blocks.
 *
 * A CELL SAYS ONE THING, IN WORDS (`cellStateOf`): Done, Done on time or Done
 * late (with how late), Started, Not started, Joined late, or the day a week
 * not begun yet opens. Beside it, for a reader who may read the person's work,
 * up to three flags, each only where it is true: Not read yet, No feedback
 * yet, Changed since feedback. Never a word anybody wrote, never a count. The
 * whole cell opens the reading view of that person's week; the name opens the
 * person's page.
 *
 * FILTERS, one at a time, each with its count of the chosen group's people,
 * and the group's own links beside them; "Read one question" opens the page of
 * one question across the chosen group on the week the tab is on. A key to
 * the words, then the table; at phone width the table gives way to one week at
 * a time, as a list of people with a way to the week before and after. Under
 * it, the one list of written answers waiting for this reader's feedback,
 * oldest first.
 *
 * A server component: every filter, week and the whole list are plain links,
 * so the tab works before any script arrives. Handed the loader's view and
 * nothing else (`loadCourseworkTab`): names, states, flags and addresses.
 */

/** Each state's chip, by its tone: words carry the meaning, the colour only repeats it. */
const STATE_CLASS: Record<CellState, string> = {
  "no-coursework": styles.quiet,
  done: styles.doneChip,
  "done-on-time": styles.doneChip,
  "done-late": styles.lateChip,
  "joined-late": styles.joinedChip,
  opens: styles.quiet,
  started: styles.startedChip,
  "not-started": styles.notStartedChip,
};

/** What a cell says, in order: its state, how late, then its flags. */
function cellWordsOf(cell: CourseworkCell, now: Date): Array<{ key: string; words: string; className: string }> {
  const state = cellStateOf(cell, now);
  const out = [{ key: "state", words: cellStateWords(state, cell.opensOn), className: STATE_CLASS[state] }];
  if (state === "done-late" && cell.doneLateMs !== null) out.push({ key: "late", words: lateAfterSessionWords(cell.doneLateMs), className: styles.lateBy });
  if (cell.flags.unread) out.push({ key: "unread", words: NOT_READ_YET, className: styles.unreadChip });
  if (cell.flags.noFeedback) out.push({ key: "nofeedback", words: WAITING_FOR_FEEDBACK, className: styles.waitingChip });
  if (cell.flags.changed) out.push({ key: "changed", words: CHANGED_SINCE_FEEDBACK, className: styles.changedChip });
  return out;
}

/** One person's week: the whole of it opens the reading view of that week. */
function Cell({ cell, name, now }: { cell: CourseworkCell; name: string; now: Date }) {
  if (!cell.counted) return <span className={styles.quiet}>{NO_COURSEWORK}</span>;
  const said = cellWordsOf(cell, now);
  return (
    <Link href={cell.href} className={styles.cellLink} aria-label={cellLabelWords(name, cell.weekNumber, said.map((each) => each.words))}>
      {said.map((each) => (
        <span key={each.key} className={each.className}>
          {each.words}
        </span>
      ))}
    </Link>
  );
}

/** A row's marks, in words: facilitating a group of the run, and, to an admin, placed and not told yet. */
function marksOf(row: CourseworkRow): string[] {
  return [...(row.facilitating ? [FACILITATING] : []), ...(row.notToldYet ? [NOT_TOLD_YET] : [])];
}

/** A row's marks, drawn as chips beside the name. */
function Marks({ row }: { row: CourseworkRow }) {
  const marks = marksOf(row);
  if (marks.length === 0) return null;
  return (
    <span className={styles.marks}>
      {marks.map((mark) => (
        <span key={mark} className={styles.chip}>
          {mark}
        </span>
      ))}
    </span>
  );
}

/** A section's head: "Group A · Ella Brooks", and how many it holds. */
function SectionTitle({ section }: { section: CourseworkSection }) {
  return (
    <span className={styles.sectionHeadInner}>
      <span>{section.title}</span>
      {section.facilitators.length > 0 && <span className={styles.sectionFacilitators}>· {section.facilitators.join(", ")}</span>}
      <span className={styles.sectionCount}>{section.rows.length}</span>
    </span>
  );
}

/** The wide view: every week a column, scrolling inside its own card. */
function Table({ view, now }: { view: CourseworkTabView; now: Date }) {
  return (
    <section className={`${styles.card} ${styles.wide}`}>
      {/* The weeks scroll inside the card, never the page; a keyboard can scroll it too. The
          scroll is the one region named Coursework: a second of the same name around it is
          announced twice and is ambiguous to anybody finding the table by its name. */}
      <div className={styles.scroll} role="region" aria-label={COURSEWORK} tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={`${styles.th} ${styles.nameCol}`}>
                {NAME}
              </th>
              {view.columns.map((column) => (
                <th key={column.weekNumber} scope="col" className={styles.th}>
                  {weekColumnWords(column.weekNumber)}
                  {column.title && <span className={styles.thTitle}>{column.title}</span>}
                </th>
              ))}
            </tr>
          </thead>
          {view.sections.map((section) => (
            <tbody key={section.key}>
              <tr>
                <th scope="colgroup" colSpan={view.columns.length + 1} className={styles.sectionHead}>
                  <SectionTitle section={section} />
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.uid}>
                  <th scope="row" className={`${styles.rowHead} ${styles.nameCol}`}>
                    <Link href={row.href} className={styles.person}>
                      {row.name}
                    </Link>
                    <Marks row={row} />
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.weekNumber} className={styles.td}>
                      <Cell cell={cell} name={row.name} now={now} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/** At phone width: the week the tab is on, as a list of its people, with the week before and after. */
function OneWeek({ view, now, weekHref }: { view: CourseworkTabView; now: Date; weekHref: (weekNumber: number) => string }) {
  const week = view.week;
  if (!week) return null;
  const at = view.columns.findIndex((column) => column.weekNumber === week.weekNumber);
  const previous = at > 0 ? view.columns[at - 1] : null;
  const next = at >= 0 && at < view.columns.length - 1 ? view.columns[at + 1] : null;
  return (
    <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="coursework-week">
      <div className={styles.weekHead}>
        <h2 id="coursework-week" className={styles.phoneWeekTitle}>
          {weekColumnWords(week.weekNumber)}
        </h2>
        <nav aria-label={WEEKS} className={styles.weekSteps}>
          {previous && (
            <Link href={weekHref(previous.weekNumber)} className={styles.step}>
              {previousWeekWords(previous.weekNumber)}
            </Link>
          )}
          {next && (
            <Link href={weekHref(next.weekNumber)} className={styles.step}>
              {nextWeekWords(next.weekNumber)}
            </Link>
          )}
        </nav>
      </div>
      {view.sections.map((section) => (
        <div key={section.key} className={styles.phoneSection}>
          <h3 className={styles.phoneSectionTitle}>
            <SectionTitle section={section} />
          </h3>
          <ul className={styles.people}>
            {section.rows.map((row) => {
              const cell = row.cells.find((each) => each.weekNumber === week.weekNumber);
              return (
                <li key={row.uid} className={styles.personRow}>
                  {cell && cell.counted ? (
                    <Link
                      href={cell.href}
                      className={styles.personLink}
                      // The label stands in for everything inside the link, so it says the row's marks as well as the cell's words.
                      aria-label={cellLabelWords(row.name, cell.weekNumber, [...marksOf(row), ...cellWordsOf(cell, now).map((each) => each.words)])}
                    >
                      <span className={styles.personName}>{row.name}</span>
                      <Marks row={row} />
                      <span className={styles.personWords}>
                        {cellWordsOf(cell, now).map((each) => (
                          <span key={each.key} className={each.className}>
                            {each.words}
                          </span>
                        ))}
                      </span>
                    </Link>
                  ) : (
                    <span className={styles.personLink}>
                      <span className={styles.personName}>{row.name}</span>
                      <span className={styles.quiet}>{NO_COURSEWORK}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** When an answer on the list was sent, never sent, or changed. */
function waitingWhenWords(row: WaitingRow): string | null {
  if (!row.at) return null;
  const at = new Date(row.at);
  if (row.kind === "changed") return waitingChangedWords(at);
  return row.notSent ? waitingNotSentWords(at) : waitingSentWords(at, row.late);
}

/** Every written answer waiting for this reader's feedback, oldest first. */
function Waiting({ view }: { view: CourseworkTabView }) {
  const { rows, total, allHref } = view.waiting;
  return (
    <section className={styles.waiting} aria-labelledby="coursework-waiting">
      <div className={styles.waitingHead}>
        <h2 id="coursework-waiting" className={styles.waitingTitle}>
          {WAITING_TITLE}
        </h2>
        <p className={styles.waitingLine}>{WAITING_LINE}</p>
      </div>
      {rows.length === 0 ? (
        <p className={styles.waitingNone}>{NOTHING_WAITING}</p>
      ) : (
        <ul className={styles.waitingList}>
          {rows.map((row) => {
            const when = waitingWhenWords(row);
            return (
              <li key={`${row.uid} ${row.weekNumber}`} className={styles.waitingRow}>
                <div className={styles.waitingText}>
                  <p className={styles.waitingWho}>
                    <Link href={row.personHref} className={styles.waitingName}>
                      {row.name}
                    </Link>{" "}
                    · {writtenAnswerOfWeekWords(row.weekNumber)}
                  </p>
                  <p className={styles.waitingMeta}>
                    {when && <span>{when}</span>}
                    {row.unread && <span className={styles.unreadChip}>{NOT_READ_YET}</span>}
                  </p>
                </div>
                <Link href={row.readHref} className={styles.readLink} aria-label={readAnswerLabelWords(row.name, row.weekNumber)}>
                  {READ}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {allHref && (
        <Link href={allHref} className={styles.showAll}>
          {showAllWords(total)}
        </Link>
      )}
    </section>
  );
}

/** The key to the cells' words, and the three flags. */
const LEGEND: Array<{ words: string; className: string }> = [
  { words: DONE, className: styles.doneChip },
  { words: DONE_LATE, className: styles.lateChip },
  { words: STARTED, className: styles.startedChip },
  { words: NOT_STARTED, className: styles.notStartedChip },
  { words: JOINED_LATE, className: styles.joinedChip },
  { words: NOT_READ_YET, className: styles.unreadChip },
  { words: WAITING_FOR_FEEDBACK, className: styles.waitingChip },
  { words: CHANGED_SINCE_FEEDBACK, className: styles.changedChip },
];

export default function CourseworkTable({ view, base }: { view: CourseworkTabView; base: string }) {
  const now = new Date();
  // The week the address chose, kept by every filter; none when it chose none.
  const week = view.week?.asked ? view.week.weekNumber : null;
  const lead = view.viewer === "lead" ? { firstName: "", isReader: true } : view.leadFirstName ? { firstName: view.leadFirstName, isReader: false } : null;
  const groupFilters = [
    { key: "all", label: ALL_GROUPS },
    ...view.groups.map((group) => ({ key: group.id, label: group.name })),
    { key: NOT_IN_A_GROUP, label: NOT_IN_A_GROUP_YET },
  ];
  const nobody = view.counts.holding === 0 && view.counts.facilitating === 0;
  return (
    <div className={styles.page}>
      <p className={styles.sentence}>{courseworkSummaryWords(view.counts.holding, view.counts.facilitating, view.counts.waiting)}</p>
      <p className={styles.sentence}>{courseworkWhoLine(lead)}</p>
      <div className={styles.bar}>
        <nav aria-label={SHOW} className={styles.showsNav}>
          <ul className={styles.shows}>
            {COURSEWORK_SHOWS.map((show) => {
              const on = view.filter.show === show;
              return (
                <li key={show}>
                  <Link
                    href={filterHref(base, { ...view.filter, show }, week)}
                    className={on ? `${styles.show} ${styles.showOn}` : styles.show}
                    aria-current={on ? "page" : undefined}
                  >
                    {SHOW_WORDS[show]} <span className={styles.count}>{view.showCounts[show]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {view.questionHref && (
          <Link href={view.questionHref} className={styles.action}>
            {READ_ONE_QUESTION}
          </Link>
        )}
      </div>
      <nav aria-label={GROUP} className={styles.groupsNav}>
        <p className={styles.groupLabel} aria-hidden="true">
          {GROUP}
        </p>
        <ul className={styles.filters}>
          {groupFilters.map((filter) => {
            const on = view.filter.group === filter.key;
            return (
              <li key={filter.key}>
                <Link
                  href={filterHref(base, { ...view.filter, group: filter.key }, week)}
                  className={on ? `${styles.filter} ${styles.filterOn}` : styles.filter}
                  aria-current={on ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {nobody ? (
        <p className={styles.empty}>{nobodyHoldsWords(view.programmeName)}</p>
      ) : view.columns.length === 0 ? (
        <p className={styles.empty}>{NO_BLOCK_WEEKS}</p>
      ) : (
        <>
          <ul className={styles.legend} aria-label={KEY}>
            {LEGEND.map((entry) => (
              <li key={entry.words} className={entry.className}>
                {entry.words}
              </li>
            ))}
          </ul>
          {view.sections.length === 0 ? (
            <p className={styles.empty}>{NOBODY_HERE}</p>
          ) : (
            <>
              <Table view={view} now={now} />
              <OneWeek view={view} now={now} weekHref={(weekNumber) => filterHref(base, view.filter, weekNumber)} />
            </>
          )}
          <Waiting view={view} />
        </>
      )}
    </div>
  );
}
