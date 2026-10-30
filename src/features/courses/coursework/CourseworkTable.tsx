import Link from "next/link";
import type { CourseworkTabView } from "@/lib/courses/coursework/load";
import { NOT_IN_A_GROUP, filterHref, type CourseworkCell, type CourseworkRow } from "@/lib/courses/coursework/model";
import {
  ANSWER_STATE_WORDS,
  COURSEWORK,
  EVERYBODY,
  FACILITATING,
  NAME,
  NOBODY_HERE,
  NOT_IN_A_GROUP_YET,
  NOT_TOLD_YET,
  NO_BLOCK_WEEKS,
  NO_COURSEWORK,
  SHOW,
  WAITING_FOR_FEEDBACK,
  answerLinkLabelWords,
  boxesCellWords,
  cellLinkLabelWords,
  courseworkSummaryWords,
  courseworkWhoLine,
  nobodyHoldsWords,
  reflectionsCellWords,
  ticksCellWords,
  weekColumnWords,
} from "@/lib/courses/coursework/words";
import styles from "./coursework.module.css";

/**
 * A PROGRAMME'S COURSEWORK TAB (Zach, Fri 30 Oct), for its lead and admins:
 * a row per person holding a place (in a group or not yet) and per
 * facilitator, marked as facilitating; a column per week of the run written
 * as blocks. A cell says, in counts, what the person did in the week they
 * read, never a word they wrote: reflections written, sources ticked, where
 * the written answer stands (waiting for feedback stands out, and opens the
 * feedback page) and boxes filled in. The rest of a cell, and the name, open
 * the person's page.
 *
 * A server component: the filters are plain links, so the tab works before
 * any script arrives. Handed the loader's view and nothing else
 * (`loadCourseworkTab`): names, counts, states and addresses.
 */

function Cell({ cell, name }: { cell: CourseworkCell; name: string }) {
  if (!cell.counted) return <span className={styles.muted}>{NO_COURSEWORK}</span>;
  const counts: Array<{ key: string; words: string; full: boolean }> = [];
  if (cell.reflections) counts.push({ key: "r", words: reflectionsCellWords(cell.reflections.written, cell.reflections.of), full: cell.reflections.written === cell.reflections.of });
  if (cell.ticks) counts.push({ key: "t", words: ticksCellWords(cell.ticks.ticked, cell.ticks.of), full: cell.ticks.ticked === cell.ticks.of });
  if (cell.boxes) counts.push({ key: "b", words: boxesCellWords(cell.boxes.filled, cell.boxes.of), full: cell.boxes.filled === cell.boxes.of });
  const answer = cell.answer;
  const answerClass =
    answer?.state === "waiting"
      ? `${styles.answer} ${styles.answerWaiting}`
      : answer?.state === "feedback"
        ? `${styles.answer} ${styles.answerDone}`
        : styles.answer;
  return (
    <div className={styles.cell}>
      <Link href={cell.href} className={styles.cellLink} aria-label={cellLinkLabelWords(name, cell.weekNumber)}>
        {counts.length === 0 ? (
          <span className={styles.muted}>{NO_COURSEWORK}</span>
        ) : (
          counts.map((count) => (
            <span key={count.key} className={count.full ? styles.full : styles.part}>
              {count.words}
            </span>
          ))
        )}
      </Link>
      {answer &&
        (answer.href ? (
          <Link href={answer.href} className={answerClass} aria-label={answerLinkLabelWords(name, cell.weekNumber, answer.state)}>
            {ANSWER_STATE_WORDS[answer.state]}
          </Link>
        ) : (
          <span className={`${answerClass} ${styles.answerPlain}`}>{ANSWER_STATE_WORDS[answer.state]}</span>
        ))}
    </div>
  );
}

function Row({ row }: { row: CourseworkRow }) {
  return (
    <tr>
      <th scope="row" className={`${styles.rowHead} ${styles.nameCol}`}>
        <Link href={row.href} className={styles.person}>
          {row.name}
        </Link>
        {(row.facilitating || row.notToldYet) && (
          <span className={styles.marks}>
            {row.facilitating && <span className={styles.chip}>{FACILITATING}</span>}
            {row.notToldYet && <span className={styles.chip}>{NOT_TOLD_YET}</span>}
          </span>
        )}
      </th>
      {row.cells.map((cell) => (
        <td key={cell.weekNumber} className={styles.td}>
          <Cell cell={cell} name={row.name} />
        </td>
      ))}
    </tr>
  );
}

export default function CourseworkTable({ view, base }: { view: CourseworkTabView; base: string }) {
  const lead = view.viewer === "lead" ? { firstName: "", isReader: true } : view.leadFirstName ? { firstName: view.leadFirstName, isReader: false } : null;
  const groupFilters = [
    { key: "all", label: EVERYBODY },
    ...view.groups.map((group) => ({ key: group.id, label: group.name })),
    { key: NOT_IN_A_GROUP, label: NOT_IN_A_GROUP_YET },
  ];
  const nobody = view.counts.holding === 0 && view.counts.facilitating === 0;
  return (
    <div className={styles.page}>
      <p className={styles.sentence}>{courseworkSummaryWords(view.counts.holding, view.counts.facilitating, view.counts.waiting)}</p>
      <p className={styles.sentence}>{courseworkWhoLine(lead)}</p>
      <nav aria-label={SHOW}>
        <ul className={styles.filters}>
          {groupFilters.map((filter) => {
            const on = view.filter.group === filter.key;
            return (
              <li key={filter.key}>
                <Link
                  href={filterHref(base, { group: filter.key, waiting: view.filter.waiting })}
                  className={on ? `${styles.filter} ${styles.filterOn}` : styles.filter}
                  aria-current={on ? "page" : undefined}
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href={filterHref(base, { group: view.filter.group, waiting: !view.filter.waiting })}
              className={view.filter.waiting ? `${styles.filter} ${styles.filterWaiting} ${styles.filterOn}` : `${styles.filter} ${styles.filterWaiting}`}
              aria-current={view.filter.waiting ? "page" : undefined}
            >
              {WAITING_FOR_FEEDBACK}
            </Link>
          </li>
        </ul>
      </nav>

      {nobody ? (
        <p className={styles.empty}>{nobodyHoldsWords(view.programmeName)}</p>
      ) : view.columns.length === 0 ? (
        <p className={styles.empty}>{NO_BLOCK_WEEKS}</p>
      ) : view.sections.length === 0 ? (
        <p className={styles.empty}>{NOBODY_HERE}</p>
      ) : (
        <section className={styles.card} aria-label={COURSEWORK}>
          {/* The weeks scroll inside the card, never the page; a keyboard can scroll it too. */}
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
                      <span className={styles.sectionHeadInner}>
                        <span>{section.title}</span>
                        <span className={styles.sectionCount}>{section.rows.length}</span>
                      </span>
                    </th>
                  </tr>
                  {section.rows.map((row) => (
                    <Row key={row.uid} row={row} />
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
