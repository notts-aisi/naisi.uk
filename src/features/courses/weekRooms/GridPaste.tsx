"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { GROUP_ROOM_LIMIT } from "@/lib/courses/weekRooms/limits";
import { blockRooms, gridCandidatesOf, readBlock, type BlockLine, type CellOutcome } from "@/lib/courses/weekRooms/gridPaste";
import type { TermSection } from "@/lib/courses/weekRooms/model";
import { choiceKeyOf } from "@/lib/courses/weekRooms/paste";
import * as W from "@/lib/courses/weekRooms/words";
import styles from "./WeekRooms.module.css";

/**
 * THE TERM GRID'S PASTE BOX: a block from a spreadsheet, the group then a
 * column a week (`readBlock`). It says which week each column was taken as,
 * asks about every group it cannot place, and puts what it read into the
 * grid's own fields; nothing is saved until the grid's Save, which emails
 * nobody. Cancel takes back what it put.
 */
export default function GridPaste({
  sections,
  drafts,
  onRooms,
  onClose,
}: {
  sections: TermSection[];
  /** The grid's fields as they stand when the box opens. */
  drafts: Record<string, string>;
  onRooms: (rooms: Record<string, string> | null, before: Record<string, string>) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [before] = useState(drafts);
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<Map<string, string>>(new Map());
  const candidates = useMemo(() => gridCandidatesOf(sections), [sections]);
  const byKey = useMemo(() => new Map(candidates.map((each) => [each.key, each] as const)), [candidates]);
  const read = useMemo(() => readBlock(text, sections, chosen), [text, sections, chosen]);
  const roomsKey = JSON.stringify(blockRooms(read));

  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    onRooms(JSON.parse(roomsKey) as Record<string, string>, before);
  }, [roomsKey, before, onRooms]);

  const nameOf = (key: string) => {
    const each = byKey.get(key);
    return each ? W.matchedWords(each.programmeName, each.groupName) : "";
  };
  const choose = (line: BlockLine, key: string) =>
    setChosen((now) => {
      const next = new Map(now);
      if (key) next.set(choiceKeyOf(line), key);
      else next.delete(choiceKeyOf(line));
      return next;
    });

  const cellWords = (outcome: CellOutcome): string => {
    switch (outcome.kind) {
      case "change":
        return outcome.was ? `${outcome.room}. ${W.wasWords(outcome.was)}` : `${outcome.room}. ${W.PASTE_STATE.new}`;
      case "clear":
        return W.clearWords(outcome.was);
      case "same":
        return W.PASTE_STATE.same;
      case "skip":
        return W.skippedWords(outcome.weekNumber, outcome.why);
      case "problem":
        return outcome.problem === "tooLong" ? W.roomTooLongWords(GROUP_ROOM_LIMIT) : W.PASTE_STATE[outcome.problem];
      case "leave":
        return "";
    }
  };

  function groupCell(line: BlockLine): ReactNode {
    if (line.duplicateOf !== null) return W.duplicateWords(line.duplicateOf);
    if (line.groupId) return nameOf(line.groupId);
    const match = line.match;
    if (match.kind === "suggest") {
      return (
        <span className={styles.ask}>
          <span>{W.didYouMeanWords(nameOf(match.key))}</span>
          <Button type="button" variant="secondary" onClick={() => choose(line, match.key)}>
            {W.takeSuggestionWords(byKey.get(match.key)?.groupName ?? "")}
          </Button>
        </span>
      );
    }
    const keys = match.kind === "ambiguous" ? match.keys : candidates.map((each) => each.key);
    const label = match.kind === "ambiguous" ? W.ambiguousWords(keys.map((key) => byKey.get(key)?.programmeName ?? "")) : W.PASTE_STATE.none;
    const selectId = `${ids}-choose-${line.number}`;
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

  const outcomes = read.lines.flatMap((line) => (line.groupId && line.duplicateOf === null ? line.cells.flatMap((cell) => (cell.outcome ? [cell.outcome] : [])) : []));
  const counts = {
    changes: outcomes.filter((each) => each.kind === "change" || each.kind === "clear").length,
    skipped: outcomes.filter((each) => each.kind === "skip" || each.kind === "problem").length,
    left: outcomes.filter((each) => each.kind === "leave").length,
    needYou: read.lines.filter((line) => !line.groupId || line.duplicateOf !== null).length,
  };
  const titleId = `${ids}-title`;
  const textId = `${ids}-text`;
  const close = () => {
    onRooms(null, before);
    onClose();
  };

  return (
    <section className={styles.paste} aria-labelledby={titleId}>
      <div className={styles.pasteHead}>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.pasteTitle}>
          {W.GRID_PASTE_TITLE}
        </h2>
        <Button type="button" variant="ghost" onClick={close}>
          {W.PASTE_CLOSE}
        </Button>
      </div>
      <p className={styles.hint}>{W.GRID_PASTE_LEDE}</p>
      <label htmlFor={textId} className={styles.reasonLabel}>
        {W.PASTE_LABEL}
      </label>
      <textarea id={textId} className={styles.pasteText} rows={6} value={text} onChange={(event) => setText(event.target.value)} />

      {read.lines.length > 0 ? (
        <>
          <ul className={styles.columnsTaken}>
            {read.columns.map((each) => (
              <li key={each.programmeId}>{W.columnsTakenWords(each.programmeName, each.weeks, read.header)}</li>
            ))}
          </ul>
          <div className={styles.scroll}>
            <table className={styles.pasteTable}>
              <thead>
                <tr>
                  <th scope="col">{W.PASTE_COLUMN.pasted}</th>
                  <th scope="col">{W.PASTE_COLUMN.matched}</th>
                  <th scope="col">{W.PASTE_COLUMN.room}</th>
                </tr>
              </thead>
              <tbody>
                {read.lines.map((line) => (
                  <tr key={line.number} className={line.groupId && line.duplicateOf === null ? "" : styles.needsYou}>
                    <td>{line.group}</td>
                    <td>{groupCell(line)}</td>
                    <td>
                      <ul className={styles.blockCells}>
                        {line.cells.flatMap((cell) => {
                          const outcome = cell.outcome;
                          if (!outcome || outcome.kind === "leave") return [];
                          const words = cellWords(outcome);
                          return [
                            <li key={cell.column}>
                              {outcome.kind === "skip" || outcome.weekNumber === null
                                ? words
                                : W.cellLineWords(outcome.weekNumber, words, "day" in outcome ? outcome.day : undefined)}
                            </li>,
                          ];
                        })}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note} role="status">
            {W.blockSummaryWords(counts)}
          </p>
        </>
      ) : null}
      <div className={styles.pasteActions}>
        <Button type="button" variant="secondary" onClick={close}>
          {W.CANCEL}
        </Button>
      </div>
    </section>
  );
}
