"use client";

import { useCallback, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { useDebouncedWrite } from "@/hooks/useDebouncedWrite";
import type { ExerciseResponseWire } from "@/app/api/courses/runs/[runId]/exercises/[exerciseId]/submit/route";
import type { SendAnswerAnswer } from "@/app/api/courses/runs/[runId]/written-answers/[answerId]/send/route";
import { SAVED } from "@/lib/courses/memberPageWords";
import type { OwnFeedbackCard } from "@/lib/courses/feedback/model";
import { feedbackLinkWords } from "@/lib/courses/feedback/words";
import type { WrittenAnswerBlock } from "@/lib/courses/weekBlocks/model";
import { answerWords, countWords } from "@/lib/courses/writtenAnswers/model";
import {
  ANSWER_NOT_SAVED,
  WRITTEN_ANSWER,
  YOUR_ANSWER,
  dueLineWords,
  readersFeedbackWords,
  wordCountWords,
} from "@/lib/courses/writtenAnswerWords";
import type { WeekDue } from "@/lib/courses/weekWork/model";
import {
  CHANGE_MY_ANSWER,
  CUT_TO_SEND,
  SENDING,
  SEND_FAILED,
  SEND_MY_ANSWER,
  answerReadersWords,
  changedSinceSentWords,
  doneOnceSentWords,
  othersReadWords,
  savedLineWords,
  sentLineWords,
  type RestOfWeek,
} from "@/lib/courses/weekWork/words";
import { useRegisterFlush } from "./weekSaves";
import Prose from "./Prose";
import styles from "./blockWeek.module.css";
import own from "./writtenAnswer.module.css";

/**
 * THE WEEK'S WRITTEN ANSWER ON THE WEEK PAGE: the question, what a strong
 * answer does, "Your answer" (one box, or a box per label for an answer in
 * labelled boxes), a live count of words against the range, a box that saves
 * as the person types, the day it is due for their own group, and who reads
 * it and from when.
 *
 * ITS OWN SEND (the week stays open): "Send my answer" while there is
 * something unsent, with what makes the week done under it ("Week 1 is done
 * once it’s sent: every reading is already ticked."). After a send, the box
 * shows what was sent, read only, with when ("Sent Sun 8 Nov, 9:12pm: 4 days
 * after your session" once the session has started) and "Change my answer".
 * Changed since, it says plainly who sees what: before the session the
 * people who read their work still see the version they sent until they send
 * it again; once the session has started, the latest words. An answer over
 * its word limit cannot be sent. Nothing closes at the session or at a send;
 * once the programme has closed the box is read only (`canWrite` false).
 *
 * WHEN AND HOW LATE, beside the answer, against the session they are due at
 * (`due`): before it the time alone; once it has started, "before the
 * session" or how long after it. Somebody with no session to be due at (no
 * group yet, told the group after it met) is never told "late".
 *
 * WHO SEES THE BOX. Somebody taking part: a fellow placed in a group, or a
 * facilitator writing their own answer. Anybody else reading the week (an
 * admin, the run's other staff) sees the question and no box.
 *
 * WHO READS IT, AND FROM WHEN (privacy v17): "Once you send it, or once your
 * session has started, Rahul, Claudia and admins can read your written
 * answer." Once somebody has left feedback on it, "Feedback from Rahul" leads
 * to the week's Feedback, further up the same page. The person never sees
 * "After its deadline": that is shown to staff only.
 *
 * NEVER A WRITABLE BOX OVER WHAT WE DO NOT KNOW: until the person's own rows
 * have loaded, the card says so instead, as the reflection boxes do.
 *
 * THE WRITE is `PUT /api/courses/runs/[runId]/written-answers/[answerId]`
 * through `useDebouncedWrite` (one writer, newest value wins, flushed on
 * blur, on leaving and on the page being hidden); Send writes what is waiting
 * first, then `POST .../written-answers/[answerId]/send`.
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
  /** Their place is active (or they facilitate a live group) and the programme has not closed: the box takes writing. */
  canWrite: boolean;
  /** Who reads it and gives feedback: their group's facilitators, or the lead and admins for a facilitator's own. */
  readers: Readers;
  /** The programme's lead's first name, for who else reads it. */
  leadName: string | null;
  /** The first piece of feedback on it (the week's Feedback has them all), or null with none. */
  feedback: OwnFeedbackCard | null;
  /** When it is due for the person's group (`dueMoment`), or null with no date to give. */
  dueDay: { dateKey: string } | null;
  dayBeforeTime: string | null;
  first: boolean;
  todayKey: string;
  /** The session the person is due at this week, which late is told against. */
  due: WeekDue;
  /** What the rest of the week needs, for the line under Send; null when it says nothing (the week is done already). */
  rest: RestOfWeek | null;
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
  keepalive: boolean;
}): Promise<ExerciseResponseWire | null> {
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(args.runId)}/written-answers/${encodeURIComponent(args.answerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: args.weekId, ...args.body }),
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

