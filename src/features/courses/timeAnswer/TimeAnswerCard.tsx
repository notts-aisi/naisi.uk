"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import { Field } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { ENROLMENT_LIMITS } from "@/lib/firestore/courseEnrolments";
import type { TimeAnswerView, TimeQuestionView } from "@/lib/courses/timeAnswer/model";
import {
  ALTERNATIVES_HINT,
  ALTERNATIVES_LABEL,
  ANSWER_BY_EMAIL_ADDRESS,
  CANCEL,
  CANT_MAKE_THIS_TIME,
  CAN_MAKE_IT,
  CARD_TITLE,
  CHANGE_ANSWER,
  DIDNT_SAVE,
  FORM_INTRO,
  KEEP_YOUR_PLACE,
  OR_EMAIL,
  REASON_HINT,
  REASON_LABEL,
  SAID_CANT,
  SAID_YES,
  SEND,
  SENDING,
  WHO_READS,
  WHY,
  WOULD_WORK,
  YOU_WROTE,
  meetsLine,
} from "@/lib/courses/timeAnswer/words";
import weekly from "../weekly/weekly.module.css";
import styles from "./TimeAnswerCard.module.css";

/**
 * "CAN YOU MAKE THIS TIME?" on a person's programme page, once Publish has
 * told them their group (`timeQuestionFor` decides who sees it): their
 * group's day, time and campus, and two answers.
 *
 *  - "I can make it" saves at once.
 *  - "I can't make this time" opens a short form: why this time does not
 *    work and which other times would, both required, each with its count,
 *    who reads it, and the society's address as the other way to say it.
 *
 * Either answer KEEPS their place: this is not leaving, and nothing here
 * leads to the leave. They may change their answer while they are in the
 * group. Everything is saved by `POST /api/courses/runs/[runId]/time-answer`,
 * which decides everything again; nobody is emailed.
 *
 * `locked` is a view-as session: an admin looking as the member reads the
 * card and can answer nothing (the route refuses it too).
 */
export default function TimeAnswerCard({
  runId,
  question,
  locked = false,
  className,
}: {
  runId: string;
  question: TimeQuestionView;
  locked?: boolean;
  className?: string;
}) {
  const hydrated = useHydrated();
  const titleId = useId();
  const reasonId = useId();
  const alternativesId = useId();
  const [answer, setAnswer] = useState<TimeAnswerView | null>(question.answer);
  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState(question.answer?.reason ?? "");
  const [alternatives, setAlternatives] = useState(question.answer?.alternatives ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const inactive = !hydrated || locked || busy;

  async function send(kind: "yes" | "cant") {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/time-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "yes"
            ? { groupId: question.groupId, kind }
            : { groupId: question.groupId, kind, reason, alternatives },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        answer?: TimeAnswerView;
        message?: string;
      };
      if (!res.ok || !body.answer) {
        setError(body.error ?? DIDNT_SAVE);
        return;
      }
      setAnswer(body.answer);
      setChoosing(false);
      setForm(false);
      setSaid(body.message ?? null);
    } catch {
      setError(DIDNT_SAVE);
    } finally {
      setBusy(false);
    }
  }

  const asking = answer === null || choosing;

  return (
    <section className={[weekly.card, className ?? ""].filter(Boolean).join(" ")} aria-labelledby={titleId}>
      <div className={weekly.cardHead}>
        <h2 id={titleId} className={weekly.cardTitle}>
          {CARD_TITLE}
        </h2>
      </div>
      <p className={weekly.cardLine}>{meetsLine(question.groupName || null, question.when, question.campus)}</p>

      {form ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void send("cant");
          }}
        >
          <p className={styles.line}>{FORM_INTRO}</p>
          <Field id={reasonId} label={REASON_LABEL} hint={REASON_HINT}>
            <CountedTextarea
              id={reasonId}
              value={reason}
              max={ENROLMENT_LIMITS.timeAnswerReason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              required
              disabled={busy}
            />
          </Field>
          <Field id={alternativesId} label={ALTERNATIVES_LABEL} hint={ALTERNATIVES_HINT}>
            <CountedTextarea
              id={alternativesId}
              value={alternatives}
              max={ENROLMENT_LIMITS.timeAnswerAlternatives}
              onChange={(event) => setAlternatives(event.target.value)}
              rows={2}
              required
              disabled={busy}
            />
          </Field>
          <p className={styles.note}>{WHO_READS}</p>
          <p className={styles.note}>
            {OR_EMAIL}{" "}
            <a className={styles.link} href={`mailto:${ANSWER_BY_EMAIL_ADDRESS}`}>
              {ANSWER_BY_EMAIL_ADDRESS}
            </a>
            .
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" disabled={inactive || !reason.trim() || !alternatives.trim()}>
              {busy ? SENDING : SEND}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setForm(false);
                setError(null);
              }}
            >
              {CANCEL}
            </Button>
          </div>
        </form>
      ) : asking ? (
        <>
          <div className={styles.actions}>
            <Button type="button" disabled={inactive} onClick={() => void send("yes")}>
              {CAN_MAKE_IT}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={inactive}
              onClick={() => {
                setForm(true);
                setError(null);
                setSaid(null);
              }}
            >
              {CANT_MAKE_THIS_TIME}
            </Button>
          </div>
          <p className={styles.note}>{KEEP_YOUR_PLACE}</p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.line}>{answer.kind === "yes" ? SAID_YES : SAID_CANT}</p>
          {answer.kind === "cant" && (
            <div className={styles.wrote}>
              <p className={styles.wroteTitle}>{YOU_WROTE}</p>
              <dl className={styles.wroteList}>
                <dt>{WHY}</dt>
                <dd>{answer.reason}</dd>
                <dt>{WOULD_WORK}</dt>
                <dd>{answer.alternatives}</dd>
              </dl>
            </div>
          )}
          <div className={styles.actions}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={inactive}
              onClick={() => {
                setChoosing(true);
                setSaid(null);
              }}
            >
              {CHANGE_ANSWER}
            </Button>
          </div>
        </>
      )}

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
    </section>
  );
}
