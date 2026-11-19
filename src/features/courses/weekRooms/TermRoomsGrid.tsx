"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { roomAsStored } from "@/lib/courses/sessionChange/room";
import { GROUP_ROOM_LIMIT } from "@/lib/courses/weekRooms/limits";
import type { TermCell, TermSection } from "@/lib/courses/weekRooms/model";
import { mergePasted } from "@/lib/courses/weekRooms/paste";
import { saveGroupWeeks, type GridWeek, type Post } from "@/lib/courses/weekRooms/press";
import * as W from "@/lib/courses/weekRooms/words";
import GridPaste from "./GridPaste";
import styles from "./WeekRooms.module.css";

/**
 * THE TERM'S ROOMS: a table a programme, a row a group, a column a taught week
 * of its run. Every cell that can take a room (a session still to come, not
 * called off, not held online) is a field: its room, the usual room, or To be
 * confirmed, and a link to that week's rooms with the group's row in view.
 * Other cells say what they are and link to their week.
 *
 * ONE SAVE, AND IT EMAILS NOBODY. Each changed cell is the room-only change of
 * its week (`POST /api/courses/groups/[groupId]/session/change`, kind
 * `room`), every changed week of one group in one request and one
 * transaction, with Tell the group off; a refused cell says why and the rest
 * are saved. A change people need telling about is saved on that week's
 * page, where Tell the group is. A wide grid scrolls inside its own box.
 */

const postJson: Post = async (url, body) => {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return null;
  }
};

type SessionCell = Extract<TermCell, { kind: "session" }>;

const keyOf = (groupId: string, weekNumber: number) => `${groupId}__${weekNumber}`;

