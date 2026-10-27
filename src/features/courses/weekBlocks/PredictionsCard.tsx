"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useDebouncedWrite } from "@/hooks/useDebouncedWrite";
import { REFLECTION_NOT_SAVED, SAVED } from "@/lib/courses/memberPageWords";
import { answeredCount, PREDICTION_LIMITS, type PredictionAnswer, type PredictionAnswers, type PredictionQuestion } from "@/lib/courses/predictions/model";
import type { PredictionsView } from "@/lib/courses/predictions/wire";
import {
  NOT_YET,
  OPEN_BUTTON,
  OPEN_CONFIRM,
  OPEN_SAVE_LINE,
  OPEN_YES,
  PREDICTIONS_HEADING,
  READERS_LINE,
  REFUSE_OPEN_NEEDS_ONE,
  REFUSE_SEAL_NEEDS_ONE,
  SAVE_LINE,
  SEAL_BUTTON,
  SEAL_SAVE_LINE,
  SEAL_YES,
  WAIT_FOR_SAVE,
  answerWords,
  closedDraftWords,
  goToWeekWords,
  movedWords,
  nothingToOpenWords,
  openLeadWords,
  openedWords,
  scaleEndsWords,
  sealConfirmWords,
  sealLeadWords,
  sealNotOpenWords,
  sealedOpenNowWords,
  sealedWords,
  waitingWords,
  weekColumnWords,
} from "@/lib/courses/predictions/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { own } from "@/lib/applications/keys";
import { weekHref } from "../links";
import blockStyles from "./blockWeek.module.css";
import cardStyles from "./predictions.module.css";

/**
 * A PERSON'S OWN PREDICTIONS CARD ON A WEEK PAGE (sealed predictions, Zach's
 * extra (d)). No board draws it: its words are in
 * `src/lib/courses/predictions/words.ts`, listed for the boards' designers.
 *
 * IN THE WEEK IT IS SEALED IN: the card's heading as printed, the questions,
 * each answer saving as it is typed, and "Seal my predictions" with a
 * confirmation that says what sealing does. Sealed, the card shows when it
 * was sealed and when it opens, and none of its answers: the server never
 * hands them back (`src/lib/courses/predictions/own.ts`).
 *
 * IN THE WEEK IT OPENS IN: the same questions asked again first, then "Open
 * my sealed card", and once opened, both cards side by side with how each
 * number moved. Somebody who sealed nothing answers again with nothing to
 * open.
 *
 * A NUMBER IS TYPED. Each percentage or scale has a box to type the number in,
 * which is the answer, and a slider beside it for a finger, which moves the
 * box; the slider is hidden from screen readers and the keyboard, so the
 * card works without dragging. A sentence is a box of its own.
 *
 * THE WRITES are `/api/courses/runs/[runId]/predictions`: one writer per
 * question through `useDebouncedWrite` (newest value wins, flushed on blur,
 * on leaving and on the page being hidden), and the seal and the opening,
 * which wait for every answer to be stored.
 */

type Props = {
  runId: string;
  view: PredictionsView;
};

type FieldStatus = { pending: boolean; failed: boolean };

