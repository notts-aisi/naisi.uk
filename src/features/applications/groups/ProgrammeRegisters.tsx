"use client";

import { useState } from "react";
import useAttendance from "@/features/courses/useAttendance";
import { groupTag } from "@/features/applications/times/timesWords";
import type { RunGroupHeading } from "@/lib/applications/handover/programmeRun";
import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import styles from "./ProgrammeRegisters.module.css";

/**
 * EVERY REGISTER OF THE RUN A PROGRAMME NAMES, READ ONLY: the Attendance tab
 * of the programme's page (board wk-attendance), for its lead and admins.
 *
 * Each group's register is read through the register's own route
 * (`GET /api/courses/groups/[groupId]/attendance`), which lets the lead of
 * the programme that names the run read and refuses them every write. So
 * nothing here marks anything: a cell is a fact, written as a letter, and
 * marking stays with the group's facilitators and admins on the group's own
 * page.
 *
 * What the board draws and this leaves out, because it does not exist yet:
 * the By week view, the Came column and the share who came, a CSV, and the
 * weeks still to come. The groups and the registers are the run's own.
 */

const LETTER: Record<AttendanceStatus, string> = {
  present: "P",
  late: "L",
  "left-early": "LE",
  excused: "E",
  absent: "A",
};

const STATUS_CLASS: Record<AttendanceStatus, string> = {
  present: styles.present,
  late: styles.late,
  "left-early": styles.leftEarly,
  excused: styles.excused,
  absent: styles.absent,
};

/** A mark nobody has given yet. The facilitator's register draws the same dot. */
const UNMARKED = "·";

const LEGEND: readonly [string, string][] = [
  ["P", "Present"],
  ["L", "Late"],
  ["LE", "Left early"],
  ["E", "Excused"],
  ["A", "Absent"],
  [UNMARKED, "Not marked"],
];

/** "3 Nov", from a civil date in London. */
function dayMonth(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(
    new Date(`${dateKey}T12:00:00Z`),
  );
}

function GroupRegister({ group }: { group: RunGroupHeading }) {
  const { sessions, members, records, notYetTold, loaded, error } = useAttendance(group.id);
  const sub = [group.when, group.facilitators].filter(Boolean).join(" · ");

  return (
    <section className={styles.group} aria-labelledby={`register-${group.id}`}>
      <div className={styles.groupHead}>
        <h2 id={`register-${group.id}`} className={styles.groupName}>
          {group.name}
        </h2>
        {sub && <p className={styles.muted}>{sub}</p>}
      </div>
      {error ? (
        <p className={styles.problem} role="alert">
          This register could not be read. Reload the page to try again.
        </p>
      ) : !loaded ? (
        <p className={styles.muted} role="status">
          Reading the register…
        </p>
      ) : members.length === 0 ? (
        <p className={styles.muted}>
          {notYetTold
            ? "Nobody in this group has been told their group yet, so the register is empty until Publish tells them."
            : "Nobody is in this group yet."}
        </p>
      ) : (
        <>
          <div className={styles.scroll} role="region" tabIndex={0} aria-label={`${group.name}’s register`}>
            <table className={styles.table}>
              <caption className={styles.caption}>
                {group.name}’s register: each person’s mark for each session so far.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.nameHead}>
                    Name
                  </th>
                  {sessions.map((session) => (
                    <th key={session.sessionKey} scope="col" className={styles.sessionHead}>
                      <span className={styles.week}>
                        Week {session.weekNumber}
                        {session.occurrence > 1 ? `, session ${session.occurrence}` : ""}
                      </span>
                      <span className={styles.date}>{dayMonth(session.dateKey)}</span>
                      {!session.held ? (
                        <span className={styles.tag}>Not held</span>
                      ) : session.pushedAt ? (
                        <span className={styles.tag}>Finished</span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.uid}>
                    <th scope="row" className={styles.name}>
                      {member.displayName}
                    </th>
                    {sessions.map((session) => {
                      const before = session.weekNumber < member.joinedWeekNumber;
                      const status = records[session.sessionKey]?.[member.uid] ?? null;
                      const said = before
                        ? "not in the group yet"
                        : !session.held
                          ? "the session was not held"
                          : status
                            ? ATTENDANCE_STATUS_LABEL[status]
                            : "not marked";
                      return (
                        <td key={session.sessionKey} className={styles.cell}>
                          <span
                            className={`${styles.mark} ${status && !before && session.held ? STATUS_CLASS[status] : styles.unmarked}`}
                            role="img"
                            aria-label={`${member.displayName}, week ${session.weekNumber}: ${said}`}
                          >
                            {before || !session.held ? "" : status ? LETTER[status] : UNMARKED}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notYetTold && (
            <p className={styles.muted}>
              Somebody placed in this group is not on the register yet: Publish hasn’t told them their group.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default function ProgrammeRegisters({ groups }: { groups: RunGroupHeading[] }) {
  const [shown, setShown] = useState<string>("all");
  const visible = shown === "all" ? groups : groups.filter((group) => group.id === shown);

  if (groups.length === 0) {
    return (
      <section className={styles.card}>
        <p className={styles.muted}>This run has no groups yet, so it has no registers.</p>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.filter} role="group" aria-labelledby="register-filter-label">
          <span id="register-filter-label" className={styles.filterLabel}>
            Group
          </span>
          <span className={styles.segmented}>
            <button
              type="button"
              className={`${styles.segment} ${shown === "all" ? styles.segmentCurrent : ""}`}
              aria-pressed={shown === "all"}
              onClick={() => setShown("all")}
            >
              All
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`${styles.segment} ${shown === group.id ? styles.segmentCurrent : ""}`}
                aria-pressed={shown === group.id}
                aria-label={group.name}
                onClick={() => setShown(group.id)}
              >
                {groupTag(group.name)}
              </button>
            ))}
          </span>
        </div>
      </div>
      {visible.map((group) => (
        <GroupRegister key={group.id} group={group} />
      ))}
      <ul className={styles.legend} aria-label="What the letters mean">
        {LEGEND.map(([letter, word]) => (
          <li key={word} className={styles.legendItem}>
            <span className={styles.legendLetter} aria-hidden="true">
              {letter}
            </span>
            {word}
          </li>
        ))}
      </ul>
      <section className={styles.note} aria-labelledby="register-what-people-see">
        <h3 id="register-what-people-see" className={styles.noteTitle}>
          What people see
        </h3>
        <p className={styles.muted}>
          Each person sees their own marks on their programme page once their facilitator finishes the register.
        </p>
      </section>
    </div>
  );
}
