"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AttendancePayload } from "@/app/api/courses/groups/[groupId]/attendance/route";
import type { AttendanceCell, GroupAttendanceView } from "@/lib/courses/groupAttendance/load";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import ColumnSheet from "../registerCorrection/ColumnSheet";
import LineSheet, { type LineSheetTarget } from "../registerCorrection/LineSheet";
import styles from "./AttendanceTab.module.css";

/**
 * ATTENDANCE, ALL WEEKS: the third tab of a group's page, for admins and the
 * programme's lead (`loadGroupAttendance`, which the page hands only to
 * them: a facilitator of the group has their own register pages and is not
 * given this tab).
 *
 * People by weeks, each cell in words, with the two counts per person. A
 * corrected cell says "Corrected". The people who correct registers open a
 * cell of a finished week to correct it (who set the line and when, what it
 * should say, why, "Save the correction"; nobody is emailed), and a
 * corrected cell opens to its story; a column's menu corrects the whole
 * column, or says a week that didn't happen did. Whether each facilitator was
 * there is a row under the people only when the loader sends it (admins and
 * the programme's lead), with the line that the facilitators and the group
 * don't see it.
 *
 * Who set each line, each corrected line's story and the asks about lines
 * come from the register's own read, fetched the first time a sheet opens,
 * so the tab says exactly what the register says.
 */

type Details = {
  setBy: AttendancePayload["setBy"];
  corrections: AttendancePayload["corrections"];
  requests: AttendancePayload["requests"];
};

type Opened = { kind: "line"; uid: string; name: string; weekNumber: number } | { kind: "column"; weekNumber: number };

function occurrenceOf(sessionKey: string): number {
  const match = /^w\d{2}-(\d)$/.exec(sessionKey);
  return match ? Number(match[1]) : 1;
}

const TONE: Record<string, string> = {
  present: styles.toneRoom,
  late: styles.toneSome,
  "left-early": styles.toneSome,
  absent: styles.toneAbsent,
  excused: styles.toneExcused,
};