/** A typed number, or null for an empty box or one that is not a number. */
function typedNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export default function PredictionsCard({ runId, view: initial }: Props) {
  const headingId = useId();
  const [view, setView] = useState(initial);
  const stage = view.stage;
  const stageKey: "start" | "now" = stage === "seal" ? "start" : "now";
  const [answers, setAnswers] = useState<PredictionAnswers>(stage === "seal" ? initial.start.answers : (initial.now?.answers ?? {}));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<ReadonlyMap<string, FieldStatus>>(new Map());
  const todayKey = londonDateKey(new Date());
  const questions = view.card.questions;

  const onSaved = useCallback((questionId: string, value: PredictionAnswer | null) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === null) delete next[questionId];
      else next[questionId] = value;
      return next;
    });
  }, []);
  const report = useCallback((questionId: string, status: FieldStatus) => {
    setStatuses((prev) => {
      const was = prev.get(questionId);
      if (was && was.pending === status.pending && was.failed === status.failed) return prev;
      const next = new Map(prev);
      next.set(questionId, status);
      return next;
    });
  }, []);
  const anyPending = [...statuses.values()].some((status) => status.pending);
  const anyFailed = [...statuses.values()].some((status) => status.failed);
  const answered = answeredCount(questions, answers);

  const act = async (action: "seal" | "open") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/predictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => null)) as { view?: PredictionsView; error?: string } | null;
      if (!res.ok || !body?.view) throw new Error(body?.error ?? "That didn’t go through. Try again.");
      setView(body.view);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const ask = (action: "seal" | "open") => {
    setError(null);
    if (answered === 0) {
      setError(action === "seal" ? REFUSE_SEAL_NEEDS_ONE : REFUSE_OPEN_NEEDS_ONE);
      return;
    }
    setConfirming(true);
  };

  const fields = (
    <ol className={cardStyles.questions} role="list">
      {questions.map((question) => (
        <li key={question.id} className={cardStyles.question}>
          <PredictionField
            runId={runId}
            stage={stageKey}
            question={question}
            stored={own(answers, question.id)}
            onSaved={onSaved}
            onStatus={report}
          />
        </li>
      ))}
    </ol>
  );
  const savedLine = (
    <p className={cardStyles.status} aria-live="polite">
      {!anyPending && !anyFailed && answered > 0 && (
        <span className={blockStyles.saved}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {SAVED}
        </span>
      )}
    </p>
  );
  const confirm = (words: string, yes: string, action: "seal" | "open") => (
    <div className={cardStyles.confirm} role="group" aria-label={words}>
      <p className={cardStyles.confirmText}>{words}</p>
      {anyPending && <p className={cardStyles.quiet}>{WAIT_FOR_SAVE}</p>}
      <div className={cardStyles.actions}>
        <Button type="button" onClick={() => void act(action)} disabled={busy || anyPending || anyFailed}>
          {yes}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
          {NOT_YET}
        </Button>
      </div>
    </div>
  );
  const errorLine = error && (
    <p className={cardStyles.error} role="alert">
      {error}
    </p>
  );

  let inner: ReactNode;
  if (stage === "seal") {
    const sealedAt = view.start.sealedAt;
    if (view.start.state === "sealed" && sealedAt) {
      inner = (
        <div className={cardStyles.sealed}>
          <Seal />
          <div className={cardStyles.sealedWords}>
            <p className={cardStyles.line}>
              {view.openedAt
                ? openedWords(sealedAt, view.openedAt)
                : view.opensNow
                  ? sealedOpenNowWords(sealedAt, view.openWeek)
                  : sealedWords(sealedAt, view.openWeek, view.opensAfter, todayKey)}
            </p>
            {view.opensNow && (
              <Link href={weekHref(runId, view.openWeek)} className={blockStyles.inlineLink}>
                {goToWeekWords(view.openWeek)}
              </Link>
            )}
          </div>
        </div>
      );
    } else if (view.canWrite) {
      const blank = questions.length - answered;
      inner = (
        <>
          <p className={cardStyles.lead}>{sealLeadWords(view.openWeek)}</p>
          {view.card.intro && <p className={cardStyles.intro}>{view.card.intro}</p>}
          <p className={cardStyles.saveLine}>{SEAL_SAVE_LINE}</p>
          {fields}
          {savedLine}
          {confirming ? (
            confirm(sealConfirmWords(view.openWeek, blank, questions.length), SEAL_YES, "seal")
          ) : (
            <div className={cardStyles.actions}>
              <Button type="button" onClick={() => ask("seal")} disabled={busy}>
                {SEAL_BUTTON}
              </Button>
            </div>
          )}
          {errorLine}
        </>
      );
    } else if (view.opensNow) {
      // Never sealed, and the week it opens in has opened: their answers, to read.
      inner = (
        <>
          <p className={cardStyles.line}>{closedDraftWords(view.openWeek)}</p>
          <StaticAnswers questions={questions} answers={view.start.answers} />
        </>
      );
    } else {
      // The week it is filled in on is not open to them yet (a facilitator reading ahead).
      inner = <p className={cardStyles.line}>{sealNotOpenWords(view.sealWeek)}</p>;
    }
  } else if (!view.opensNow) {
    inner = <p className={cardStyles.line}>{waitingWords(view.opensAfter, todayKey)}</p>;
  } else if (view.opened) {
    const opened = view.opened;
    inner = (
      <>
        <p className={cardStyles.line}>{openedWords(opened.sealedAt, opened.openedAt)}</p>
        <ol className={cardStyles.questions} role="list">
          {questions.map((question) => {
            const moved = movedWords(question, own(opened.answers, question.id), own(answers, question.id));
            return (
              <li key={question.id} className={cardStyles.question}>
                <Statement question={question} />
                <dl className={cardStyles.pair}>
                  <div className={cardStyles.pairCell}>
                    <dt className={cardStyles.pairLabel}>{weekColumnWords(view.sealWeek)}</dt>
                    <dd className={cardStyles.pairValue}>{answerWords(question, own(opened.answers, question.id))}</dd>
                  </div>
                  <div className={cardStyles.pairCell}>
                    <dt className={cardStyles.pairLabel}>{weekColumnWords(view.weekNumber)}</dt>
                    <dd className={cardStyles.pairValue}>{answerWords(question, own(answers, question.id))}</dd>
                  </div>
                </dl>
                {moved && <p className={cardStyles.moved}>{moved}</p>}
              </li>
            );
          })}
        </ol>
      </>
    );
  } else {
    const sealed = view.start.state === "sealed";
    inner = (
      <>
        <p className={cardStyles.lead}>{sealed ? openLeadWords(view.sealWeek) : nothingToOpenWords(view.sealWeek)}</p>
        {view.card.intro && <p className={cardStyles.intro}>{view.card.intro}</p>}
        {view.canWrite && <p className={cardStyles.saveLine}>{sealed ? OPEN_SAVE_LINE : SAVE_LINE}</p>}
        {view.canWrite ? fields : <StaticAnswers questions={questions} answers={answers} />}
        {view.canWrite && savedLine}
        {sealed &&
          view.canWrite &&
          (confirming ? (
            confirm(OPEN_CONFIRM, OPEN_YES, "open")
          ) : (
            <div className={cardStyles.actions}>
              <Button type="button" onClick={() => ask("open")} disabled={busy}>
                {OPEN_BUTTON}
              </Button>
            </div>
          ))}
        {errorLine}
      </>
    );
  }

  return (
    <section id="your-predictions" className={blockStyles.section} aria-labelledby={headingId}>
      <div className={blockStyles.sectionHead}>
        <h2 id={headingId} className={blockStyles.h2}>
          {PREDICTIONS_HEADING}
        </h2>
      </div>
      <div className={cardStyles.card}>
        {view.card.title && <p className={cardStyles.title}>{view.card.title}</p>}
        {inner}
      </div>
      <p className={cardStyles.readers}>{READERS_LINE}</p>
    </section>
  );
}

