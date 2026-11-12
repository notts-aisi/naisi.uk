"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { countBuckets, doneCount, filterRows, type Bucket, type WorkFilterKey } from "@/lib/courses/groupWeekWork/model";
import type { GroupWeekWorkView } from "@/lib/courses/groupWeekWork/view";
import * as R from "@/lib/courses/groupWeekWork/words";
import * as W from "@/lib/courses/groupPage/words";
import WorkBar from "./WorkBar";
import styles from "./GroupPage.module.css";

/** How a person's week chip is drawn, by its bucket. */
const TONE: Record<Bucket, string> = {
  "done-on-time": styles.toneDone,
  "done-late": styles.toneLate,
  done: styles.toneDone,
  started: styles.toneStarted,
  "not-started": styles.toneNone,
  "joined-late": styles.toneNone,
};

/**
 * THE CHOSEN WEEK'S WORK ON A GROUP'S PAGE, for admins and the programme's
 * lead: "4 of 6 have done week 1", a bar for the week and one for each of its
 * pieces, what is true of the automatic reminders, and Remind for everybody
 * whose week isn't done; then the people table (each piece, the week, what
 * they said about the session, when they were last reminded, and a Remind of
 * their own), filtered by the chips; "Late in week 1"; and the facilitators'
 * own weeks, counted in no number.
 *
 * Everything is the server's (`groupWeekWorkView`); every number here is
 * counted from `work.rows` (`countBuckets`), so the bars, the chips and the
 * table are one count. Remind's button counts the rows that have a Remind,
 * and anybody counted in "Week not done" without one is named under it with
 * why. Remind opens the panel the page owns.
 */