export default function AttendanceTab({
  view,
  runId,
  requestsBase,
}: {
  view: GroupAttendanceView;
  runId: string;
  /** The Requests page, for a line with an ask waiting. */
  requestsBase: string | null;
}) {
  const router = useRouter();
  const corrects = view.viewer === "admin" || view.viewer === "lead";
  const [opened, setOpened] = useState<Opened | null>(null);
  const [details, setDetails] = useState<{ nonce: number; data: Details | null; error: string | null }>({ nonce: -1, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const [said, setSaid] = useState<string | null>(null);

  // The register's own read, the first time a sheet opens and again after
  // each correction.
  const wanted = opened !== null;
  useEffect(() => {
    if (!wanted || details.nonce === nonce) return;
    let cancelled = false;
    void fetch(`/api/courses/groups/${encodeURIComponent(view.groupId)}/attendance`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (Partial<AttendancePayload> & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !body) {
          setDetails({ nonce, data: null, error: body?.error ?? `Couldn’t read the register (${res.status}).` });
          return;
        }
        setDetails({ nonce, data: { setBy: body.setBy ?? {}, corrections: body.corrections ?? {}, requests: body.requests ?? {} }, error: null });
      })
      .catch(() => {
        if (!cancelled) setDetails({ nonce, data: null, error: "Couldn’t read the register." });
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, nonce, details.nonce, view.groupId]);

  const columnByWeek = new Map(view.columns.map((column) => [column.weekNumber, column]));
  const shownColumns = view.columns.filter((column) => column.started || column.taken);

  function done(message: string) {
    setOpened(null);
    setSaid(message);
    setNonce((n) => n + 1);
    router.refresh();
  }

  // The line a sheet is open on.
  let lineTarget: LineSheetTarget | null = null;
  if (opened?.kind === "line") {
    const column = columnByWeek.get(opened.weekNumber);
    const row = [...view.people, ...(view.facilitators ?? []).flatMap((each) => (each.place ? [{ ...each.place, uid: each.uid, name: each.name }] : []))].find(
      (each) => each.uid === opened.uid,
    );
    const cell = row?.cells.find((each) => each.weekNumber === opened.weekNumber);
    if (column && cell) {
      const data = details.nonce === nonce ? details.data : null;
      lineTarget = {
        person: { uid: opened.uid, name: opened.name },
        session: { weekNumber: column.weekNumber, occurrence: occurrenceOf(column.sessionKey), dateKey: column.dateKey },
        line: { status: cell.mark, online: cell.online },
        setBy: data?.setBy[column.sessionKey]?.[opened.uid] ?? null,
        story: data?.corrections[column.sessionKey]?.[opened.uid] ?? null,
        request: data?.requests[column.sessionKey]?.[opened.uid] ?? null,
      };
    }
  }
  const columnOpened = opened?.kind === "column" ? (columnByWeek.get(opened.weekNumber) ?? null) : null;
  const loadingDetails = opened?.kind === "line" && details.nonce !== nonce;

  function cellOf(uid: string, name: string, cell: AttendanceCell) {
    const column = columnByWeek.get(cell.weekNumber);
    const words = P.cellWords(cell);
    const finished = Boolean(column?.finished) && column?.held !== false;
    const opens = finished && cell.state === "mark" && (corrects || cell.corrected);
    const tone = cell.state === "mark" && cell.mark ? (cell.mark === "present" && cell.online ? styles.toneOnline : TONE[cell.mark]) : styles.toneNone;
    const inner = (
      <>
        <span className={`${styles.dot} ${tone}`} aria-hidden="true" />
        <span>{words}</span>
        {cell.corrected && <span className={styles.chip}>{P.CORRECTED}</span>}
      </>
    );
    return (
      <td key={cell.weekNumber} className={styles.cell}>
        {opens ? (
          <button
            type="button"
            className={styles.cellButton}
            data-testid="group-attendance-cell"
            aria-haspopup="dialog"
            aria-label={`${name}, week ${cell.weekNumber}: ${words}.${cell.corrected ? ` ${P.CORRECTED}.` : ""} ${corrects ? "Correct this line." : "What happened to this line."}`}
            onClick={() => setOpened({ kind: "line", uid, name, weekNumber: cell.weekNumber })}
          >
            {inner}
          </button>
        ) : (
          <span className={styles.cellText} data-testid="group-attendance-cell">
            {inner}
          </span>
        )}
      </td>
    );
  }

  const presenceShown = (view.facilitators ?? []).some((each) => each.presence);

  return (
    <div className={styles.root}>
      {corrects && <p className={styles.lede}>{P.CORRECT_ANY_LINE}</p>}
      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
      <ul className={styles.legend} aria-label="What the cells say">
        {[
          ["In the room", styles.toneRoom],
          ["Online", styles.toneOnline],
          ["Arrived late or left early", styles.toneSome],
          ["Absent", styles.toneAbsent],
          ["Excused", styles.toneExcused],
        ].map(([label, tone]) => (
          <li key={label} className={styles.legendItem}>
            <span className={`${styles.dot} ${tone}`} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li className={styles.legendNote}>Each cell says what happened in words.</li>
      </ul>

      {shownColumns.length === 0 ? (
        <p className={styles.lede}>No session of this group has happened yet.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table} data-testid="group-attendance">
            <caption className={styles.caption}>
              {view.groupName}: what each person’s register says, week by week, with how many sessions each came to in the room and online.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={styles.head}>
                  Person
                </th>
                {shownColumns.map((column) => (
                  <th key={column.weekNumber} scope="col" className={styles.head}>
                    <span className={styles.headLabel}>{P.columnLabel(column.weekNumber, column.dateKey)}</span>
                    {column.finished && <span className={styles.headSub}>Finished by {P.firstOf(column.finished.name) || "somebody"}</span>}
                    {column.cover && <span className={styles.headSub}>Taken by {P.firstOf(column.cover.name)}</span>}
                    {corrects && column.started && (column.finished || !column.held) && (
                      <button
                        type="button"
                        className={styles.headButton}
                        data-testid="group-attendance-column"
                        onClick={() => setOpened({ kind: "column", weekNumber: column.weekNumber })}
                      >
                        {column.held ? P.correctColumnWords(column.weekNumber) : P.didHappenWords(column.weekNumber)}
                      </button>
                    )}
                  </th>
                ))}
                <th scope="col" className={styles.head}>
                  {P.IN_THE_ROOM_COUNT}
                </th>
                <th scope="col" className={styles.head}>
                  {P.ONLINE_COUNT}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.people.map((row) => (
                <tr key={row.uid}>
                  <th scope="row" className={styles.name}>
                    {row.name}
                    {row.left && <span className={styles.left}>{row.left}</span>}
                  </th>
                  {row.cells.filter((cell) => shownColumns.some((column) => column.weekNumber === cell.weekNumber)).map((cell) => cellOf(row.uid, row.name, cell))}
                  <td className={styles.count}>{row.room}</td>
                  <td className={styles.count}>{row.online}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.facilitators && view.facilitators.length > 0 && shownColumns.length > 0 && (
        <section className={styles.facilitators} aria-labelledby="group-attendance-facilitators">
          <h3 id="group-attendance-facilitators" className={styles.subTitle}>
            {P.FACILITATORS_ROW}
          </h3>
          {presenceShown && <p className={styles.note}>{P.FACILITATORS_ROW_NOTE}</p>}
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.head}>
                    Facilitator
                  </th>
                  {shownColumns.map((column) => (
                    <th key={column.weekNumber} scope="col" className={styles.head}>
                      {P.columnLabel(column.weekNumber, column.dateKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.facilitators.map((each) => (
                  <tr key={each.uid}>
                    <th scope="row" className={styles.name}>
                      {each.name}
                    </th>
                    {shownColumns.map((column) => {
                      const presence = each.presence?.find((entry) => entry.weekNumber === column.weekNumber) ?? null;
                      const place = each.place?.cells.find((cell) => cell.weekNumber === column.weekNumber) ?? null;
                      const parts = [presence ? P.presenceCellWords(presence) : "", place && place.state === "mark" ? `Their place: ${P.cellWords(place)}` : ""].filter(Boolean);
                      return (
                        <td key={column.weekNumber} className={styles.cell}>
                          <span className={styles.cellText}>{parts.join(". ") || " "}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view.notYetTold && <p className={styles.note}>Somebody placed in this group isn’t listed yet: Publish hasn’t told them their group.</p>}

      {lineTarget && !loadingDetails && (
        <LineSheet
          key={`${opened?.kind === "line" ? opened.uid : ""} ${opened?.weekNumber ?? ""}`}
          open
          onClose={() => setOpened(null)}
          groupId={view.groupId}
          mode={corrects ? "correct" : "read"}
          target={lineTarget}
          requestHref={requestsBase ? (id: string) => `${requestsBase}/${encodeURIComponent(id)}` : null}
          sessionLabelOf={(key) => {
            const match = /^w(\d{2})/.exec(key);
            return match ? `week ${Number(match[1])}` : "another week";
          }}
          onDone={done}
        />
      )}
      {opened?.kind === "line" && details.nonce === nonce && details.error && (
        <p className={styles.note} role="status">
          {details.error}
        </p>
      )}

      {columnOpened && (
        <ColumnSheet
          key={columnOpened.sessionKey}
          open
          onClose={() => setOpened(null)}
          groupId={view.groupId}
          runId={runId}
          groupName={view.groupName}
          target={{
            session: {
              weekNumber: columnOpened.weekNumber,
              occurrence: occurrenceOf(columnOpened.sessionKey),
              sessionKey: columnOpened.sessionKey,
              dateKey: columnOpened.dateKey,
              held: columnOpened.held,
            },
            finished: columnOpened.finished,
          }}
          onDone={done}
        />
      )}
    </div>
  );
}
