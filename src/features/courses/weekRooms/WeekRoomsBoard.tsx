"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { downloadCSV, toCSV } from "@/lib/csv";
import { groupPagePath } from "@/lib/courses/groupPage/words";
import { REASON_LABEL, TELL_AGAIN, TOO_MANY_TO_TELL } from "@/lib/courses/sessionChange/words";
import { weekRoomsCsv } from "@/lib/courses/weekRooms/csv";
import { CHANGE_REASON_LIMIT, GROUP_ROOM_LIMIT } from "@/lib/courses/weekRooms/limits";
import { askPreview, emailsOf, saveRoom, tellGroup, type Post, type RoomOutcome, type RoomPreview } from "@/lib/courses/weekRooms/press";
import type { RoomRow } from "@/lib/courses/weekRooms/model";
import { rowAnchor } from "@/lib/courses/weekRooms/paths";
import * as W from "@/lib/courses/weekRooms/words";
import PasteRooms from "./PasteRooms";
import styles from "./WeekRooms.module.css";

/**
 * THE WEEK'S ROOMS, the table: one row per group's session in the week, its
 * room set or changed in the row, the paste box, the button that saves them
 * and Download.
 *
 * ONE WRITER, AND NOTHING BESIDE IT. A changed room is a one-week change of
 * the session (`POST /api/courses/groups/[groupId]/session/change`, a move to
 * the same day and time in the new room), pressed exactly as the group's page
 * presses one: first with `preview: true` as soon as the field changes, which
 * changes nothing and answers with the writer's own refusal or with who the
 * group's notice would email; then, on Save, the press itself with the reason
 * and the count, and the update the route answers with posted to the group
 * through the updates route (`/api/courses/runs/[runId]/updates`) with its
 * facilitators, the one lane a group's notice and its email go through. So a
 * room changed here is refused where the group's page would refuse it, writes
 * the same history row and emails the group the same words, under the same
 * limits.
 *
 * ONE GROUP AT A TIME. Save presses each changed row in turn and says, in the
 * row, what happened: saved and who was told, or the writer's sentence for a
 * refusal. When a count no longer holds the route answers 409 with the new
 * one, nothing is changed for that group, and the row shows the new count to
 * be pressed again. A room saved whose update did not go says so and offers
 * Tell the group again.
 *
 * Every value drawn is the server's (`RoomRow`), and nothing here holds an
 * address or a meeting link.
 */

type Show = "all" | "notBooked" | "requests";

/** One press of a route, answered with its status and body; null when the answer never came. */
const postJson: Post = async (url, body) => {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return null;
  }
};

/** How many previews are asked at once. */
const AT_ONCE = 4;

