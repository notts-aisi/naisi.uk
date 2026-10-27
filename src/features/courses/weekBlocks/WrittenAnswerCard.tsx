"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useDebouncedWrite } from "@/hooks/useDebouncedWrite";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import { SAVED } from "@/lib/courses/memberPageWords";
import { rowNamesInWords } from "@/lib/courses/rubric";
import type { WrittenAnswerBlock } from "@/lib/courses/weekBlocks/model";
import { answerWords, countWords } from "@/lib/courses/writtenAnswers/model";
import {
  ANSWER_NOT_SAVED,
  WRITTEN_ANSWER,
  YOUR_ANSWER,
  alsoReadByWords,
  changeUntilWords,
  dueLineWords,
  feedbackFromWords,
  lockedLineWords,
  readersFeedbackWords,
  reopenedLineWords,
  seenWhereWords,
  sendToWords,
  sentLineWords,
  wordCountWords,
} from "@/lib/courses/writtenAnswerWords";
import Prose from "./Prose";
import styles from "./blockWeek.module.css";
import own from "./writtenAnswer.module.css";

/**
 * THE WEEK'S WRITTEN ANSWER ON THE WEEK PAGE (boards wk-week, wk-week-phone;
 * Q30 C, Q33): the question, what a strong answer does, "Your answer" (one
 * box, or a box per label for an answer in labelled boxes, sent together),
 * a live count of words against the range, a box that saves as the person
 * types, Send, the day it is due for their own group, and who reads it.
 *
 * WHO SEES THE BOX. Somebody taking part: a fellow placed in a group, or a
 * facilitator writing their own answer. Anybody else reading the week (an
 * admin, the run's other staff) sees the question and no box.
 *
 * AFTER SEND the answer is "Sent" and still saves as they type, until one of
 * its reviewers opens it on the review page; from then on the box is read
 * only and says who opened it and when ("Rahul opened it on Tue 17 Nov at
 * 9:58am, so it can’t change now."). "Reopen for edits" hands it back and
 * the box says so. Once feedback is sent, "Feedback from Rahul" leads to it.
 * The person never sees "Late": that is shown to staff only.
 *
 * NEVER A WRITABLE BOX OVER WHAT WE DO NOT KNOW: until the person's own rows
 * have loaded, the card says so instead, as the reflection boxes do.
 *
 * THE WRITE is `PUT /api/courses/runs/[runId]/written-answers/[answerId]`
 * through `useDebouncedWrite` (one writer, newest value wins, flushed on
 * blur, on leaving and on the page being hidden); Send flushes what is
 * waiting, then sends what the box shows.
 */

type Readers = { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null };

type Props = {
  block: WrittenAnswerBlock;
  runId: string;
  weekId: string;
  weekNumber: number;
  /** The person's own stored row for this answer, or null. */
  row: ExerciseResponseWire | null;
  loaded: boolean;
  loading: boolean;
  onRetry: () => void;
  /** Somebody taking part: their own box is drawn. */
  ownBox: boolean;
  /** Their place is active (or they facilitate a live group): the box takes writing. */
  canWrite: boolean;
  /** Who reads it and gives feedback: their group's facilitators, or the lead and admins for a facilitator's own. */
  readers: Readers;
  /** The programme's lead's first name, for who else reads it. */
  leadName: string | null;
  /** The rows of the course's rubric, by name; empty for a course with none. */
  feedbackOn: string[];
  /** When it is due for the person's group (`dueMoment`), or null with no date to give. */
  due: { dateKey: string } | null;
  dayBeforeTime: string | null;
  first: boolean;
  todayKey: string;
  onSaved: (row: ExerciseResponseWire) => void;
};

/** A refusal with the route's own sentence. */
class AnswerSaveError extends Error {}

type Body = { text: string } | { boxes: Record<string, string> };

async function putAnswer(args: {
  runId: string;
  answerId: string;
  weekId: string;
  body: Body;
  send: boolean;
  keepalive: boolean;
}): Promise<ExerciseResponseWire | null> {
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(args.runId)}/written-answers/${encodeURIComponent(args.answerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: args.weekId, ...args.body, send: args.send }),
      keepalive: args.keepalive,
    },
  );
  const out = (await res.json().catch(() => null)) as { response?: ExerciseResponseWire; error?: string } | null;
  if (!res.ok || !out?.response) throw new AnswerSaveError(out?.error ?? ANSWER_NOT_SAVED);
  return out.response;
}

