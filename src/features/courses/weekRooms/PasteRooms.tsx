"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import type { RoomRow } from "@/lib/courses/weekRooms/model";
import { GROUP_ROOM_LIMIT } from "@/lib/courses/weekRooms/limits";
import { choiceKeyOf, outcomesOf, pasteCounts, readPasted, type LineOutcome, type PastedLine, type PasteCandidate } from "@/lib/courses/weekRooms/paste";
import * as W from "@/lib/courses/weekRooms/words";
import styles from "./WeekRooms.module.css";

/**
 * THE PASTE BOX: two columns from a spreadsheet, group then room, for the
 * week shown. What it matches goes into the rows' own fields, so the table
 * shows it too; nothing is saved until Save, which is the table's own button
 * and presses the same writer, one group at a time. Cancel puts every field
 * back as it was when the box opened.
 *
 * It asks about every line it cannot place, or that fits more than one
 * group, with the site's own Select; and it matches only the rows of the
 * week the page shows, which are the programmes the reader may see. A choice
 * is kept under the line's group as pasted, so more typing in the box keeps
 * it. The box puts into the fields only what it matched, and takes back only
 * a field still holding what it put there: a room typed into the table stays.
 */

/** The rows as the paste box matches them. */
function candidatesOf(rows: readonly RoomRow[]): PasteCandidate[] {
  return rows.map((row) => ({
    key: row.key,
    programmeName: row.programmeName,
    groupName: row.groupName,
    room: row.room,
    notHere: row.state === null ? null : W.ROW_STATE[row.state],
  }));
}

export default function PasteRooms({
  weekLabel,
  rows,
  drafts,
  onRooms,
  onClose,
  saveBar,
}: {
  weekLabel: string;
  rows: readonly RoomRow[];
  /** The fields as they stand when the box opens. */
  drafts: Record<string, string>;
  /** Puts the matched rooms into the fields over `before`, or `before` back when `null`. */
  onRooms: (rooms: Record<string, string> | null, before: Record<string, string>) => void;
  onClose: () => void;
  saveBar: ReactNode;
}) {
  const ids = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // What the fields held when the box opened: Cancel puts it back.
  const [before] = useState(drafts);
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const candidates = useMemo(() => candidatesOf(rows), [rows]);
  const byKey = useMemo(() => new Map(candidates.map((each) => [each.key, each] as const)), [candidates]);
  const lines = useMemo(() => readPasted(text, candidates), [text, candidates]);
  const outcomes = useMemo(() => outcomesOf(lines, candidates, chosen), [lines, candidates, chosen]);
  const counts = pasteCounts(outcomes);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The rooms ready to save go into the fields; nothing else changes.
  const rooms = useMemo(() => {
    const out: Record<string, string> = {};
    for (const outcome of outcomes) {
      if (outcome.kind === "new" || outcome.kind === "change") out[outcome.key] = outcome.room;
      else if (outcome.kind === "clear") out[outcome.key] = "";
    }
    return out;
  }, [outcomes]);
  const roomsKey = JSON.stringify(rooms);
  useEffect(() => {
    onRooms(JSON.parse(roomsKey) as Record<string, string>, before);
  }, [roomsKey, before, onRooms]);

  const nameOf = (key: string) => {
    const row = byKey.get(key);
    return row ? W.matchedWords(row.programmeName, row.groupName) : "";
  };
  const choose = (line: PastedLine, key: string) =>
    setChosen((now) => {
      const next = new Map(now);
      if (key) next.set(choiceKeyOf(line), key);
      else next.delete(choiceKeyOf(line));
      return next;
    });

  /** The line's own status, in the box's third column. */
  function statusOf(outcome: LineOutcome, line: PastedLine): ReactNode {
    const number = line.number;
    switch (outcome.kind) {
      case "new":
        return W.PASTE_STATE.new;
      case "change":
        return W.wasWords(outcome.was);
      case "clear":
        return W.clearWords(outcome.was);
      case "same":
        return W.PASTE_STATE.same;
      case "notHere":
        return W.notThisWeekWords(outcome.why);
      case "duplicate":
        return W.duplicateWords(outcome.firstLine);
      case "room":
        return outcome.problem === "tooLong" ? W.roomTooLongWords(GROUP_ROOM_LIMIT) : W.PASTE_STATE[outcome.problem];
      case "ask": {
        const match = outcome.match;
        if (match.kind === "suggest") {
          const row = byKey.get(match.key);
          return (
            <span className={styles.ask}>
              <span>{W.didYouMeanWords(nameOf(match.key))}</span>
              <Button type="button" variant="secondary" onClick={() => choose(line, match.key)}>
                {W.takeSuggestionWords(row?.groupName ?? "")}
              </Button>
            </span>
          );
        }
        const keys = match.kind === "ambiguous" ? match.keys : candidates.map((each) => each.key);
        const label =
          match.kind === "ambiguous"
            ? W.ambiguousWords(keys.map((key) => byKey.get(key)?.programmeName ?? ""))
            : W.PASTE_STATE.none;
        const selectId = `${ids}-choose-${number}`;
        return (
          <span className={styles.ask}>
            <label htmlFor={selectId}>{label}</label>
            <Select id={selectId} value="" onChange={(event) => choose(line, event.target.value)} aria-label={W.CHOOSE}>
              <option value="">{W.CHOOSE_PLACEHOLDER}</option>
              {keys.map((key) => (
                <option key={key} value={key}>
                  {nameOf(key)}
                </option>
              ))}
            </Select>
          </span>
        );
      }
    }
  }

  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;
  return (
    <section className={styles.paste} aria-labelledby={titleId}>
      <div className={styles.pasteHead}>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.pasteTitle}>
          {W.PASTE_TITLE}
        </h2>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onRooms(null, before);
            onClose();
          }}
        >
          {W.PASTE_CLOSE}
        </Button>
      </div>
      <p className={styles.hint}>{W.PASTE_LEDE}</p>
      <label htmlFor={textId} className={styles.reasonLabel}>
        {W.PASTE_LABEL}
      </label>
      <textarea
        id={textId}
        className={styles.pasteText}
        rows={6}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p className={styles.note}>{W.pasteWeekWords(weekLabel)}</p>

      {lines.length > 0 ? (
        <>
          <div className={styles.scroll}>
            <table className={styles.pasteTable}>
              <thead>
                <tr>
                  <th scope="col">{W.PASTE_COLUMN.pasted}</th>
                  <th scope="col">{W.PASTE_COLUMN.matched}</th>
                  <th scope="col">{W.PASTE_COLUMN.room}</th>
                  <th scope="col">
                    <span className={styles.visuallyHidden}>{W.CHOOSE}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const outcome = outcomes[index];
                  const key = "key" in outcome ? outcome.key : null;
                  const ready = outcome.kind === "new" || outcome.kind === "change" || outcome.kind === "clear" || outcome.kind === "same";
                  return (
                    <tr key={line.number} className={ready ? "" : styles.needsYou}>
                      <td>{line.group}</td>
                      <td>{key ? nameOf(key) : ""}</td>
                      <td>{line.room}</td>
                      <td>
                        {statusOf(outcome, line)}
                        {line.ignored ? <span className={styles.mark}>{W.IGNORED_COLUMN}</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.note} role="status">
            {W.pasteSummaryWords(counts)}
          </p>
        </>
      ) : null}

      <div className={styles.pasteActions}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onRooms(null, before);
            onClose();
          }}
        >
          {W.CANCEL}
        </Button>
      </div>
      {saveBar}
    </section>
  );
}