/** A sealed envelope's mark. */
function Seal() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" className={cardStyles.sealMark}>
      <rect x="3.5" y="6.5" width="21" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 8l10 7.5L24 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="14" cy="15.5" r="2.6" fill="currentColor" />
    </svg>
  );
}

/** A question's number and words. */
function Statement({ question, id }: { question: PredictionQuestion; id?: string }) {
  return (
    <p id={id} className={cardStyles.statement}>
      {question.number && (
        <span className={cardStyles.number} aria-hidden="true">
          {question.number}
        </span>
      )}
      <span>{question.statement}</span>
    </p>
  );
}

/** Answers to read, with no box. */
function StaticAnswers({ questions, answers }: { questions: readonly PredictionQuestion[]; answers: PredictionAnswers }) {
  return (
    <ol className={cardStyles.questions} role="list">
      {questions.map((question) => (
        <li key={question.id} className={cardStyles.question}>
          <Statement question={question} />
          <p className={cardStyles.answerText}>{answerWords(question, own(answers, question.id))}</p>
        </li>
      ))}
    </ol>
  );
}

/** A refusal with the route's own sentence. */
class PredictionSaveError extends Error {}

async function putAnswer(args: {
  runId: string;
  stage: "start" | "now";
  questionId: string;
  value: PredictionAnswer | null;
  keepalive: boolean;
}): Promise<PredictionAnswer | null> {
  const res = await fetch(`/api/courses/runs/${encodeURIComponent(args.runId)}/predictions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: args.stage, questionId: args.questionId, value: args.value }),
    // One answer is far under a keepalive request's budget, so the last change outlives the page.
    keepalive: args.keepalive,
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; value?: PredictionAnswer | null; error?: string } | null;
  if (!res.ok || !body?.ok) throw new PredictionSaveError(body?.error ?? REFLECTION_NOT_SAVED);
  return body.value ?? null;
}

function PredictionField({
  runId,
  stage,
  question,
  stored,
  onSaved,
  onStatus,
}: {
  runId: string;
  stage: "start" | "now";
  question: PredictionQuestion;
  stored: PredictionAnswer | undefined;
  onSaved: (questionId: string, value: PredictionAnswer | null) => void;
  onStatus: (questionId: string, status: FieldStatus) => void;
}) {
  const statementId = useId();
  const endsId = useId();
  const storedText = stored === undefined ? "" : String(stored);
  const [text, setText] = useState(storedText);
  const [touched, setTouched] = useState(false);
  // Has a write gone out this visit? From then on, an emptied box is a change worth sending.
  const dispatchedRef = useRef(false);

  const write = useCallback(
    async (value: PredictionAnswer | null, opts: { keepalive: boolean }) => {
      dispatchedRef.current = true;
      const saved = await putAnswer({ runId, stage, questionId: question.id, value, keepalive: opts.keepalive });
      onSaved(question.id, saved);
    },
    [onSaved, question.id, runId, stage],
  );
  const saver = useDebouncedWrite(write);

  const isNumber = question.kind !== "sentence";
  const handleChange = (next: string) => {
    setTouched(true);
    setText(next);
    if (!next.trim()) {
      // Emptying a box that holds something stored (or sent a moment ago) takes
      // the answer away; emptying one that never held anything sends nothing.
      if (stored !== undefined || dispatchedRef.current) saver.push(null);
      else saver.cancel();
      return;
    }
    if (!isNumber) {
      saver.push(next);
      return;
    }
    const number = typedNumber(next);
    if (number === null) {
      saver.cancel();
      return;
    }
    saver.push(number);
  };

  // Pending until what the box holds is what the route keeps: a number to one
  // decimal place, words with their spaces tidied.
  const typedNow = typedNumber(text);
  const kept = isNumber ? (typedNow === null ? null : Math.round(typedNow * 10) / 10) : text.replace(/\s+/g, " ").trim();
  const pending = touched && (isNumber ? kept !== (typeof stored === "number" ? stored : null) : kept !== (typeof stored === "string" ? stored : ""));
  const failed = saver.state === "error";
  useEffect(() => {
    onStatus(question.id, { pending, failed });
  }, [failed, onStatus, pending, question.id]);

  const sliderValue = typedNow === null ? Math.round(question.max / 2) : Math.min(question.max, Math.max(0, Math.round(typedNow)));
  return (
    <div className={cardStyles.field}>
      <Statement question={question} id={statementId} />
      {isNumber ? (
        <>
          <div className={cardStyles.numberRow}>
            <input
              type="range"
              min={0}
              max={question.max}
              step={1}
              value={sliderValue}
              className={cardStyles.slider}
              data-unset={typedNow === null ? "" : undefined}
              // The typed box beside it is the answer and takes the keyboard; the
              // slider is a second way in for a finger or a mouse.
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => handleChange(event.currentTarget.value)}
            />
            <span className={cardStyles.numberBox}>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={question.max}
                step="any"
                value={text}
                className={cardStyles.numberInput}
                aria-labelledby={statementId}
                aria-describedby={question.kind === "scale" ? endsId : undefined}
                onChange={(event) => handleChange(event.currentTarget.value)}
                onBlur={() => void saver.flush()}
              />
              {question.kind === "percent" && (
                <span className={cardStyles.unit} aria-hidden="true">
                  %
                </span>
              )}
            </span>
          </div>
          {question.kind === "scale" && (
            <p id={endsId} className={cardStyles.ends}>
              {scaleEndsWords(question)}
            </p>
          )}
        </>
      ) : (
        <textarea
          className={cardStyles.sentence}
          value={text}
          rows={2}
          maxLength={PREDICTION_LIMITS.sentence}
          aria-labelledby={statementId}
          onChange={(event) => handleChange(event.currentTarget.value)}
          onBlur={() => void saver.flush()}
        />
      )}
      {failed && (
        <p className={blockStyles.boxStatus} role="alert">
          <span className={blockStyles.boxError}>{saver.error?.message || REFLECTION_NOT_SAVED}</span>
        </p>
      )}
    </div>
  );
}
