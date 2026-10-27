"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDebouncedWrite } from "@/hooks/useDebouncedWrite";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import {
  FILL_IN_SAVE_LINE,
  FILL_IN_UNAVAILABLE,
  filledWords,
  withHint,
} from "@/lib/courses/fillInWords";
import { REFLECTION_NOT_SAVED, SAVED } from "@/lib/courses/memberPageWords";
import type { FillInBlock, FillInBox } from "@/lib/courses/weekBlocks/model";
import { FILL_IN_MAX_CHARS } from "@/lib/firestore/courseExercises";
import styles from "./blockWeek.module.css";
import { putFillIn } from "./boxWrites";
import own from "./fillIn.module.css";

/**
 * A WEEK'S FILL-IN BOXES (board wk-week6-phone, part 3 "Your action plan"):
 * the card's title, how many of its boxes hold something ("6 of 12 filled"),
 * that it saves as you type, each numbered heading with its box or its
 * labelled boxes, one "Saved" for the card, and who reads it.
 *
 * WHO SEES A BOX. Somebody taking part sees their own boxes; once their
 * enrolment is over (a finished programme) the boxes show what they wrote
 * and take no more. Facilitators and admins reading the week see the
 * headings and labels and no box: what a person writes here is read by the
 * people the line under it names, through their own pages, never this one.
 *
 * NEVER A WRITABLE BOX OVER WHAT WE DO NOT KNOW. Each box's row is addressed
 * by a fixed id, so a box that started empty because its row failed to load
 * would write over the stored words with the first keystroke. Until the
 * person's own rows have loaded (`loaded`), the card says so instead, with a
 * way to try again.
 *
 * THE WRITE is `PUT /api/courses/runs/[runId]/fill-in-boxes/[boxId]`
 * (`putFillIn`, `./boxWrites.ts`), one writer per box through
 * `useDebouncedWrite` (newest value wins, flushed on blur, on leaving and on
 * the page being hidden), as a reflection box's is. An emptied box sends ""
 * and the route removes the row. A box that did not save says so under
 * itself, in the route's own sentence when the route refused it and the
 * connection's only when no answer came back; the card's "Saved" shows only
 * once every box has what it shows stored.
 */

type Props = {
  block: FillInBlock;
  runId: string;
  /** The week's document id ("w06"): the route finds the box in it. */
  weekId: string;
  /** The person's own stored rows for the week, by the item's id. */
  rows: ReadonlyMap<string, ExerciseResponseWire>;
  /** The rows have loaded: an absent row really is an empty box. */
  loaded: boolean;
  loading: boolean;
  onRetry: () => void;
  /** Somebody taking part (their own boxes are drawn). */
  ownBoxes: boolean;
  /** Their enrolment is active: the boxes take writing. */
  canWrite: boolean;
  /** Who reads what is written here, for the line under the card. */
  readers: string;
  /** Hands each stored row back to the page, so its counts move as a box saves. */
  onSaved: (row: ExerciseResponseWire) => void;
};

type BoxStatus = { pending: boolean; failed: boolean };