export default function WeekWorkCard({
  groupName,
  work,
  said,
  facilitatorsApart,
  onRemind,
}: {
  groupName: string;
  work: GroupWeekWorkView;
  /** What each person said about the week's session, by uid, as "This session" says it. */
  said: ReadonlyMap<string, W.WeekSaid>;
  /** The facilitators who also hold a place, named under the table. */
  facilitatorsApart: readonly string[];
  /** Open Remind: for everybody whose week isn't done, or one person. */
  onRemind: (only: { uid: string; firstName: string } | null) => void;
}) {
  const hydrated = useHydrated();
  const [filter, setFilter] = useState<WorkFilterKey>("everyone");
  const rows = work.rows;
  const weekCounts = countBuckets(rows.map((row) => row.week.bucket));
  const remindCount = work.remind?.count ?? 0;
  const filters: Array<{ key: WorkFilterKey; label: string }> = [
    { key: "everyone", label: R.filterLabel("everyone") },
    { key: "week", label: R.filterLabel("week") },
    ...work.pieces.map((piece) => ({ key: piece.key as WorkFilterKey, label: R.filterLabel(piece.key, piece.title) })),
    ...(work.sessionStarted ? [{ key: "late" as WorkFilterKey, label: R.filterLabel("late") }] : []),
  ];
  const shown = filterRows(rows, filter);
  const late = rows.filter((row) => row.late !== null);
  // Counted in "Week not done" and not in Remind's button: said by name, so the two numbers never disagree unexplained.
  const leftOut = filterRows(rows, "week").filter((row) => !row.remindable);

  return (
    <>
      <section className={styles.card} aria-labelledby="week-work-title">
        <div className={styles.workHead}>
          <h2 id="week-work-title" className={styles.cardTitle}>
            {R.haveDoneTitle(doneCount(weekCounts), rows.length, work.weekNumber)}
          </h2>
          {work.doneMeans && <p className={styles.cardLine}>{work.doneMeans}</p>}
        </div>
        <div className={styles.workBars}>
          <WorkBar label={R.weekLabel(work.weekNumber)} buckets={rows.map((row) => row.week.bucket)} />
          {work.pieces.map((piece) => (
            <WorkBar
              key={piece.key}
              label={piece.label}
              buckets={rows.map((row) => row.pieces.find((each) => each.key === piece.key)?.bucket ?? "not-started")}
            />
          ))}
        </div>
        {work.automatic && <p className={styles.cardLine}>{work.automatic}</p>}
        {work.remind && remindCount > 0 && (
          <button type="button" className={styles.buttonPrimary} disabled={!hydrated} onClick={() => onRemind(null)}>
            {R.remindAllWords(remindCount)}
          </button>
        )}
        {work.remind && leftOut.length > 0 && (
          <p className={styles.cardLine}>{R.remindLeavesOutWords(leftOut.map((row) => row.firstName || row.name))}</p>
        )}
      </section>

      <section className={styles.card} aria-labelledby="group-people">
        <h2 id="group-people" className={styles.cardTitle}>
          {W.weekPeopleTitle(groupName, work.weekNumber)}
        </h2>
        <div className={styles.filters} role="group" aria-label={R.THIS_WEEKS_WORK_LABEL}>
          {filters.map((each) => {
            const count = each.key === "everyone" ? rows.length : filterRows(rows, each.key).length;
            return (
              <button
                key={each.key}
                type="button"
                className={filter === each.key ? `${styles.filter} ${styles.filterOn}` : styles.filter}
                aria-pressed={filter === each.key}
                onClick={() => setFilter(each.key)}
              >
                {each.label} <strong>{count}</strong>
              </button>
            );
          })}
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.people}>
            <thead>
              <tr>
                <th scope="col">{W.PERSON}</th>
                {work.pieces.map((piece) => (
                  <th key={piece.key} scope="col">
                    {piece.label}
                  </th>
                ))}
                <th scope="col">{R.weekLabel(work.weekNumber)}</th>
                <th scope="col">{W.THIS_SESSION}</th>
                <th scope="col">{R.LAST_REMINDED}</th>
                <th scope="col">
                  <span className={styles.srOnly}>Remind</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={work.pieces.length + 5}>{R.NOBODY_HERE}</td>
                </tr>
              ) : (
                shown.map((row) => (
                  <tr key={row.uid}>
                    <td>{row.name}</td>
                    {work.pieces.map((piece) => {
                      const cell = row.pieces.find((each) => each.key === piece.key);
                      return (
                        <td key={piece.key}>
                          {cell?.text ?? ""}
                          {cell?.late && <span className={styles.cellNote}>{cell.late}</span>}
                        </td>
                      );
                    })}
                    <td>
                      <span className={`${styles.weekChip} ${TONE[row.week.bucket]}`}>{row.week.text}</span>
                      {row.week.detail && <span className={styles.cellNote}>{row.week.detail}</span>}
                    </td>
                    <td>{W.WEEK_SAID_WORDS[said.get(row.uid) ?? "coming"]}</td>
                    <td>{R.lastRemindedCell(row.lastReminded)}</td>
                    <td>
                      {row.remindable && work.remind && (
                        <button
                          type="button"
                          className={styles.button}
                          disabled={!hydrated}
                          onClick={() => onRemind({ uid: row.uid, firstName: row.firstName || row.name })}
                        >
                          {R.remindOneWords(row.firstName || row.name)}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {facilitatorsApart.length > 0 && <p className={styles.cardLine}>{W.facilitatorsApartLine(facilitatorsApart)}</p>}
      </section>

      {late.length > 0 && (
        <section className={styles.card} aria-labelledby="week-work-late">
          <h2 id="week-work-late" className={styles.cardTitle}>
            {R.lateInWeekTitle(work.weekNumber)}
          </h2>
          <ul className={styles.lateList}>
            {late.map((row) => (
              <li key={row.uid} className={styles.lateRow}>
                <span className={styles.lateMain}>
                  <span className={styles.lateName}>{row.name}</span>
                  <span className={styles.cardLine}>{row.late?.line}</span>
                </span>
                {row.late?.detail && <span className={styles.lateChip}>{row.late.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {work.own && work.own.length > 0 && (
        <section className={styles.card} aria-labelledby="week-work-own">
          <h2 id="week-work-own" className={styles.cardTitle}>
            {R.OWN_WORK_TITLE}
          </h2>
          <p className={styles.cardLine}>{R.OWN_WORK_APART}</p>
          <ul className={styles.lateList}>
            {work.own.map((row) => (
              <li key={row.uid} className={styles.lateRow}>
                <span className={styles.lateMain}>
                  <span className={styles.lateName}>{row.name}</span>
                  <span className={styles.cardLine}>{row.line}</span>
                </span>
                {row.late && <span className={styles.lateChip}>{row.late}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
