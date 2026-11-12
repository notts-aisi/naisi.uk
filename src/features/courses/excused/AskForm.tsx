"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import * as O from "@/lib/courses/excused/ownWords";
import { EXCUSED_LIMITS } from "@/lib/firestore/courseExcusedRequests";
import { askToBeExcused } from "./api";
import styles from "./Excuse.module.css";

/** One session the request may cover. */
export type AskWeek = { sessionKey: string; weekNumber: number; occurrence: number; dateKey: string };

/**
 * ASKING TO BE EXCUSED: the weeks, one short line of why under the line
 * about medical details, who reads it, what will happen, and one button
 * (`POST /api/courses/groups/[groupId]/excused`, which decides everything
 * again). Asking emails nobody; once sent, the page reloads its own data and
 * the card says what happens next.
 *
 * BEFORE A SESSION the person ticks the weeks: the session the card is about
 * first and ticked, the next ones beside it, the rest behind "Show later
 * weeks". AFTER ONE (`weeks` holds the one session, whose finished register
 * says Absent), there is nothing to tick.
 *
 * The reason is one line: a line break is dropped as it is typed and the box
 * stops at the route's limit. Nothing here logs it. `locked` is a view-as
 * session: the form is drawn and cannot be sent (the route refuses it too).
 */
export default function AskForm({
  groupId,
  weeks,
  facilitatorFirstNames,
  mode,
  locked = false,
  onSent,
}: {
  groupId: string;
  /** The weeks offered, the card's own first. */
  weeks: readonly AskWeek[];
  facilitatorFirstNames: readonly string[];
  mode: "before" | "after";
  locked?: boolean;
  onSent?: () => void;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const id = useId();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(weeks.slice(0, 1).map((week) => week.sessionKey)));
  const [more, setMore] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const shown = more || weeks.length <= O.WEEKS_SHOWN_FIRST ? weeks : weeks.slice(0, O.WEEKS_SHOWN_FIRST);
  const chosen = weeks.filter((week) => ticked.has(week.sessionKey));
  const off = !hydrated || locked || busy;

  function toggle(key: string) {
    setTicked((before) => {
      const next = new Set(before);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function send() {
    if (chosen.length === 0) {
      setProblem(O.CHOOSE_A_WEEK);
      return;
    }
    setBusy(true);
    setProblem(null);
    const answer = await askToBeExcused(
      groupId,
      chosen.map((week) => week.sessionKey),
      reason,
    );
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error ?? O.DIDNT_SEND);
      return;
    }
    setSaid(O.SENT);
    setReason("");
    onSent?.();
    router.refresh();
  }

  const rows = O.happenRows({ weekNumbers: chosen.map((week) => week.weekNumber), facilitatorFirstNames });

  return (
    <form
      className={styles.form}
      data-testid="excuse-ask-form"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {mode === "before" && weeks.length > 1 ? (
        <fieldset className={styles.weeks}>
          <legend className={styles.legend}>{O.WEEKS_THIS_COVERS}</legend>
          {shown.map((week) => (
            <label key={week.sessionKey} className={styles.weekChoice}>
              <input
                type="checkbox"
                checked={ticked.has(week.sessionKey)}
                onChange={() => toggle(week.sessionKey)}
                disabled={off}
              />
              <span>{O.weekChoiceWords(week.weekNumber, week.occurrence, week.dateKey)}</span>
            </label>
          ))}
          {!more && weeks.length > O.WEEKS_SHOWN_FIRST && (
            <button type="button" className={styles.linkButton} onClick={() => setMore(true)}>
              {O.SHOW_LATER_WEEKS}
            </button>
          )}
        </fieldset>
      ) : null}

      {/* The line about medical details comes before the box, so it is read first. */}
      <p className={styles.medical} id={`${id}-medical`}>
        {O.NO_MEDICAL_DETAILS}
      </p>
      <label className={styles.field} htmlFor={`${id}-reason`}>
        <span className={styles.fieldLabel}>{O.WHY_A_LINE}</span>
      </label>
      <textarea
        id={`${id}-reason`}
        className={styles.textarea}
        value={reason}
        rows={2}
        maxLength={EXCUSED_LIMITS.reason}
        aria-describedby={`${id}-medical`}
        onChange={(event) => setReason(event.target.value.replace(/[\r\n]+/g, " "))}
        disabled={off}
        data-testid="excuse-reason"
      />

      {mode === "before" ? (
        <section className={styles.happen} aria-labelledby={`${id}-happen`}>
          <h3 id={`${id}-happen`} className={styles.happenTitle}>
            {O.WHAT_WILL_HAPPEN}
          </h3>
          <dl className={styles.happenRows}>
            {rows.map((row) => (
              <div key={row.label} className={styles.happenRow}>
                <dt>{row.label}</dt>
                <dd>{row.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <button type="submit" className={styles.primary} disabled={off || !reason.trim()} data-testid="excuse-send">
        {busy ? O.SENDING : O.sendTheRequestWords(mode === "before" ? Math.max(chosen.length, 1) : 1)}
      </button>
      {mode === "after" && (
        <>
          <p className={styles.small}>{O.afterSessionWords(facilitatorFirstNames)}</p>
          <p className={styles.small}>{O.WHO_READS_THE_REASON}</p>
        </>
      )}
      {/* One line, there from the first render, for what the press did. */}
      <p className={problem ? styles.problem : styles.small} role="status">
        {problem ?? said ?? ""}
      </p>
    </form>
  );
}