export default function TermRoomsGrid({ sections }: { sections: TermSection[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, { saved: boolean; text: string }>>({});
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const pasted = useRef(new Map<string, string>());

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

  const cells = useMemo(
    () =>
      sections.flatMap((section) =>
        section.rows.flatMap((row) =>
          row.cells.flatMap((cell) => (cell.kind === "session" ? [{ groupId: row.groupId, groupName: row.groupName, cell }] : [])),
        ),
      ),
    [sections],
  );
  const changed = cells.filter(
    ({ groupId, cell }) => cell.state === null && Object.hasOwn(drafts, keyOf(groupId, cell.weekNumber)) && roomAsStored(drafts[keyOf(groupId, cell.weekNumber)]) !== cell.room,
  );
  const off = !hydrated || busy;

  function setRoom(key: string, room: string) {
    setDrafts((now) => ({ ...now, [key]: room }));
    setSaid(null);
  }

  /** What the paste box puts in the fields, as the week's paste box does: a field typed over since stays. */
  const fromPaste = useCallback((rooms: Record<string, string> | null, before: Record<string, string>) => {
    setDrafts((now) => {
      const merged = mergePasted(now, rooms, before, pasted.current);
      pasted.current = merged.pasted;
      return merged.drafts;
    });
    setSaid(null);
  }, []);

  async function save() {
    if (off || changed.length === 0) return;
    setBusy(true);
    setSaid(null);
    const byGroup = new Map<string, GridWeek[]>();
    for (const { groupId, cell } of changed) {
      const list = byGroup.get(groupId) ?? [];
      list.push({ weekNumber: cell.weekNumber, dateKey: cell.dateKey, room: roomAsStored(drafts[keyOf(groupId, cell.weekNumber)]) });
      byGroup.set(groupId, list);
    }
    let saved = 0;
    let refused = 0;
    const done: Record<string, { saved: boolean; text: string }> = {};
    for (const [groupId, weeks] of byGroup) {
      const outcome = await saveGroupWeeks(postJson, groupId, weeks);
      for (const [weekNumber, each] of outcome) {
        done[keyOf(groupId, weekNumber)] = each;
        if (each.saved) saved += 1;
        else refused += 1;
      }
    }
    setOutcomes((now) => ({ ...now, ...done }));
    setDrafts((now) => {
      const next = { ...now };
      for (const [key, each] of Object.entries(done)) if (each.saved) delete next[key];
      return next;
    });
    setSaid(W.gridSavedWords(saved, refused));
    setBusy(false);
    if (saved > 0) router.refresh();
  }

  function field(groupId: string, groupName: string, cell: SessionCell) {
    const key = keyOf(groupId, cell.weekNumber);
    const value = drafts[key] ?? cell.room;
    const isChanged = changed.some((each) => each.groupId === groupId && each.cell.weekNumber === cell.weekNumber);
    const outcome = outcomes[key];
    const label = W.cellFieldLabel(groupName, cell.weekNumber, cell.day);
    return (
      <span className={styles.cellField}>
        <input
          className={`${styles.cellInput} ${isChanged ? styles.cellChanged : ""}`}
          aria-label={label}
          placeholder={W.TO_BE_CONFIRMED}
          value={value}
          maxLength={GROUP_ROOM_LIMIT}
          disabled={off}
          onChange={(event) => setRoom(key, event.target.value)}
        />
        <button
          type="button"
          className={styles.tbcButton}
          aria-label={W.toBeConfirmedLabel(label)}
          disabled={off || roomAsStored(value) === ""}
          onClick={() => setRoom(key, "")}
        >
          {W.TO_BE_CONFIRMED}
        </button>
        {isChanged ? (
          <span className={styles.mark}>{W.CELL_CHANGED}</span>
        ) : cell.roomSource !== "none" ? (
          <span className={styles.mark}>{W.ROOM_SOURCE[cell.roomSource]}</span>
        ) : null}
        {cell.marks.map((mark) => (
          <span key={mark} className={styles.mark}>
            {W.CELL_MARK[mark]}
          </span>
        ))}
        {outcome ? (
          <span className={`${styles.mark} ${outcome.saved ? styles.done : styles.problem}`} role="status">
            {outcome.text}
          </span>
        ) : null}
        <Link href={cell.href} className={styles.cellOpen}>
          {W.OPEN_WEEK}
        </Link>
      </span>
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Button type="button" variant="secondary" disabled={off} onClick={() => setPasting(true)} aria-expanded={pasting}>
          {W.GRID_PASTE_OPEN}
        </Button>
      </div>
      {pasting ? <GridPaste sections={sections} drafts={drafts} onRooms={fromPaste} onClose={() => setPasting(false)} /> : null}

      {sections.map((section) => (
        <section key={section.programmeId} className={styles.section} aria-labelledby={`term-${section.programmeId}`}>
          <h2 id={`term-${section.programmeId}`} className={styles.sectionTitle}>
            {section.programmeName}
          </h2>
          {section.rows.length === 0 ? (
            <p className={styles.lede}>{W.NO_GROUPS}</p>
          ) : (
            <div className={styles.scroll}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <td />
                    {section.weeks.map((week) => (
                      <th key={week.weekNumber} scope="col">
                        {week.label}
                        {week.from ? <span className={styles.gridWeek}>{week.from}</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row) => (
                    <tr key={row.groupId}>
                      <th scope="row">{row.groupName}</th>
                      {row.cells.map((cell) => (
                        <td key={cell.weekNumber}>
                          {cell.kind === "none" ? (
                            <span className={styles.cellNone}>{W.NO_SESSION}</span>
                          ) : cell.state === null ? (
                            field(row.groupId, row.groupName, cell)
                          ) : (
                            <Link href={cell.href} className={styles.cellLink}>
                              <span className={styles.visuallyHidden}>{W.cellLinkLabel(row.groupName, cell.weekNumber, cell.day)}</span>
                              {cell.state === "cancelled" || cell.state === "online" ? null : (
                                <span className={cell.room ? "" : styles.cellEmpty}>{cell.room || W.TO_BE_CONFIRMED}</span>
                              )}
                              {cell.marks.map((mark) => (
                                <span key={mark} className={styles.mark}>
                                  {W.CELL_MARK[mark]}
                                </span>
                              ))}
                            </Link>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <div className={styles.saveBar}>
        <div className={styles.saveSide}>
          <p className={styles.note}>{W.GRID_SAVE_NOTE}</p>
          <Button type="button" variant="primary" disabled={off || changed.length === 0} onClick={() => void save()} className={styles.saveButton}>
            {busy ? W.SAVING : W.gridSaveWords(changed.length)}
          </Button>
        </div>
      </div>
      {said ? (
        <p className={styles.said} role="status">
          {said}
        </p>
      ) : null}
    </>
  );
}
