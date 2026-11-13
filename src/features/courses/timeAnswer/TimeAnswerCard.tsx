"use client";

import { useId, useState } from "react";
import Button from "@/components/ui/Button";
import CountedTextarea from "@/components/ui/CountedTextarea";
import { Field } from "@/components/ui/Input";
import OptionRow from "@/components/ui/OptionRow";
import { useHydrated } from "@/hooks/useHydrated";
import { ENROLMENT_LIMITS } from "@/lib/firestore/courseEnrolments";
import { ticksOffered, type TimeAnswerView, type TimeQuestionSession, type TimeQuestionView } from "@/lib/courses/timeAnswer/model";
import {
  ALTERNATIVES_HINT,
  ALTERNATIVES_LABEL,
  ANSWER_BY_EMAIL_ADDRESS,
  ANSWER_CANT,
  ANSWER_MOST_WEEKS,
  ANSWER_YES,
  CANCEL,
  CARD_TITLE,
  CHANGE_ANSWER,
  DIDNT_SAVE,
  FORM_INTRO,
  KEEP_YOUR_PLACE,
  MOST_WEEKS_INTRO,
  MOST_WEEKS_WHO_READS,
  NONE_TO_TICK,
  UNTICK_ONLY,
  ODD_WEEK_NOTE,
  OR_EMAIL,
  REASON_HINT,
  REASON_LABEL,
  SAID_CANT,
  SAID_MOST_WEEKS,
  SAID_YES,
  SEND,
  SENDING,
  WHO_READS,
  WHY,
  WOULD_WORK,
  YOU_WROTE,
  meetsLine,
  missingLine,
  sessionOptionWords,
} from "@/lib/courses/timeAnswer/words";
import { TIME_ANSWER_ANCHOR } from "@/lib/courses/timeAnswer/emailSection";
import weekly from "../weekly/weekly.module.css";
import styles from "./TimeAnswerCard.module.css";

type Form = "mostWeeks" | "cant" | null;

/**
 * "CAN YOU MAKE THIS TIME MOST WEEKS?" on a person's programme page, once
 * Publish has told them their group (`timeQuestionFor` decides who sees it):
 * their group's day, time and campus, and three answers.
 *
 *  - "Yes" saves at once.
 *  - "Most weeks, not all" opens a short form listing the group's sessions
 *    still to come, ticked where they have already told us they can't make
 *    one; each session ticked is recorded as excused on its register (which
 *    their facilitators see) and one unticked is taken back. None ticked is
 *    an answer too.
 *  - "No, I need a different time" opens a short form: why this time does
 *    not work most weeks and which other times would, both required, each
 *    with its count, who reads it, and the society's address as the other
 *    way to say it.
 *
 * Every answer KEEPS their place: this is not leaving, and nothing here leads
 * to the leave. They may change their answer while they are in the group.
 * Everything is saved by `POST /api/courses/runs/[runId]/time-answer`, which
 * decides everything again; nobody is emailed.
 *
 * `locked` is a view-as session: an admin looking as the member reads the
 * card and can answer nothing (the route refuses it too).
 */
