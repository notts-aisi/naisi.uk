"use client";

import { useState } from "react";
import InitialsChip from "@/components/ui/InitialsChip";
import type {
  GridCell,
  GridGroup,
  GridPerson,
  GridSessionTag,
  GridWeekTotal,
  RunAttendance,
} from "@/lib/courses/programmeAttendance";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import AttendanceCsvButton from "./AttendanceCsvButton";
import styles from "./ProgrammeAttendance.module.css";

/**
 * EVERY REGISTER OF THE RUN A PROGRAMME NAMES, AS ONE GRID: the Attendance
 * tab of the programme's page (board wk-attendance), for its lead and admins.
 *
 * The model is worked out on the server (`buildRunAttendance`): which weeks,
 * each group's own dates, each person's marks, "Came", who left and who has
 * missed sessions in a row. This only draws it, and keeps three choices in
 * the browser: By person or By week, which group, and a group's "+N more".
 * Nothing here marks anything: marking stays with the group's facilitators
 * and admins on the group's own page.
 *
 * The board's mark for "not yet" is a dash, which the house rule forbids, so
 * this draws the register's own dot, as the facilitators' register does.
 */

const LETTER: Record<AttendanceStatus, string> = {
  present: "P",
  late: "L",
  "left-early": "LE",
  excused: "E",
  absent: "A",
};

const MARK_CLASS: Record<AttendanceStatus, string> = {
  present: styles.present,
  late: styles.late,
  "left-early": styles.leftEarly,
  excused: styles.excused,
  absent: styles.absent,
};

/** A mark nobody has given yet. The facilitators' register draws the same dot. */
const NOT_YET = "·";

function tagWord(tag: GridSessionTag, ending: RunAttendance["ending"]): string | null {
  switch (tag) {
    case "tonight":
      return "Tonight";
    case "today":
      return "Today";
    case "tomorrow":
      return "Tomorrow";
    case "not-finished":
      return `Not ${ending}`;
    case "not-held":
      return "Not held";
    default:
      return null;
  }
}

/** What one cell says to assistive technology. */
function cellWords(cell: GridCell, person: GridPerson, ending: RunAttendance["ending"]): string {
  switch (cell.state) {
    case "mark": {
      const word = cell.mark ? ATTENDANCE_STATUS_LABEL[cell.mark] : "";
      const saved = cell.saved ? `, saved, not ${ending}` : "";
      return person.left ? `${word}, before they left${saved}` : `${word}${saved}`;
    }
    case "today":
      return "today, not yet";
    case "not-yet":
      return "not yet";
    case "not-held":
      return "the session was not held";
    case "before":
      return "not in the group yet";
    case "after":
      return "after they left";
    default:
      return "no session";
  }
}

function Mark({ cell, person, ending }: { cell: GridCell; person: GridPerson; ending: RunAttendance["ending"] }) {
  const label = `${person.name}, week ${cell.weekNumber}: ${cellWords(cell, person, ending)}`;
  if (cell.state === "mark" && cell.mark) {
    const classes = [
      styles.mark,
      MARK_CLASS[cell.mark],
      cell.saved ? styles.saved : "",
      person.left ? styles.beforeLeft : "",
    ].join(" ");
    return (
      <span className={classes} role="img" aria-label={label}>
        {LETTER[cell.mark]}
      </span>
    );
  }
  if (cell.state === "today") return <span className={styles.today} role="img" aria-label={label} />;
  if (cell.state === "not-yet") {
    return (
      <span className={styles.notYet} role="img" aria-label={label}>
        {NOT_YET}
      </span>
    );
  }
  return <span className={styles.blank} role="img" aria-label={label} />;
}

/** "3 of 3", or the not-yet dot while nothing counts yet. */
function came(person: GridPerson): string {
  return person.of > 0 ? `${person.came} of ${person.of}` : NOT_YET;
}

function percentOf(total: GridWeekTotal | undefined): { value: string; soFar: boolean } {
  if (!total || total.percent === null) return { value: NOT_YET, soFar: false };
  return { value: `${total.percent}%`, soFar: total.soFar };
}