export default function WeekRoomsBoard({
  roundId,
  monday,
  weekLabel,
  rows,
}: {
  roundId: string;
  monday: string;
  /** "w/c Mon 16 Nov". */
  weekLabel: string;
  rows: RoomRow[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ids = useId();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, RoomPreview>>({});
  const [outcomes, setOutcomes] = useState<Record<string, RoomOutcome>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [pasting, setPasting] = useState(false);
  const asked = useRef(new Map<string, string>());

  const editable = (row: RoomRow) => row.state === null;
  const valueOf = (row: RoomRow) => drafts[row.key] ?? row.room;
  const changed = useMemo(
    () => rows.filter((row) => row.state === null && (drafts[row.key] ?? row.room).trim() !== row.room),
    [rows, drafts],
  );

  // Ask the writer what each changed room would do, a moment after the last
  // keystroke; the newest question for a row wins.
  const question = JSON.stringify(changed.map((row) => [row.key, valueOf(row).trim()]));
  useEffect(() => {
    const wanted = JSON.parse(question) as [string, string][];
    if (wanted.length === 0) return;
    const timer = window.setTimeout(async () => {
      const queue = wanted.filter(([key, room]) => asked.current.get(key) !== room);
      for (const [key, room] of queue) asked.current.set(key, room);
      setPreviews((now) => {
        const next = { ...now };
        for (const [key, room] of queue) next[key] = { room, status: "loading" };
        return next;
      });
      const byKey = new Map(rows.map((row) => [row.key, row] as const));
      const work = [...queue];
      const runOne = async () => {
        for (let item = work.shift(); item; item = work.shift()) {
          const [key, room] = item;
          const row = byKey.get(key);
          if (!row) continue;
          const preview = await askPreview(postJson, row, room);
          // A newer question for the row was asked meanwhile: its answer wins.
          if (asked.current.get(key) !== room) continue;
          setPreviews((now) => ({ ...now, [key]: preview }));
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, work.length) }, runOne));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [question, rows]);

  const previewOf = (row: RoomRow): RoomPreview | null => {
    const preview = previews[row.key];
    return preview && preview.room === valueOf(row).trim() ? preview : null;
  };
  const ready = changed.filter((row) => previewOf(row)?.status === "ok");
  const checking = changed.some((row) => {
    const preview = previewOf(row);
    return !preview || preview.status === "loading";
  });
  const people = ready.reduce((sum, row) => sum + emailsOf(previewOf(row)), 0);
  const groups = new Set(ready.filter((row) => emailsOf(previewOf(row)) > 0).map((row) => row.groupId)).size;
  const off = !hydrated || busy;
  const canSave = !off && ready.length > 0 && !checking && reason.trim() !== "";
  const buttonWords = busy ? W.SAVING : ready.length > 0 ? W.saveButtonWords(ready.length, groups, people) : W.NOTHING_TO_SAVE;
  const waitWords = changed.length === 0 ? null : checking ? W.WAIT_FOR_CHECKS : reason.trim() === "" ? W.REASON_NEEDED : null;

  function setRoom(key: string, room: string) {
    setDrafts((now) => ({ ...now, [key]: room }));
    setSaid(null);
  }

  async function save() {
    if (!canSave) return;
    const why = reason.trim();
    setBusy(true);
    setSaid(null);
    let saved = 0;
    let refused = 0;
    for (const row of ready) {
      const preview = previewOf(row);
      if (preview?.status !== "ok") continue;
      const room = valueOf(row).trim();
      const outcome = await saveRoom(postJson, row, room, preview, why);
      if (outcome.emails !== undefined) {
        // The count no longer holds: nothing changed; the row asks again with the new one.
        const emails = outcome.emails;
        setPreviews((now) => ({ ...now, [row.key]: { ...preview, emails } }));
      }
      if (outcome.saved) {
        saved += 1;
        setDrafts((now) => {
          const next = { ...now };
          delete next[row.key];
          return next;
        });
      } else {
        refused += 1;
      }
      setOutcomes((now) => ({ ...now, [row.key]: outcome }));
    }
    setSaid(W.savedSummaryWords(saved, refused));
    setBusy(false);
    if (saved > 0) router.refresh();
  }

  async function tellAgain(row: RoomRow) {
    const pending = outcomes[row.key]?.pending;
    if (!pending) return;
    setBusy(true);
    const outcome = await tellGroup(postJson, pending.runId, pending.update);
    setOutcomes((now) => ({ ...now, [row.key]: outcome }));
    setBusy(false);
  }

  function download() {
    const { header, body } = weekRoomsCsv(rows);
    downloadCSV(W.weekFileName(monday), toCSV(header, body));
  }

  /** What the paste box puts in the fields; `null` puts back what was there before it opened. */
  const fromPaste = useCallback((rooms: Record<string, string> | null, before: Record<string, string>) => {
    setDrafts(rooms === null ? before : { ...before, ...rooms });
    setSaid(null);
  }, []);

  const shownRow = (row: RoomRow) =>
    show === "all" || (show === "notBooked" ? row.room === "" && row.state !== "cancelled" : row.requests > 0);
  const notBooked = rows.filter((row) => row.room === "" && row.state !== "cancelled").length;
  const withRequests = rows.filter((row) => row.requests > 0).length;
  const reasonId = `${ids}-reason`;
  const reasonHintId = `${ids}-reason-hint`;

  const saveBar = (
    <div className={styles.saveBar}>
      <div className={styles.reason}>
        <label className={styles.reasonLabel} htmlFor={reasonId}>
          {REASON_LABEL}
        </label>
        <input
          id={reasonId}
          className={styles.reasonInput}
          value={reason}
          maxLength={CHANGE_REASON_LIMIT}
          disabled={off}
          aria-describedby={reasonHintId}
          onChange={(event) => setReason(event.target.value)}
        />
        <p id={reasonHintId} className={styles.hint}>
          {W.REASON_HINT}
        </p>
      </div>
      <div className={styles.saveSide}>
        <p className={styles.note}>{W.SAVE_NOTE}</p>
        <Button type="button" variant="primary" disabled={!canSave} onClick={() => void save()} className={styles.saveButton}>
          {buttonWords}
        </Button>
        {waitWords ? <p className={styles.hint}>{waitWords}</p> : null}
      </div>
    </div>
  );

  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <Button type="button" variant="secondary" disabled={off} onClick={() => setPasting(true)} aria-expanded={pasting}>
          {W.PASTE_OPEN}
        </Button>
        <Button type="button" variant="secondary" disabled={!hydrated || rows.length === 0} onClick={download}>
          {W.DOWNLOAD}
        </Button>
      </div>

      {pasting ? (
        <PasteRooms
          weekLabel={weekLabel}
          rows={rows}
          drafts={drafts}
          onRooms={fromPaste}
          onClose={() => setPasting(false)}
          saveBar={saveBar}
        />
      ) : null}

      <div className={styles.show} role="group" aria-label={W.SHOW_LABEL}>
        {(
          [
            ["all", `${W.SHOW.all} ${rows.length}`],
            ["notBooked", `${W.SHOW.notBooked} ${notBooked}`],
            ["requests", `${W.SHOW.requests} ${withRequests}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`${styles.showButton} ${show === value ? styles.showOn : ""}`}
            aria-pressed={show === value}
            onClick={() => setShow(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{W.COLUMN.group}</th>
              <th scope="col">{W.COLUMN.when}</th>
              <th scope="col">{W.COLUMN.campus}</th>
              <th scope="col">{W.COLUMN.room}</th>
              <th scope="col">{W.COLUMN.link}</th>
              <th scope="col" className={styles.num}>{W.COLUMN.away}</th>
              <th scope="col" className={styles.num}>{W.COLUMN.online}</th>
              <th scope="col" className={styles.num}>{W.COLUMN.requests}</th>
            </tr>
          </thead>
          <tbody className={styles.body}>
            {rows.map((row) => {
              const preview = previewOf(row);
              const outcome = outcomes[row.key];
              const isChanged = changed.includes(row);
              const notBookedRow = row.room === "" && row.state !== "cancelled";
              return (
                <tr
                  key={row.key}
                  id={rowAnchor(row.key)}
                  className={`${styles.row} ${notBookedRow ? styles.rowNotBooked : ""} ${shownRow(row) ? "" : styles.hidden}`}
                >
                  <th scope="row" className={styles.groupCell}>
                    <span className={styles.programme}>{row.programmeName}</span>
                    <Link href={groupPagePath(roundId, row.programmeId, row.groupId)} className={styles.groupLink}>
                      {row.groupName}
                    </Link>
                  </th>
                  <td data-label={W.COLUMN.when}>{row.when}</td>
                  <td data-label={W.COLUMN.campus}>{row.campus}</td>
                  <td data-label={W.COLUMN.room} className={styles.roomCell}>
                    {editable(row) ? (
                      <>
                        <input
                          className={`${styles.roomInput} ${notBookedRow && !isChanged ? styles.roomEmpty : ""}`}
                          aria-label={W.roomFieldLabel(row.programmeName, row.groupName)}
                          placeholder={W.NOT_BOOKED}
                          value={valueOf(row)}
                          maxLength={GROUP_ROOM_LIMIT}
                          disabled={off}
                          onChange={(event) => setRoom(row.key, event.target.value)}
                        />
                        {row.moved ? <span className={styles.mark}>{W.MOVED_THIS_WEEK}</span> : null}
                      </>
                    ) : (
                      <span className={styles.roomFixed}>
                        <span>{row.state === "cancelled" ? "" : row.room || W.NOT_BOOKED}</span>
                        <span className={styles.mark}>{W.ROW_STATE[row.state!]}</span>
                      </span>
                    )}
                    {isChanged ? (
                      <span className={styles.rowLine} aria-live="polite">
                        {!preview || preview.status === "loading"
                          ? W.CHECKING
                          : preview.status === "refused"
                            ? preview.error
                            : preview.overCap
                              ? TOO_MANY_TO_TELL
                              : W.rowEmailsWords(preview.tells ? preview.emails : 0)}
                      </span>
                    ) : null}
                    {outcome ? (
                      <span className={`${styles.rowLine} ${outcome.tone === "problem" ? styles.problem : styles.done}`} role="status">
                        {outcome.text}
                        {outcome.pending ? (
                          <Button type="button" variant="secondary" disabled={off} onClick={() => void tellAgain(row)}>
                            {TELL_AGAIN}
                          </Button>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                  <td data-label={W.COLUMN.link}>{row.link.words}</td>
                  <td data-label={W.COLUMN.away} className={styles.num}>{row.away}</td>
                  <td data-label={W.COLUMN.online} className={styles.num}>{row.online}</td>
                  <td data-label={W.COLUMN.requests} className={styles.num}>{W.requestsCellWords(row.requests)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pasting ? null : saveBar}
      {said ? (
        <p className={styles.said} role="status">
          {said}
        </p>
      ) : null}
    </div>
  );
}