async function postSend(args: { runId: string; answerId: string; weekId: string }): Promise<SendAnswerAnswer> {
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(args.runId)}/written-answers/${encodeURIComponent(args.answerId)}/send`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekId: args.weekId }) },
  );
  const out = (await res.json().catch(() => null)) as (SendAnswerAnswer & { error?: string }) | null;
  if (!res.ok || !out?.ok || !out.written) throw new AnswerSaveError(out?.error ?? SEND_FAILED);
  return out;
}

const at = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

function AnswerForm({
  block,
  runId,
  weekId,
  weekNumber,
  row,
  canWrite,
  readers,
  leadName,
  feedback,
  dueDay,
  dayBeforeTime,
  first,
  todayKey,
  due,
  rest,
  onSaved,
}: Props) {
  const fieldId = useId();
  const stored = storedValue(block, row);
  const [value, setValue] = useState<Body>(stored);
  const [touched, setTouched] = useState(false);
  // "Change my answer" pressed: a sent answer's box takes writing again.
  const [changing, setChanging] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const dispatchedRef = useRef(false);
  // The row the last save answered with: Send hands the page the answer it sent on top of it.
  const lastRowRef = useRef<ExerciseResponseWire | null>(null);

  // A row that arrives after the form was drawn seeds it, but never once the
  // person has typed: a late answer must not replace what they are writing.
  const storedKey = valueKey(stored);
  const [seeded, setSeeded] = useState(storedKey);
  if (!touched && storedKey !== seeded) {
    setSeeded(storedKey);
    setValue(stored);
  }

  const written = row?.written ?? null;
  const sentAt = at(written?.sentAt ?? written?.firstSentAt);
  const savedAt = at(written?.savedAt);
  const sent = Boolean(written?.firstSentAt);
  // Changed since it was last sent: saved after the send.
  const changedSinceSent = sent && sentAt !== null && savedAt !== null && savedAt.getTime() > sentAt.getTime();
  const writable = canWrite && (!sent || changedSinceSent || changing);

  const write = useCallback(
    async (next: Body, opts: { keepalive: boolean }) => {
      dispatchedRef.current = true;
      const saved = await putAnswer({ runId, answerId: block.id, weekId, body: next, keepalive: opts.keepalive });
      if (saved) {
        lastRowRef.current = saved;
        onSaved(saved);
      }
    },
    [block.id, onSaved, runId, weekId],
  );
  const saver = useDebouncedWrite(write);
  // Anything on the page that sends writes this box's waiting save first.
  useRegisterFlush(saver.flush);

  const change = (next: Body) => {
    setTouched(true);
    setValue(next);
    setSendError(null);
    if (!writable) {
      saver.cancel();
      return;
    }
    if (!valueKey(next) || ("boxes" in next && Object.values(next.boxes).every((text) => !text.trim()))) {
      // Emptying what is stored (or was saved a moment ago) removes it;
      // emptying what never held anything sends nothing.
      if (row || dispatchedRef.current) saver.push(next);
      else saver.cancel();
      return;
    }
    saver.push(next);
  };

  const words = "text" in value ? countWords(value.text) : answerWords("", value.boxes);
  const over = block.words !== null && words > block.words.max;
  const pending = touched && valueKey(value) !== storedKey;
  const showSaved = saver.state !== "error" && !pending && storedKey !== "" && words > 0;
  const now = new Date();
  const sessionStarted = due.at !== null && now.getTime() >= due.at.getTime();
  // Something to send: words never sent, or changed since the last send.
  const unsent = words > 0 && (!sent || changedSinceSent || pending);
  const showSend = canWrite && unsent;

  const send = async () => {
    if (sending || over) return;
    setSending(true);
    setSendError(null);
    try {
      await saver.flush();
      const out = await postSend({ runId, answerId: block.id, weekId });
      const base = lastRowRef.current ?? row;
      if (base) onSaved({ ...base, submittedAt: out.written.firstSentAt, written: out.written });
      setChanging(false);
      setTouched(false);
    } catch (err) {
      setSendError(err instanceof Error && err.message ? err.message : SEND_FAILED);
    } finally {
      setSending(false);
    }
  };

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

  // When it was last sent or saved, and against the session.
  const timeLine =
    sent && sentAt && !changedSinceSent ? (
      <p className={own.lineStrong}>{sentLineWords(sentAt, due, now)}</p>
    ) : savedAt && (written?.words ?? 0) > 0 ? (
      <p className={own.line}>{savedLineWords(savedAt, due, now)}</p>
    ) : null;

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

      {timeLine}
      {changedSinceSent && <p className={own.line}>{changedSinceSentWords(sessionStarted)}</p>}
      {!sent && canWrite && (
        <p className={own.line}>
          {dueLineWords(block.due, dueDay, { todayKey, dayBeforeTime, first })} {readersFeedbackWords(readers)}
        </p>
      )}

      {showSend && (
        <div className={own.sendBlock}>
          <div className={own.sendRow}>
            <Button type="button" onClick={() => void send()} disabled={sending || over} aria-describedby={over ? `${fieldId}-over` : undefined}>
              {sending ? SENDING : SEND_MY_ANSWER}
            </Button>
          </div>
          {over && (
            <p id={`${fieldId}-over`} className={own.line}>
              {CUT_TO_SEND}
            </p>
          )}
          {!over && !sent && rest && <p className={own.line}>{doneOnceSentWords(weekNumber, rest)}</p>}
        </div>
      )}
      {canWrite && sent && !changedSinceSent && !changing && !pending && (
        <div className={own.sendRow}>
          <Button type="button" variant="secondary" onClick={() => setChanging(true)}>
            {CHANGE_MY_ANSWER}
          </Button>
        </div>
      )}
      {sendError && (
        <p className={styles.boxError} role="alert">
          {sendError}
        </p>
      )}

      {feedback && (
        <p className={own.line}>
          <a href="#feedback" className={styles.inlineLink}>
            {feedbackLinkWords(feedback)}
          </a>
        </p>
      )}

      {!feedback && (
        <div className={own.readers}>
          <p className={styles.readersLine}>{answerReadersWords(readers, leadName)}</p>
          <p className={styles.readersLine}>{othersReadWords(readers)}</p>
        </div>
      )}
    </div>
  );
}