function ByPerson({
  model,
  groups,
  footerName,
  footerTotals,
}: {
  model: RunAttendance;
  groups: GridGroup[];
  footerName: string;
  footerTotals: GridWeekTotal[];
}) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const columns = model.weeks.length + 2;
  return (
    <div className={styles.scroll} role="region" aria-label="Attendance grid" tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.caption}>Register marks by person and week, grouped by group</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.nameHead}>
              Name
            </th>
            {model.weeks.map((week) => (
              <th key={week.weekNumber} scope="col" className={styles.weekHead}>
                <span className={week.thisWeek ? styles.weekNow : undefined}>Week {week.weekNumber}</span>
                {week.thisWeek && <span className={styles.thisWeek}>This week</span>}
              </th>
            ))}
            <th scope="col" className={styles.cameHead}>
              Came
            </th>
          </tr>
        </thead>
        {groups.map((group) => {
          const whole = opened.has(group.id);
          const drawn = whole ? group.people : group.people.slice(0, group.shown);
          const hidden = group.people.length - drawn.length;
          return (
            <tbody key={group.id} className={styles.groupBody}>
              <tr className={styles.groupRow}>
                <th scope="rowgroup" className={styles.groupHead}>
                  <span className={styles.groupName}>{group.name}</span>
                  {group.line && <span className={styles.groupLine}>{group.line}</span>}
                </th>
                {group.weeks.map((week) => {
                  const tag = tagWord(week.tag, model.ending);
                  return (
                    <td key={week.weekNumber} className={styles.dateCell}>
                      <span className={styles.date}>{week.dateLabel}</span>
                      {tag && (
                        <span
                          className={`${styles.tag} ${
                            week.tag === "not-finished"
                              ? styles.tagWarn
                              : week.tag === "tonight" || week.tag === "today"
                                ? styles.tagLive
                                : ""
                          }`}
                        >
                          {tag}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className={styles.dateCell} />
              </tr>
              {group.people.length === 0 && (
                <tr>
                  <td colSpan={columns} className={styles.emptyRow}>
                    {group.notYetTold
                      ? "Nobody in this group has been told their group yet, so the register is empty until Publish tells them."
                      : "Nobody is in this group yet."}
                  </td>
                </tr>
              )}
              {drawn.map((person) => (
                <tr key={person.uid} className={person.left ? styles.leftRow : undefined}>
                  <th scope="row" className={styles.person}>
                    <span className={styles.personInner}>
                      <InitialsChip name={person.name} uid={person.uid} size="sm" />
                      <span className={styles.personText}>
                        <span className={styles.personName}>{person.name}</span>
                        {person.left && <span className={styles.leftLine}>{person.left}</span>}
                      </span>
                      {person.absentInARow > 0 && (
                        <span className={styles.inARow}>{person.absentInARow} in a row</span>
                      )}
                    </span>
                  </th>
                  {person.cells.map((cell) => (
                    <td key={cell.weekNumber} className={styles.cell}>
                      <Mark cell={cell} person={person} ending={model.ending} />
                    </td>
                  ))}
                  <td className={styles.came}>{came(person)}</td>
                </tr>
              ))}
              {hidden > 0 && (
                <tr>
                  <td colSpan={columns} className={styles.moreRow}>
                    <button
                      type="button"
                      className={styles.more}
                      aria-label={`Show ${hidden} more in ${group.name}`}
                      onClick={() => setOpened((now) => new Set(now).add(group.id))}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      <span>+{hidden} more</span>
                    </button>
                  </td>
                </tr>
              )}
              {group.people.length > 0 && group.notYetTold && (
                <tr>
                  <td colSpan={columns} className={styles.emptyRow}>
                    Somebody placed in this group isn’t on the register yet: Publish hasn’t told them their group.
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        <tfoot>
          <tr className={styles.totalRow}>
            <th scope="row" className={styles.groupHead}>
              <span className={styles.groupName}>{footerName}</span>
              <span className={styles.groupLine}>% who came</span>
            </th>
            {model.weeks.map((week) => {
              const figure = percentOf(footerTotals.find((total) => total.weekNumber === week.weekNumber));
              return (
                <td key={week.weekNumber} className={styles.total}>
                  <span className={styles.percent}>{figure.value}</span>
                  {figure.soFar && <span className={styles.soFar}>so far</span>}
                </td>
              );
            })}
            <td className={styles.total} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** One group's week in the By week view: its date, then who came or what is to come. */
function weekWords(group: GridGroup, weekNumber: number, ending: RunAttendance["ending"]): { date: string; said: string } {
  const week = group.weeks.find((entry) => entry.weekNumber === weekNumber);
  const total = group.totals.find((entry) => entry.weekNumber === weekNumber);
  const date = week?.dateLabel ?? "";
  if (!week || !date) return { date: "", said: NOT_YET };
  if (total && total.percent !== null) {
    return { date, said: `${total.came} of ${total.of} came${total.soFar ? " so far" : ""}` };
  }
  return { date, said: tagWord(week.tag, ending) ?? NOT_YET };
}

function ByWeek({
  model,
  groups,
  footerName,
  footerTotals,
}: {
  model: RunAttendance;
  groups: GridGroup[];
  footerName: string;
  footerTotals: GridWeekTotal[];
}) {
  return (
    <div className={styles.scroll} role="region" aria-label="Attendance by week" tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.caption}>Who came each week, group by group</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.nameHead}>
              Week
            </th>
            {groups.map((group) => (
              <th key={group.id} scope="col" className={styles.weekHead}>
                {group.name}
              </th>
            ))}
            <th scope="col" className={styles.cameHead}>
              {footerName}
            </th>
          </tr>
        </thead>
        <tbody>
          {model.weeks.map((week) => {
            const figure = percentOf(footerTotals.find((total) => total.weekNumber === week.weekNumber));
            return (
              <tr key={week.weekNumber}>
                <th scope="row" className={styles.person}>
                  <span className={styles.personText}>
                    <span className={styles.personName}>Week {week.weekNumber}</span>
                    {week.thisWeek && <span className={styles.thisWeekRow}>This week</span>}
                  </span>
                </th>
                {groups.map((group) => {
                  const words = weekWords(group, week.weekNumber, model.ending);
                  return (
                    <td key={group.id} className={styles.weekCell}>
                      {words.date && <span className={styles.date}>{words.date}</span>}
                      <span className={styles.weekSaid}>{words.said}</span>
                    </td>
                  );
                })}
                <td className={styles.total}>
                  <span className={styles.percent}>{figure.value}</span>
                  {figure.soFar && <span className={styles.soFar}>so far</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ProgrammeAttendance({
  model,
  roundId,
  programmeId,
  programmeName,
  initialGroup = "all",
}: {
  model: RunAttendance;
  roundId: string;
  programmeId: string;
  /** For the CSV's name if the server's name does not come through. */
  programmeName: string;
  /** A group's id to open the tab on, from "See it" on the Overview; "all" otherwise. */
  initialGroup?: string;
}) {
  const [view, setView] = useState<"person" | "week">("person");
  const [shown, setShown] = useState<string>(
    model.groups.some((group) => group.id === initialGroup) ? initialGroup : "all",
  );

  if (model.groups.length === 0) {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>This run has no groups yet, so it has no registers.</p>
      </section>
    );
  }
  if (model.weeks.length === 0) {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>This run has no weeks yet, so it has no registers.</p>
      </section>
    );
  }

  const one = model.groups.find((group) => group.id === shown) ?? null;
  const groups = one ? [one] : model.groups;
  const footerName = one ? one.name : "All groups";
  const footerTotals = one ? one.totals : model.totals;
  const saved = `Saved, not ${model.ending}`;
  // The dashed box is "Tonight" as drawn, and "Today" when the only session
  // it stands for today is in the daytime.
  const tags = model.groups.flatMap((group) => group.weeks.map((week) => week.tag));
  const todayWord = tags.includes("today") && !tags.includes("tonight") ? "Today" : "Tonight";

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toggles}>
          <span className={styles.segmented} role="group" aria-label="Show">
            <button
              type="button"
              className={`${styles.segment} ${view === "person" ? styles.segmentCurrent : ""}`}
              aria-pressed={view === "person"}
              onClick={() => setView("person")}
            >
              By person
            </button>
            <button
              type="button"
              className={`${styles.segment} ${view === "week" ? styles.segmentCurrent : ""}`}
              aria-pressed={view === "week"}
              onClick={() => setView("week")}
            >
              By week
            </button>
          </span>
          <span className={styles.filter} role="group" aria-labelledby="attendance-group-label">
            <span id="attendance-group-label" className={styles.filterLabel}>
              Group
            </span>
            <button
              type="button"
              className={`${styles.round} ${shown === "all" ? styles.roundCurrent : ""}`}
              aria-pressed={shown === "all"}
              onClick={() => setShown("all")}
            >
              All
            </button>
            {model.groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`${styles.round} ${shown === group.id ? styles.roundCurrent : ""}`}
                aria-pressed={shown === group.id}
                aria-label={group.name}
                onClick={() => setShown(group.id)}
              >
                {group.tag}
              </button>
            ))}
          </span>
        </div>
        <AttendanceCsvButton roundId={roundId} programmeId={programmeId} programmeName={programmeName} />
      </div>

      {view === "person" ? (
        <ByPerson model={model} groups={groups} footerName={footerName} footerTotals={footerTotals} />
      ) : (
        <ByWeek model={model} groups={groups} footerName={footerName} footerTotals={footerTotals} />
      )}

      <div className={styles.legendRow}>
        <ul className={styles.legend} aria-label="What the marks mean">
          {(["present", "late", "left-early", "excused", "absent"] as const).map((mark) => (
            <li key={mark} className={styles.legendItem}>
              <span className={`${styles.mark} ${MARK_CLASS[mark]}`} aria-hidden="true">
                {LETTER[mark]}
              </span>
              {ATTENDANCE_STATUS_LABEL[mark]}
            </li>
          ))}
          <li className={styles.legendItem}>
            <span className={styles.notYet} aria-hidden="true">
              {NOT_YET}
            </span>
            Not yet
          </li>
          <li className={styles.legendItem}>
            <span className={styles.today} aria-hidden="true" />
            {todayWord}
          </li>
          <li className={styles.legendItem}>
            <span className={`${styles.mark} ${styles.present} ${styles.saved}`} aria-hidden="true">
              P
            </span>
            {saved}
          </li>
        </ul>
        <p className={styles.legendNote}>Late and left early count as came.</p>
      </div>

      <section className={styles.note} aria-labelledby="attendance-what-people-see">
        <h3 id="attendance-what-people-see" className={styles.noteTitle}>
          What people see
        </h3>
        <p className={styles.noteText}>
          Each person sees their own marks on their programme page once their facilitator finishes the register.
          Nobody sees a target, or how many they could miss.
        </p>
      </section>
    </div>
  );
}