/** The box's value as one string: the answer, or every box joined, for "has anything changed". */
function valueKey(value: Body): string {
  return "text" in value ? value.text.trim() : JSON.stringify(Object.entries(value.boxes).map(([id, text]) => [id, text.trim()]));
}

function storedValue(block: WrittenAnswerBlock, row: ExerciseResponseWire | null): Body {
  if (block.boxes.length > 0) {
    const stored = row?.written?.boxes ?? {};
    return { boxes: Object.fromEntries(block.boxes.map((box) => [box.id, stored[box.id] ?? ""])) };
  }
  return { text: row?.text ?? "" };
}

export default function WrittenAnswerCard(props: Props) {
  const { block, ownBox, loaded, loading, onRetry } = props;
  return (
    <section className={own.card} aria-label={WRITTEN_ANSWER}>
      <p className={own.eyebrow}>{WRITTEN_ANSWER}</p>
      <Prose prose={block.prompt} className={own.prompt} listClassName={styles.list} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
      {block.guidance.length > 0 && (
        <Prose prose={block.guidance} className={styles.body} listClassName={styles.list} linkClassName={styles.inlineLink} tableClassName={styles.table} codeClassName={styles.code} />
      )}
      {ownBox && !loaded && !loading && (
        <div className={styles.reflectBlocked}>
          <p className={styles.reflectBlockedText}>We couldn’t load your answer. Reload before writing, so you don’t write over it.</p>
          <button type="button" className={styles.quietButton} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {ownBox && loaded && <AnswerForm {...props} />}
    </section>
  );
}

function AnswerForm({
  block,
  runId,
  weekId,
  weekNumber,
  row,
  canWrite,
  readers,
  leadName,
  feedbackOn,
  due,
  dayBeforeTime,
  first,
  todayKey,
  onSaved,
}: Props) {
  const fieldId = useId();
  const stored = storedValue(block, row);
  const [value, setValue] = useState<Body>(stored);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const dispatchedRef = useRef(false);

  // A row that arrives after the form was drawn seeds it, but never once the
  // person has typed: a late answer must not replace what they are writing.
  const storedKey = valueKey(stored);
  const [seeded, setSeeded] = useState(storedKey);
  if (!touched && storedKey !== seeded) {
    setSeeded(storedKey);
    setValue(stored);
  }

  const written = row?.written ?? null;
  const locked = Boolean(written?.opened || written?.feedback);
  const sent = Boolean(written?.firstSentAt);
  const writable = canWrite && !locked;

  const write = useCallback(
    async (next: Body, opts: { keepalive: boolean }) => {
      dispatchedRef.current = true;
      const saved = await putAnswer({ runId, answerId: block.id, weekId, body: next, send: false, keepalive: opts.keepalive });
      if (saved) onSaved(saved);
    },
    [block.id, onSaved, runId, weekId],
  );
  const saver = useDebouncedWrite(write);

  const change = (next: Body) => {
    setTouched(true);
    setValue(next);
    setSendError(null);
    if (!writable) {
      saver.cancel();
      return;
    }
    if (!valueKey(next) || ("boxes" in next && Object.values(next.boxes).every((text) => !text.trim()))) {
      // Emptying what is stored (or was sent a moment ago) removes it;
      // emptying what never held anything sends nothing.
      if (row || dispatchedRef.current) saver.push(next);
      else saver.cancel();
      return;
    }
    saver.push(next);
  };

  const send = async () => {
    if (!writable || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await saver.flush();
      const saved = await putAnswer({ runId, answerId: block.id, weekId, body: value, send: true, keepalive: false });
      if (saved) onSaved(saved);
      saver.reset();
      setTouched(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : ANSWER_NOT_SAVED);
    } finally {
      setSending(false);
    }
  };

  const words = "text" in value ? countWords(value.text) : answerWords("", value.boxes);
  const over = block.words !== null && words > block.words.max;
  const pending = touched && valueKey(value) !== storedKey;
  const showSaved = saver.state !== "error" && !pending && storedKey !== "" && words > 0;
  const rubric = feedbackOn.length > 0 ? { count: feedbackOn.length, inWords: rowNamesInWords(feedbackOn) } : null;
  const opened = written?.opened ? { byName: written.opened.byName, at: new Date(written.opened.at) } : null;
  const reopened = !opened && written?.reopened ? { byName: written.reopened.byName, at: new Date(written.reopened.at) } : null;
  const feedbackHref = `/learn/${encodeURIComponent(runId)}/weeks/${weekNumber}/feedback`;

  const status = (
    <p className={styles.boxStatus} aria-live="polite">
      {saver.state === "error" ? (
        <span className={styles.boxError}>{saver.error?.message || ANSWER_NOT_SAVED}</span>
      ) : showSaved ? (
        <span className={styles.saved}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {SAVED}
        </span>
      ) : null}
    </p>
  );

  return (
    <div className={own.form}>
      {block.boxes.length > 0 ? (
        <fieldset className={own.boxes}>
          <legend className={own.label}>{YOUR_ANSWER}</legend>
          {block.boxes.map((box) => {
            const id = `${fieldId}-${box.id}`;
            const boxes = "boxes" in value ? value.boxes : {};
            return (
              <div key={box.id} className={own.boxRow}>
                <label htmlFor={id} className={own.boxLabel}>
                  {box.label}
                </label>
                {box.hint && <p className={own.boxHint}>{box.hint}</p>}
                <textarea
                  id={id}
                  className={`${styles.box} ${own.answerBox}`}
                  value={boxes[box.id] ?? ""}
                  rows={3}
                  readOnly={!writable}
                  onChange={(event) => change({ boxes: { ...boxes, [box.id]: event.currentTarget.value } })}
                  onBlur={() => {
                    if (writable) void saver.flush();
                  }}
                />
              </div>
            );
          })}
        </fieldset>
      ) : (
        <div>
          <label htmlFor={fieldId} className={own.label}>
            {YOUR_ANSWER}
          </label>
          <textarea
            id={fieldId}
            className={`${styles.box} ${own.answerBox}`}
            value={"text" in value ? value.text : ""}
            rows={8}
            readOnly={!writable}
            onChange={(event) => change({ text: event.currentTarget.value })}
            onBlur={() => {
              if (writable) void saver.flush();
            }}
          />
        </div>
      )}
      <div className={own.countRow}>
        {status}
        <p className={over ? own.countOver : own.count}>{wordCountWords(words, block.words)}</p>
      </div>

      {opened ? (
        <p className={own.line}>{lockedLineWords(opened.byName, opened.at)}</p>
      ) : (
        <>
          {sent && written?.firstSentAt && <p className={own.lineStrong}>{sentLineWords(new Date(written.firstSentAt))}</p>}
          {reopened && <p className={own.line}>{reopenedLineWords(reopened.byName, reopened.at)}</p>}
          {!sent && (
            <p className={own.line}>
              {dueLineWords(block.due, due, { todayKey, dayBeforeTime, first })} {readersFeedbackWords(readers, rubric)}
            </p>
          )}
        </>
      )}

      {written?.feedback && (
        <p className={own.line}>
          <Link href={feedbackHref} className={styles.inlineLink}>
            {feedbackFromWords(written.feedback.byName)}
          </Link>
        </p>
      )}

      {!sent && canWrite && (
        <div className={own.sendRow}>
          <Button type="button" onClick={() => void send()} disabled={sending || words === 0 || over}>
            {sendToWords(readers.kind === "facilitators" ? readers.names : [readers.leadName ? `${readers.leadName} and admins` : "admins"])}
          </Button>
        </div>
      )}
      {sendError && <p className={styles.boxError} role="alert">{sendError}</p>}

      {!opened && !written?.feedback && (
        <div className={own.readers}>
          <p className={styles.readersLine}>{seenWhereWords(readers)}</p>
          <p className={styles.readersLine}>{alsoReadByWords(readers, leadName)}</p>
          <p className={styles.readersLine}>{changeUntilWords(readers, Boolean(reopened))}</p>
        </div>
      )}
    </div>
  );
}
