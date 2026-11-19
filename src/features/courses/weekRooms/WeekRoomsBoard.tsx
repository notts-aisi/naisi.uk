"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { downloadCSV, toCSV } from "@/lib/csv";
import { groupPagePath } from "@/lib/courses/groupPage/words";
import { TELL_LABEL, TOO_MANY_TO_TELL } from "@/lib/courses/sessionChange/words";
import { roomAsStored } from "@/lib/courses/sessionChange/room";
import { weekRoomsCsv } from "@/lib/courses/weekRooms/csv";
import { CHANGE_REASON_LIMIT, GROUP_ROOM_LIMIT } from "@/lib/courses/weekRooms/limits";
import { askPreview, emailsOf, saveRoom, type Post, type RoomOutcome, type RoomPreview } from "@/lib/courses/weekRooms/press";
import type { RoomRow } from "@/lib/courses/weekRooms/model";
import { mergePasted } from "@/lib/courses/weekRooms/paste";
import { rowAnchor } from "@/lib/courses/weekRooms/paths";
import * as W from "@/lib/courses/weekRooms/words";
import PasteRooms from "./PasteRooms";
import styles from "./WeekRooms.module.css";

/**
 * THE WEEK'S ROOMS, the table: one row per group's session in the week, its
 * room set or changed in the row, the paste box, Tell the group, the button
 * that saves them and Download.
 *
 * ONE WRITER, AND NOTHING BESIDE IT. A changed room is the room-only change
 * of that week (`POST /api/courses/groups/[groupId]/session/change`, kind
 * `room`): its room and nothing else. As soon as a field changes it is asked
 * with `preview: true`, which changes nothing and answers with the writer's
 * own refusal or with whom the group's notice would email; on Save each row
 * is pressed with the reason (optional) and, with Tell the group on, the
 * count. The route saves the room and tells the group itself in the same
 * request, so a tab closed mid-save cannot split the two; while a Save is
 * going the browser asks before the page is left.
 *
 * ONE GROUP AT A TIME. Save presses each changed row in turn and says, in the
 * row, what happened. A count that changed, fell to nobody or passed one
 * send's limit is answered 409 with the new facts and nothing changed for that
 * group: the row takes them and the button counts again.
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
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [notTold, setNotTold] = useState<string[]>([]);
  const [show, setShow] = useState<Show>("all");
  const [pasting, setPasting] = useState(false);
  const asked = useRef(new Map<string, string>());

  // While a Save is going, the browser asks before the page is left.
  useEffect(() => {
    if (!busy) return;
    const hold = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", hold);
    return () => window.removeEventListener("beforeunload", hold);
  }, [busy]);

  const editable = (row: RoomRow) => row.state === null;
  const valueOf = (row: RoomRow) => drafts[row.key] ?? row.room;
  /** The room a field holds, as it would be stored: "TBC" and the like are no room. */
  const storedOf = (row: RoomRow) => roomAsStored(valueOf(row));
  const changed = useMemo(
    () => rows.filter((row) => row.state === null && roomAsStored(drafts[row.key] ?? row.room) !== row.room),
    [rows, drafts],
  );

  // Ask the writer what each changed room would do, a moment after the last
  // keystroke; the newest question for a row wins.
  const question = JSON.stringify(changed.map((row) => [row.key, roomAsStored(drafts[row.key] ?? row.room)]));
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
    return preview && preview.room === storedOf(row) ? preview : null;
  };
  const ready = changed.filter((row) => previewOf(row)?.status === "ok");
  const checking = changed.some((row) => {
    const preview = previewOf(row);
    return !preview || preview.status === "loading";
  });
  const people = tell ? ready.reduce((sum, row) => sum + emailsOf(previewOf(row)), 0) : 0;
  const groups = tell ? new Set(ready.filter((row) => emailsOf(previewOf(row)) > 0).map((row) => row.groupId)).size : 0;
  const off = !hydrated || busy;
  const canSave = !off && ready.length > 0 && !checking;
  const buttonWords = busy ? W.SAVING : ready.length > 0 ? W.saveButtonWords(ready.length, groups, people) : W.NOTHING_TO_SAVE;
  const waitWords = changed.length > 0 && checking ? W.WAIT_FOR_CHECKS : null;

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
    const untold: string[] = [];
    for (const row of ready) {
      const preview = previewOf(row);
      if (preview?.status !== "ok") continue;
      const outcome = await saveRoom(postJson, row, storedOf(row), preview, why, tell);
      if (outcome.asked) {
        // The count no longer holds: nothing changed; the row asks again with the new facts.
        const { emails, overCap } = outcome.asked;
        setPreviews((now) => ({ ...now, [row.key]: { ...preview, emails, overCap, tells: !overCap && emails > 0 } }));
      }
      if (outcome.saved) {
        saved += 1;
        if (outcome.notTold) untold.push(`${row.programmeName}, ${row.groupName}`);
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
    setNotTold((now) => [...now, ...untold]);
    setBusy(false);
    if (saved > 0) router.refresh();
  }

  function download() {
    const { header, body } = weekRoomsCsv(rows);
    downloadCSV(W.weekFileName(monday), toCSV(header, body));
  }

  /**
   * What the paste box puts in the fields; `null` takes back what it put. A
   * field is taken back to what it held when the box opened only while it
   * still holds what the box put there: a room typed into the table stays, and
   * a row saved meanwhile (its field gone) is left alone.
   */
  const pasted = useRef(new Map<string, string>());
  const fromPaste = useCallback((rooms: Record<string, string> | null, before: Record<string, string>) => {
    setDrafts((now) => {
      const merged = mergePasted(now, rooms, before, pasted.current);
      pasted.current = merged.pasted;
      return merged.drafts;
    });
    setSaid(null);
  }, []);

  const notBookedRow = (row: RoomRow) => row.state === null && row.room === "";
  const shownRow = (row: RoomRow) => show === "all" || (show === "notBooked" ? notBookedRow(row) : row.requests > 0);
  const notBooked = rows.filter(notBookedRow).length;
  const withRequests = rows.filter((row) => row.requests > 0).length;
  const reasonId = `${ids}-reason`;
  const reasonHintId = `${ids}-reason-hint`;
  const tellId = `${ids}-tell`;

  const saveBar = (
    <div className={styles.saveBar}>
      <div className={styles.reason}>
        <label className={styles.reasonLabel} htmlFor={reasonId}>
          {W.REASON_LABEL}
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
        <label className={styles.tell} htmlFor={tellId}>
          <input
            id={tellId}
            type="checkbox"
            role="switch"
            className={styles.tellInput}
            checked={tell}
            disabled={off}
            onChange={(event) => setTell(event.target.checked)}
          />
          {TELL_LABEL}
        </label>
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
              const empty = notBookedRow(row);
              const where = `${row.programmeName}, ${row.groupName}`;
              return (
                <tr
                  key={row.key}
                  id={rowAnchor(row.key)}
                  className={`${styles.row} ${empty ? styles.rowNotBooked : ""} ${shownRow(row) ? "" : styles.hidden}`}
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
                        <span className={styles.roomField}>
                          <input
                            className={`${styles.roomInput} ${empty && !isChanged ? styles.roomEmpty : ""}`}
                            aria-label={W.roomFieldLabel(row.programmeName, row.groupName)}
                            placeholder={W.TO_BE_CONFIRMED}
                            value={valueOf(row)}
                            maxLength={GROUP_ROOM_LIMIT}
                            disabled={off}
                            onChange={(event) => setRoom(row.key, event.target.value)}
                          />
                          <button
                            type="button"
                            className={styles.tbcButton}
                            aria-label={W.toBeConfirmedLabel(where)}
                            disabled={off || storedOf(row) === ""}
                            onClick={() => setRoom(row.key, "")}
                          >
                            {W.TO_BE_CONFIRMED}
                          </button>
                        </span>
                        {!isChanged && row.roomSource !== "none" ? <span className={styles.mark}>{W.ROOM_SOURCE[row.roomSource]}</span> : null}
                        {row.moved ? <span className={styles.mark}>{W.MOVED_THIS_WEEK}</span> : null}
                      </>
                    ) : (
                      <span className={styles.roomFixed}>
                        <span>{row.state === "cancelled" || row.state === "online" ? "" : row.room || W.TO_BE_CONFIRMED}</span>
                        <span className={styles.mark}>{W.ROW_STATE[row.state!]}</span>
                      </span>
                    )}
                    {isChanged ? (
                      <span className={styles.rowLine} aria-live="polite">
                        {!preview || preview.status === "loading"
                          ? W.CHECKING
                          : preview.status === "refused"
                            ? preview.error
                            : preview.quiet
                              ? W.SPELLING_ONLY
                              : !tell
                              ? W.rowEmailsWords(0)
                              : preview.overCap
                                ? TOO_MANY_TO_TELL
                                : W.rowEmailsWords(preview.tells ? preview.emails : 0)}
                      </span>
                    ) : null}
                    {outcome ? (
                      <span className={`${styles.rowLine} ${outcome.tone === "problem" ? styles.problem : styles.done}`} role="status">
                        {outcome.text}
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
      {notTold.length > 0 ? (
        <p className={`${styles.said} ${styles.problem}`} role="status">
          {W.notToldSummaryWords(notTold)}
        </p>
      ) : null}
    </div>
  );
}
