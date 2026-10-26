import type { ReactNode } from "react";
import Link from "next/link";
import InitialsChip from "@/components/ui/InitialsChip";
import weekly from "@/features/courses/weekly/weekly.module.css";
import type { GroupWeek, GroupWeekSource } from "@/lib/courses/facilitatorWeek/readers";
import {
  FACILITATOR,
  GROUPS_WEEKS,
  HIDE_NAMES,
  HIDE_NOTES,
  NAME,
  NOBODY_LISTED,
  NOT_YET,
  NO_SOURCES,
  READING_TICKS,
  READ_THEM,
  REFLECTIONS,
  REVIEW_QUEUE,
  SEE_IT,
  SEE_WHO,
  THIS_WEEKS_WORK,
  TICKS_NEVER_COUNT,
  WRITTEN,
  groupWeekLineWords,
  groupWeekTitleWords,
  hideNotesNameWords,
  hideWhoNameWords,
  partReflectionWords,
  privateNotesNameWords,
  privateNotesWhoLine,
  privateNotesWords,
  queueCountsWords,
  reflectionsLineWords,
  seeWhoNameWords,
  sourcePlaceWords,
  tickedWords,
  weekMetaWords,
} from "@/lib/courses/facilitatorWeek/words";
import Disclosure from "./Disclosure";
import styles from "@/features/courses/facilitator/facilitator.module.css";

/**
 * THIS WEEK'S WORK (boards wk-fac-group at 1440, wk-fac-group-phone at 390):
 * each person in the group with each part's reflection written or not yet,
 * as a table on a wide page and a list on a narrow one; then who ticked each
 * source of the week (Q31: how many, of how many, and the names behind a
 * button, never on hover), with the private notes left on each for a viewer
 * who reads them (Q38).
 *
 * Drawn on the server from what `loadGroupWeek` worked out for the viewer:
 * a facilitator is never handed a facilitator's own work, and the lead and
 * admins are handed it marked as theirs ("Facilitator" beside the name).
 *
 * The board's other columns (the written answer, the pathway, the case) are
 * the written answers' and the packs' pieces: each is handed in as a column
 * (`columns`), and the spread across pathways as `children`, under the table.
 */

/** A column a later piece adds: its head, and what it says for one person. */
export type WorkColumn = { key: string; label: string; cell: (uid: string) => ReactNode };

function Person({ name, uid, own, size = "md" }: { name: string; uid: string; own: boolean; size?: "sm" | "md" }) {
  return (
    <>
      <InitialsChip name={name} uid={uid} size={size} />
      <span className={styles.wkPersonName}>{name}</span>
      {own && <span className={styles.wkOwnChip}>{FACILITATOR}</span>}
    </>
  );
}

