"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { AskConfirmed } from "@/lib/courses/excused/model";
import * as O from "@/lib/courses/excused/ownWords";
import { EXCUSED_LIMITS } from "@/lib/firestore/courseExcusedRequests";
import { askToBeExcused } from "./api";
import styles from "./Excuse.module.css";

/** One session the request may cover, and whether joining it online is a real choice (`onlineOfferedFor`). */
export type AskWeek = {
  sessionKey: string;
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  /** Still to come: asked about before it. A past session (asked about after it) is confirmed nothing about. */
  upcoming: boolean;
  onlineOffered: boolean;
};

/**
 * ASKING TO BE EXCUSED: the weeks, one short line of why under the line
 * about medical details, who reads it, what will happen, and one button
 * (`POST /api/courses/groups/[groupId]/excused`, which decides everything
 * again). Asking emails the admins who decide these, never the person or a
 * facilitator, and never the reason; once sent, the page reloads its own data and
 * the card says what happens next.
 *
 * BEFORE A SESSION the person ticks the weeks: the session the card is about
 * first and ticked, the next ones beside it, the rest behind "Show later
 * weeks". AFTER ONE (`weeks` holds the one session, whose finished register
 * says Absent), there is nothing to tick.
 *
 * BEFORE YOU ASK, in this order, above the reason, about the weeks still to
 * come: they can't go to another group's session in person, can't join their
 * own group's session online (only where that is a real choice,
 * `confirmationsNeeded`, with today's "Joining online" beside it; elsewhere
 * the form says so and asks nothing), and can't join another group's session
 * online. The site cannot show or book another group's session yet, so under
 * those lines it says to email the team, who will arrange it; when one-week
 * visits exist, they go there. "Send the request" works once every line shown
 * is ticked, and the route asks the same of the same rule. After a session
 * there is nothing to confirm about the past, and none is shown. The ticks
 * stand for the weeks they were given for (`confirmationsFor`): ticking or
 * unticking a week means confirming again.
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
  onlineControl = null,
}: {
  groupId: string;
  /** The weeks offered, the card's own first. */
  weeks: readonly AskWeek[];
  facilitatorFirstNames: readonly string[];
  mode: "before" | "after";
  locked?: boolean;
  onSent?: () => void;
  /** Today's "Joining online" for the card's own session, drawn beside the line it asks them to confirm. */
  onlineControl?: ReactNode;
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
  const [held, setHeld] = useState<O.GivenConfirmations | null>(null);

  const shown = more || weeks.length <= O.WEEKS_SHOWN_FIRST ? weeks : weeks.slice(0, O.WEEKS_SHOWN_FIRST);
  const chosen = weeks.filter((week) => ticked.has(week.sessionKey));
  const off = !hydrated || locked || busy;
  // The lines to confirm, from the weeks ticked, by the route's own rule:
  // only a line drawn as a tick is asked for, and only those are sent as true.
  const lines = O.confirmLinesOf(chosen);
  const chosenKeys = chosen.map((week) => week.sessionKey);
  const confirmed = O.confirmationsFor(held, chosenKeys);
  const asked = (key: keyof AskConfirmed) => (lines ?? []).some((line) => line.kind === "tick" && line.key === key);
  const allConfirmed = (lines ?? []).every((line) => line.kind !== "tick" || confirmed[line.key]);
  const onConfirm = (key: keyof AskConfirmed) => (event: { target: { checked: boolean } }) => {
    const checked = event.target.checked;
    setHeld((was) => ({ forWeeks: O.weeksKeyOf(chosenKeys), given: { ...O.confirmationsFor(was, chosenKeys), [key]: checked } }));
  };

  function toggle(key: string) {
    setTicked((before) => {
      const next = new Set(before);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // What they confirmed was about the weeks ticked then: other weeks are confirmed again.
    setHeld(null);
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
      {
        inPerson: asked("inPerson") && confirmed.inPerson,
        ownOnline: asked("ownOnline") && confirmed.ownOnline,
        otherOnline: asked("otherOnline") && confirmed.otherOnline,
      },
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

      {lines ? (
        <fieldset className={styles.weeks}>
          <legend className={styles.legend}>{O.BEFORE_YOU_ASK}</legend>
          <label className={styles.weekChoice}>
            <input
              type="checkbox"
              checked={confirmed.inPerson}
              onChange={onConfirm("inPerson")}
              disabled={off}
              data-testid="excuse-confirm-in-person"
            />
            <span>{lines[0].words}</span>
          </label>
          {lines[1].kind === "tick" ? (
            <>
              <label className={styles.weekChoice}>
                <input
                  type="checkbox"
                  checked={confirmed.ownOnline}
                  onChange={onConfirm("ownOnline")}
                  disabled={off}
                  data-testid="excuse-confirm-own-online"
                />
                <span>{lines[1].words}</span>
              </label>
              {/* Today's "Joining online", beside the line that asks them to confirm they can't. */}
              {onlineControl}
            </>
          ) : (
            <p className={styles.small}>{lines[1].words}</p>
          )}
          <label className={styles.weekChoice}>
            <input
              type="checkbox"
              checked={confirmed.otherOnline}
              onChange={onConfirm("otherOnline")}
              disabled={off}
              data-testid="excuse-confirm-other-online"
            />
            <span>{lines[2].words}</span>
          </label>
          {/* The seam: another group's session that week is offered here once one-week visits exist. */}
          <p className={styles.small}>
            {O.CONTACT_INSTEAD.before}{" "}
            <a className={styles.mailLink} href={`mailto:${O.CONTACT_INSTEAD.address}`}>
              {O.CONTACT_INSTEAD.address}
            </a>{" "}
            {O.CONTACT_INSTEAD.after}
          </p>
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

      <button type="submit" className={styles.primary} disabled={off || !reason.trim() || !allConfirmed} data-testid="excuse-send">
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