export default function TimeAnswerCard({
  runId,
  question,
  locked = false,
  className,
  certificateNeeds = null,
}: {
  runId: string;
  question: TimeQuestionView;
  locked?: boolean;
  className?: string;
  /** What a certificate needs, where the run has a rule (`certificateNeedsWords`): said where they tick the weeks they will miss. */
  certificateNeeds?: string | null;
}) {
  const hydrated = useHydrated();
  const titleId = useId();
  const reasonId = useId();
  const alternativesId = useId();
  const ticksId = useId();
  const [answer, setAnswer] = useState<TimeAnswerView | null>(question.answer);
  const [sessions, setSessions] = useState<TimeQuestionSession[]>(question.sessions);
  const [choosing, setChoosing] = useState(false);
  const [form, setForm] = useState<Form>(null);
  const [reason, setReason] = useState(question.answer?.reason ?? "");
  const [alternatives, setAlternatives] = useState(question.answer?.alternatives ?? "");
  const [ticked, setTicked] = useState<string[]>(() => question.sessions.filter((each) => each.told).map((each) => each.sessionKey));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const inactive = !hydrated || locked || busy;

  function open(next: Form) {
    setForm(next);
    setError(null);
    setSaid(null);
    // The ticks start where the registers stand.
    if (next === "mostWeeks") setTicked(sessions.filter((each) => each.told).map((each) => each.sessionKey));
  }

  async function send(kind: "yes" | "mostWeeks" | "cant") {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const body =
        kind === "yes"
          ? { groupId: question.groupId, kind }
          : kind === "mostWeeks"
            ? { groupId: question.groupId, kind, sessionKeys: sessions.map((each) => each.sessionKey).filter((key) => ticked.includes(key)) }
            : { groupId: question.groupId, kind, reason, alternatives };
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/time-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const reply = (await res.json().catch(() => ({}))) as {
        error?: string;
        answer?: TimeAnswerView;
        message?: string;
      };
      if (!res.ok || !reply.answer) {
        setError(reply.error ?? DIDNT_SAVE);
        return;
      }
      const saved = reply.answer;
      setAnswer(saved);
      // The registers now stand where the ticks were.
      if (saved.kind === "mostWeeks") {
        setSessions((was) => was.map((each) => ({ ...each, told: saved.sessionKeys.includes(each.sessionKey) })));
      }
      setChoosing(false);
      setForm(null);
      setSaid(reply.message ?? null);
    } catch {
      setError(DIDNT_SAVE);
    } finally {
      setBusy(false);
    }
  }

  const asking = answer === null || choosing;
  // Weeks are ticked while the question is asked: once this asking has an
  // answer, the form offers only the weeks already ticked, to untick, and
  // says how another week is asked for (the route holds the same rule).
  const untickOnly = answer !== null;
  const offered = ticksOffered(sessions, untickOnly);
  const missing = sessions.filter((each) => each.told).map((each) => each.day);

  const orEmail = (
    <p className={styles.note}>
      {OR_EMAIL}{" "}
      <a className={styles.link} href={`mailto:${ANSWER_BY_EMAIL_ADDRESS}`}>
        {ANSWER_BY_EMAIL_ADDRESS}
      </a>
      .
    </p>
  );
  const errorLine = error && (
    <p className={styles.error} role="alert">
      {error}
    </p>
  );
  const cancelForm = (
    <Button
      type="button"
      variant="ghost"
      disabled={busy}
      onClick={() => {
        setForm(null);
        setError(null);
      }}
    >
      {CANCEL}
    </Button>
  );

  return (
    <section
      id={TIME_ANSWER_ANCHOR}
      className={[weekly.card, className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <div className={weekly.cardHead}>
        <h2 id={titleId} className={weekly.cardTitle}>
          {CARD_TITLE}
        </h2>
      </div>
      <p className={weekly.cardLine}>{meetsLine(question.groupName || null, question.when, question.campus)}</p>

      {form === "mostWeeks" ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void send("mostWeeks");
          }}
        >
          <p id={ticksId} className={styles.line}>
            {untickOnly ? UNTICK_ONLY : sessions.length > 0 ? MOST_WEEKS_INTRO : NONE_TO_TICK}
          </p>
          {offered.length > 0 && (
            <div className={styles.sessions} role="group" aria-labelledby={ticksId}>
              {offered.map((each) => (
                <OptionRow
                  key={each.sessionKey}
                  name="sessionKeys"
                  value={each.sessionKey}
                  checked={ticked.includes(each.sessionKey)}
                  disabled={busy}
                  onChange={(event) => {
                    const on = event.target.checked;
                    setTicked((was) => (on ? [...was, each.sessionKey] : was.filter((key) => key !== each.sessionKey)));
                  }}
                >
                  {sessionOptionWords(each.weekNumber, each.day)}
                </OptionRow>
              ))}
            </div>
          )}
          {certificateNeeds && (
            <p className={styles.note}>
              {certificateNeeds}
            </p>
          )}
          <p className={styles.note}>{MOST_WEEKS_WHO_READS}</p>
          {orEmail}
          {errorLine}
          <div className={styles.actions}>
            <Button type="submit" disabled={inactive}>
              {busy ? SENDING : SEND}
            </Button>
            {cancelForm}
          </div>
        </form>
      ) : form === "cant" ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void send("cant");
          }}
        >
          <p className={styles.line}>{FORM_INTRO}</p>
          <p className={styles.note}>{ODD_WEEK_NOTE}</p>
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
          {orEmail}
          {errorLine}
          <div className={styles.actions}>
            <Button type="submit" disabled={inactive || !reason.trim() || !alternatives.trim()}>
              {busy ? SENDING : SEND}
            </Button>
            {cancelForm}
          </div>
        </form>
      ) : asking ? (
        <>
          <div className={styles.actions}>
            <Button type="button" disabled={inactive} onClick={() => void send("yes")}>
              {ANSWER_YES}
            </Button>
            <Button type="button" variant="secondary" disabled={inactive} onClick={() => open("mostWeeks")}>
              {ANSWER_MOST_WEEKS}
            </Button>
            <Button type="button" variant="secondary" disabled={inactive} onClick={() => open("cant")}>
              {ANSWER_CANT}
            </Button>
            {answer !== null && (
              /* Changing their answer: keep the one they gave. */
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setChoosing(false)}>
                {CANCEL}
              </Button>
            )}
          </div>
          <p className={styles.note}>{KEEP_YOUR_PLACE}</p>
          {errorLine}
        </>
      ) : (
        <>
          <p className={styles.line}>
            {answer.kind === "yes" ? SAID_YES : answer.kind === "mostWeeks" ? SAID_MOST_WEEKS : SAID_CANT}
          </p>
          {answer.kind === "mostWeeks" && missing.length > 0 && <p className={styles.note}>{missingLine(missing)}</p>}
          {answer.kind !== "yes" && answer.reason && answer.alternatives && (
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
