"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useDebouncedWrite } from "@/hooks/useDebouncedWrite";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import {
  REFLECT,
  REFLECTIONS_UNAVAILABLE,
  REFLECTION_NOT_SAVED,
  REFLECTION_PLACEHOLDER,
  SAVED,
} from "@/lib/courses/memberPageWords";
import type { ReflectionBlock, ReflectionPrompt } from "@/lib/courses/weekBlocks/model";
import { REFLECTION_MAX_CHARS } from "@/lib/firestore/courseExercises";
import styles from "./blockWeek.module.css";

/**
 * A REFLECTION STOP (boards st-week1-phone, wk-week-phone): one or two
 * prompts, each a labelled box that saves as the person types, "Saved" once
 * what the box shows is stored, and on the page's first stop who reads them
 * (Q30) and that a line may be read out without the name (Q37).
 *
 * WHO SEES A BOX. Somebody taking part sees their own boxes; once their
 * enrolment is over (a finished programme) the boxes show what they wrote
 * and take no more. Facilitators and admins reading the week see the prompts
 * and no box: a reflection is the person's own words, and no page here shows
 * anybody else's.
 *
 * NEVER A WRITABLE BOX OVER WHAT WE DO NOT KNOW. A box's row is addressed by
 * a fixed id, so a box that started empty because its row failed to load
 * would write over the stored words with the first keystroke. Until the
 * person's own rows have loaded (`loaded`), the stop says so instead, with a
 * way to try again.
 *
 * THE WRITE is `PUT /api/courses/runs/[runId]/reflections/[promptId]`,
 * through `useDebouncedWrite` (one writer, newest value wins, flushed on blur,
 * on leaving and on the page being hidden): every change either sends what
 * the box now holds or cancels what was waiting, as the exercise answer's
 * box does. An emptied box sends "" and the route removes the row.
 */

type Props = {
  block: ReflectionBlock;
  runId: string;
  /** The week's document id ("w01"): the route finds the box in it. */
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
  /** The lines under the page's first stop, or null under any other. A facilitator's own has no read-out line. */
  readers: { access: string; readOut: string | null } | null;
  /** Hands each stored row back to the page, so its counts move as the box saves. */
  onSaved: (row: ExerciseResponseWire) => void;
};

export default function ReflectStop({
  block,
  runId,
  weekId,
  rows,
  loaded,
  loading,
  onRetry,
  ownBoxes,
  canWrite,
  readers,
  onSaved,
}: Props) {
  const showBoxes = ownBoxes && loaded;
  return (
    <section className={styles.reflect} aria-label={REFLECT}>
      <p className={styles.reflectLabel} aria-hidden="true">
        {REFLECT}
      </p>
      {ownBoxes && !loaded && !loading && (
        <div className={styles.reflectBlocked}>
          <p className={styles.reflectBlockedText}>{REFLECTIONS_UNAVAILABLE}</p>
          <button type="button" className={styles.quietButton} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {block.prompts.map((prompt) =>
        showBoxes ? (
          <ReflectionBox
            key={prompt.id}
            prompt={prompt}
            runId={runId}
            weekId={weekId}
            stored={rows.get(prompt.id)?.text ?? ""}
            canWrite={canWrite}
            onSaved={onSaved}
          />
        ) : (
          <p key={prompt.id} className={styles.promptText}>
            {prompt.text}
          </p>
        ),
      )}
      {readers && ownBoxes && (
        <div className={styles.readers}>
          <p className={styles.readersLine}>{readers.access}</p>
          {readers.readOut && <p className={styles.readersLine}>{readers.readOut}</p>}
        </div>
      )}
    </section>
  );
}

/** A refusal with the route's own sentence. */
class ReflectionSaveError extends Error {}

async function putReflection(args: {
  runId: string;
  promptId: string;
  weekId: string;
  text: string;
  keepalive: boolean;
}): Promise<ExerciseResponseWire> {
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(args.runId)}/reflections/${encodeURIComponent(args.promptId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: args.weekId, text: args.text }),
      // A box holds at most REFLECTION_MAX_CHARS, far under a keepalive
      // request's budget, so the last change outlives the page.
      keepalive: args.keepalive,
    },
  );
  const body = (await res.json().catch(() => null)) as { response?: ExerciseResponseWire; error?: string } | null;
  if (!res.ok || !body?.response) {
    throw new ReflectionSaveError(body?.error ?? REFLECTION_NOT_SAVED);
  }
  return body.response;
}

function ReflectionBox({
  prompt,
  runId,
  weekId,
  stored,
  canWrite,
  onSaved,
}: {
  prompt: ReflectionPrompt;
  runId: string;
  weekId: string;
  stored: string;
  canWrite: boolean;
  onSaved: (row: ExerciseResponseWire) => void;
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
      const row = await putReflection({ runId, promptId: prompt.id, weekId, text, keepalive: opts.keepalive });
      onSaved(row);
    },
    [onSaved, prompt.id, runId, weekId],
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
  const showSaved = saver.state !== "error" && !pending && stored.trim() !== "";

  return (
    <div className={styles.prompt}>
      <label htmlFor={fieldId} className={styles.promptLabel}>
        {prompt.text}
      </label>
      <textarea
        id={fieldId}
        className={styles.box}
        value={value}
        rows={3}
        maxLength={REFLECTION_MAX_CHARS}
        placeholder={canWrite ? REFLECTION_PLACEHOLDER : undefined}
        readOnly={!canWrite}
        onChange={(event) => handleChange(event.currentTarget.value)}
        onBlur={() => {
          if (canWrite) void saver.flush();
        }}
      />
      <p className={styles.boxStatus} aria-live="polite">
        {saver.state === "error" ? (
          <span className={styles.boxError}>{saver.error?.message || REFLECTION_NOT_SAVED}</span>
        ) : showSaved ? (
          <span className={styles.saved}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {SAVED}
          </span>
        ) : null}
      </p>
    </div>
  );
}