export default function FillInCard({ block, runId, weekId, rows, loaded, loading, onRetry, ownBoxes, canWrite, readers, onSaved }: Props) {
  const titleId = useId();
  const showBoxes = ownBoxes && loaded;
  const boxes = block.groups.flatMap((group) => group.boxes);
  const stored = (boxId: string) => rows.get(boxId)?.text?.trim() ?? "";
  const filled = boxes.filter((box) => stored(box.id) !== "").length;

  // Each box says where it stands; the card's one "Saved" waits for them all.
  const [statuses, setStatuses] = useState<ReadonlyMap<string, BoxStatus>>(new Map());
  const report = useCallback((boxId: string, status: BoxStatus) => {
    setStatuses((prev) => {
      const was = prev.get(boxId);
      if (was && was.pending === status.pending && was.failed === status.failed) return prev;
      const next = new Map(prev);
      next.set(boxId, status);
      return next;
    });
  }, []);
  const anyPending = [...statuses.values()].some((status) => status.pending);
  const anyFailed = [...statuses.values()].some((status) => status.failed);
  const showSaved = showBoxes && !anyPending && !anyFailed && filled > 0;

  return (
    <section className={own.card} aria-labelledby={titleId}>
      <div className={own.head}>
        <p id={titleId} className={own.title}>
          {block.title}
        </p>
        {ownBoxes && boxes.length > 0 && <p className={own.count}>{filledWords(filled, boxes.length)}</p>}
      </div>
      {ownBoxes && canWrite && <p className={own.saveLine}>{FILL_IN_SAVE_LINE}</p>}
      {ownBoxes && !loaded && !loading && (
        <div className={styles.reflectBlocked}>
          <p className={styles.reflectBlockedText}>{FILL_IN_UNAVAILABLE}</p>
          <button type="button" className={styles.quietButton} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      <ol className={own.groups} role="list">
        {block.groups.map((group, index) => {
          const heading = withHint(group.heading);
          // A heading with one unlabelled box names that box, by its words alone (its hint is not part of the name).
          const headingId = `${titleId}-h${index}`;
          const single = group.boxes.length === 1 && !group.boxes[0].label.trim();
          return (
            <li key={index} className={own.group}>
              <h4 className={own.heading}>
                <span className={own.number} aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <span id={headingId}>{heading.words}</span>
                  {heading.hint && <span className={own.hint}> {heading.hint}</span>}
                </span>
              </h4>
              {group.boxes.map((box) =>
                showBoxes ? (
                  <FillInBoxField
                    key={box.id}
                    box={box}
                    labelledBy={single ? headingId : null}
                    runId={runId}
                    weekId={weekId}
                    stored={rows.get(box.id)?.text ?? ""}
                    canWrite={canWrite}
                    onSaved={onSaved}
                    onStatus={report}
                  />
                ) : box.label.trim() ? (
                  <p key={box.id} className={own.labelText}>
                    {withHint(box.label).words}
                    {withHint(box.label).hint && <span className={own.hint}> {withHint(box.label).hint}</span>}
                  </p>
                ) : null,
              )}
            </li>
          );
        })}
      </ol>
      {showBoxes && (
        <p className={own.status} aria-live="polite">
          {showSaved && (
            <span className={styles.saved}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              {SAVED}
            </span>
          )}
        </p>
      )}
      {ownBoxes && <p className={own.readers}>{readers}</p>}
    </section>
  );
}

function FillInBoxField({
  box,
  labelledBy,
  runId,
  weekId,
  stored,
  canWrite,
  onSaved,
  onStatus,
}: {
  box: FillInBox;
  /** The heading's id, for a heading's one unlabelled box; null for a box with a label of its own. */
  labelledBy: string | null;
  runId: string;
  weekId: string;
  stored: string;
  canWrite: boolean;
  onSaved: (row: ExerciseResponseWire) => void;
  onStatus: (boxId: string, status: BoxStatus) => void;
}) {
  const fieldId = useId();
  const [value, setValue] = useState(stored);
  const [touched, setTouched] = useState(false);
  // Has a write gone out this visit? From then on, an emptied box is a change
  // worth sending even while the echo of the first write is still on its way.
  const dispatchedRef = useRef(false);

  // A row that arrives after the box was drawn seeds it, but never once the
  // person has typed: a late answer must not replace what they are writing.
  const [seeded, setSeeded] = useState(stored);
  if (!touched && stored !== seeded) {
    setSeeded(stored);
    setValue(stored);
  }

  const write = useCallback(
    async (text: string, opts: { keepalive: boolean }) => {
      dispatchedRef.current = true;
      const row = await putFillIn({ runId, boxId: box.id, weekId, text, keepalive: opts.keepalive });
      onSaved(row);
    },
    [box.id, onSaved, runId, weekId],
  );
  // Leaving the week, or the page being hidden, with a change waiting sends
  // it: the writer's own unmount and page-hide paths, with keepalive.
  const saver = useDebouncedWrite(write);

  const handleChange = (next: string) => {
    setTouched(true);
    setValue(next);
    if (!canWrite) {
      saver.cancel();
      return;
    }
    if (!next.trim()) {
      // Emptying a box that holds something stored (or sent a moment ago)
      // removes it; emptying one that never held anything sends nothing, and
      // cancels whatever the last keystroke had waiting.
      if (stored || dispatchedRef.current) saver.push("");
      else saver.cancel();
      return;
    }
    saver.push(next);
  };

  const pending = touched && value.trim() !== stored.trim();
  const failed = saver.state === "error";
  useEffect(() => {
    onStatus(box.id, { pending, failed });
  }, [box.id, failed, onStatus, pending]);

  const label = withHint(box.label);
  return (
    <div className={own.field}>
      {!labelledBy && (
        <label htmlFor={fieldId} className={own.label}>
          {label.words}
          {label.hint && <span className={own.hint}> {label.hint}</span>}
        </label>
      )}
      <textarea
        id={fieldId}
        className={own.box}
        value={value}
        rows={3}
        maxLength={FILL_IN_MAX_CHARS}
        readOnly={!canWrite}
        aria-labelledby={labelledBy ?? undefined}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onBlur={() => {
          if (canWrite) void saver.flush();
        }}
      />
      {failed && (
        <p className={styles.boxStatus} role="alert">
          <span className={styles.boxError}>{saver.error?.message || REFLECTION_NOT_SAVED}</span>
        </p>
      )}
    </div>
  );
}