function SourceRow({ source, of }: { source: GroupWeekSource; of: number }) {
  const notes = source.notes ?? [];
  return (
    <li className={styles.wkSource}>
      <span className={styles.wkSourceText}>
        <span className={styles.wkSourceKind}>{sourcePlaceWords(source.partNumber, source.kindLabel)}</span>
        <span className={styles.wkSourceTitle}>{source.title}</span>
      </span>
      <span className={styles.wkSourceSide}>
        <span className={styles.wkSourceCount}>
          {tickedWords(source.ticked.length, of)}
          <span className={weekly.srOnly}> ticked it</span>
        </span>
      </span>
      {source.ticked.length > 0 && (
        <Disclosure label={SEE_WHO} hideLabel={HIDE_NAMES} name={seeWhoNameWords(source.title)} hideName={hideWhoNameWords(source.title)}>
          <ul className={styles.wkNames}>
            {source.ticked.map((person) => (
              <li key={person.uid} className={styles.wkName}>
                <Person name={person.name} uid={person.uid} own={person.own} size="sm" />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {notes.length > 0 && (
        <Disclosure
          label={privateNotesWords(notes.length)}
          hideLabel={HIDE_NOTES}
          name={privateNotesNameWords(notes.length, source.title)}
          hideName={hideNotesNameWords(source.title)}
        >
          <ul className={styles.wkNotes}>
            {notes.map((note) => (
              <li key={note.person.uid} className={styles.wkNote}>
                <span className={styles.wkNoteWho}>
                  <Person name={note.person.name} uid={note.person.uid} own={note.person.own} size="sm" />
                </span>
                <p className={styles.wkNoteText}>{note.text}</p>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </li>
  );
}

export default function ThisWeeksWork({
  week,
  groupName,
  columns = [],
  ownLine = null,
  emptyLine = NOBODY_LISTED,
  headingId = "this-weeks-work",
  children = null,
}: {
  week: GroupWeek;
  groupName: string;
  columns?: WorkColumn[];
  /** To a facilitator: whose eyes the facilitators' own work is for. */
  ownLine?: string | null;
  /** In place of the table when nobody is listed: the group page's own sentence for the moment it is in. */
  emptyLine?: string;
  headingId?: string;
  /** The spread across pathways, under the table (the packs' piece). */
  children?: ReactNode;
}) {
  return (
    <section className={weekly.card} aria-labelledby={headingId}>
      <div className={styles.wkWorkHead}>
        <h2 id={headingId} className={weekly.cardTitle}>
          {THIS_WEEKS_WORK}
        </h2>
        <span className={weekly.cardMeta}>{weekMetaWords(week.weekNumber, week.range)}</span>
      </div>

      {week.rows.length === 0 ? (
        <p className={weekly.cardLine}>{emptyLine}</p>
      ) : (
        <>
          <div className={styles.wkDesk}>
            <div className={styles.wkTableScroll} role="region" aria-label={THIS_WEEKS_WORK} tabIndex={0}>
              <table className={styles.wkTable}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.wkTh}>
                      {NAME}
                    </th>
                    {week.parts.map((part) => (
                      <th key={part.number} scope="col" className={styles.wkTh}>
                        {partReflectionWords(part.number)}
                      </th>
                    ))}
                    {columns.map((column) => (
                      <th key={column.key} scope="col" className={styles.wkTh}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {week.rows.map((row) => (
                    <tr key={row.uid}>
                      <th scope="row" className={styles.wkRowHead}>
                        <span className={styles.wkPerson}>
                          <Person name={row.name} uid={row.uid} own={row.own} />
                        </span>
                      </th>
                      {row.written.map((written, index) => (
                        <td key={week.parts[index]?.number ?? index} className={written ? styles.wkTd : `${styles.wkTd} ${styles.wkMuted}`}>
                          {written ? WRITTEN : NOT_YET}
                        </td>
                      ))}
                      {columns.map((column) => (
                        <td key={column.key} className={styles.wkTd}>
                          {column.cell(row.uid)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ul className={`${styles.wkPhone} ${styles.wkPeople}`} aria-label={THIS_WEEKS_WORK}>
            {week.rows.map((row) => (
              <li key={row.uid} className={styles.wkPersonCard}>
                <div className={styles.wkPersonCardHead}>
                  <Person name={row.name} uid={row.uid} own={row.own} />
                </div>
                {week.parts.length > 0 && (
                  <p className={styles.wkFact}>
                    <span className={styles.wkFactLabel}>{REFLECTIONS}</span>
                    <span className={styles.wkFactValue}>
                      {reflectionsLineWords(week.parts.map((part, index) => ({ number: part.number, written: row.written[index] === true })))}
                    </span>
                  </p>
                )}
                {columns.map((column) => (
                  <p key={column.key} className={styles.wkFact}>
                    <span className={styles.wkFactLabel}>{column.label}</span>
                    <span className={styles.wkFactValue}>{column.cell(row.uid)}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
      {ownLine && <p className={styles.wkFootLine}>{ownLine}</p>}

      {children}

      <section className={styles.wkTicks} aria-labelledby={`${headingId}-ticks`}>
        <h3 id={`${headingId}-ticks`} className={styles.wkTicksTitle}>
          {READING_TICKS}
        </h3>
        <p className={styles.wkTicksLine}>{TICKS_NEVER_COUNT}</p>
        {week.sources.length === 0 ? (
          <p className={styles.wkFootLine}>{NO_SOURCES}</p>
        ) : (
          <ul className={styles.wkSources}>
            {week.sources.map((source) => (
              <SourceRow key={source.id} source={source} of={week.of} />
            ))}
          </ul>
        )}
        {week.readsNotes && <p className={styles.wkFootLine}>{privateNotesWhoLine(groupName)}</p>}
      </section>
    </section>
  );
}

/**
 * THE REVIEW QUEUE'S REFLECTIONS HALF (wk-fac-group): "Reflections", how many
 * of the group have written each part's ("Part 1, 6 of 7 · Part 2, 5 of 7"),
 * and "Read them", to the page where lines are picked to read out. Drawn
 * under the written answers half (`separated`), or alone in its card.
 */
export function ReflectionsHalf({
  counts,
  href,
  separated = true,
  titled = true,
}: {
  counts: GroupWeek["counts"];
  href: string;
  separated?: boolean;
  /** False where the card's own heading already says "Reflections". */
  titled?: boolean;
}) {
  return (
    <div className={separated ? `${styles.wkHalf} ${styles.wkHalfSeparated}` : styles.wkHalf}>
      <div className={styles.wkHalfHead}>
        {titled && <h3 className={styles.wkHalfTitle}>{REFLECTIONS}</h3>}
        <span className={styles.wkHalfCounts}>{queueCountsWords(counts)}</span>
      </div>
      <Link href={href} className={styles.wkReadThem}>
        <span>{READ_THEM}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}

/**
 * THE LEAD'S WAY TO EACH GROUP'S WEEK, on the programme's Attendance tab: a
 * line per group, the week it is getting ready for, and "See it". No board
 * draws it; its words are listed for the boards' designers to confirm.
 */
export function GroupWeeksCard({ groups }: { groups: Array<{ id: string; name: string; weekNumber: number | null; href: string }> }) {
  return (
    <section className={weekly.card} aria-labelledby="group-weeks">
      <div className={weekly.cardHead}>
        <h2 id="group-weeks" className={weekly.cardTitle}>
          {GROUPS_WEEKS}
        </h2>
      </div>
      <ul className={styles.wkGroupWeeks}>
        {groups.map((group) => (
          <li key={group.id} className={styles.wkGroupWeek}>
            <span className={styles.wkGroupWeekText}>
              <span className={styles.wkPersonName}>{group.name}</span>
              <span className={styles.wkGroupWeekMeta}>{groupWeekLineWords(group.weekNumber)}</span>
            </span>
            <Link href={group.href} className={styles.wkSeeIt} aria-label={`${SEE_IT}: ${groupWeekTitleWords(group.name)}`}>
              {SEE_IT}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The review queue's card holding the reflections half alone, until the
 * written answers half is drawn beside it: that piece's card takes this half
 * in its own place for it, and this card goes. On the lead's page, where
 * nothing is reviewed, the card is headed "Reflections" (`lead`).
 */
export function ReflectionsQueueCard({ counts, href, lead = false }: { counts: GroupWeek["counts"]; href: string; lead?: boolean }) {
  const headingId = lead ? "group-reflections" : "group-review-queue";
  return (
    <section className={weekly.card} aria-labelledby={headingId}>
      <div className={weekly.cardHead}>
        <h2 id={headingId} className={weekly.cardTitle}>
          {lead ? REFLECTIONS : REVIEW_QUEUE}
        </h2>
      </div>
      <ReflectionsHalf counts={counts} href={href} separated={false} titled={!lead} />
    </section>
  );
}
