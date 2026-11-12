"use client";

import type { ReactNode } from "react";
import { cardStateOf } from "@/lib/courses/excused/card";
import type { OwnExcusedSession } from "@/lib/courses/excused/own";
import * as O from "@/lib/courses/excused/ownWords";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import AskForm from "./AskForm";
import WithdrawButton from "./WithdrawButton";
import styles from "./Excuse.module.css";

const date = (iso: string | null): Date | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
};

/** "Tue 10 Nov, 4pm to 6pm", from the session's own instants. */
function whenOf(session: OwnExcusedSession): string {
  const starts = date(session.startsAt);
  const ends = date(session.endsAt);
  if (!starts) return "";
  return ends
    ? `${londonDayLabel(starts)}, ${londonClockLabel(starts)} to ${londonClockLabel(ends)}`
    : `${londonDayLabel(starts)}, ${londonClockLabel(starts)}`;
}

/**
 * THE PERSON'S LAST SESSION, ONCE IT HAS ENDED, while there is something to
 * say about being excused from it (`lastSessionOf`): its finished register
 * says Absent and nothing was asked, so they may ask after it ("Missed it
 * for a reason?", the request for that one week, `AskForm`); or what became
 * of their request: waiting, excused (with who approved it, when and the
 * reply, or that they came after all), declined with the reply and what the
 * register says, or withdrawn.
 *
 * A member is never told a draft's marks: a register still being taken says
 * nothing here, and asking about it waits until it is finished. Never a
 * count. `locked` is a view-as session.
 */
export default function LastSessionCard({
  session,
  groupId,
  groupName,
  facilitatorFirstNames,
  locked = false,
}: {
  session: OwnExcusedSession;
  groupId: string;
  groupName: string;
  facilitatorFirstNames: readonly string[];
  locked?: boolean;
}) {
  const state = cardStateOf(session);
  const now = new Date();
  const absent = session.register === "absent";
  const chip =
    state.kind === "approved" ? (
      <span className={`${styles.chip} ${styles.chipExcused}`}>{O.EXCUSED}</span>
    ) : state.kind === "waiting" ? (
      <span className={`${styles.chip} ${styles.chipWaiting}`}>{O.ASKED_TO_BE_EXCUSED}</span>
    ) : absent ? (
      <span className={`${styles.chip} ${styles.chipPlain}`}>{O.ABSENT}</span>
    ) : null;
  const form = (
    <>
      <p className={styles.line}>{O.MISSED_IT}</p>
      <h3 className={styles.formTitle}>{O.askForWeekWords(session.weekNumber, session.occurrence)}</h3>
      <AskForm
        groupId={groupId}
        weeks={[{ sessionKey: session.sessionKey, weekNumber: session.weekNumber, occurrence: session.occurrence, dateKey: session.dateKey }]}
        facilitatorFirstNames={facilitatorFirstNames}
        mode="after"
        locked={locked}
      />
    </>
  );

  let body: ReactNode = null;
  switch (state.kind) {
    case "after":
      body = form;
      break;
    case "waiting": {
      const askedAt = date(state.askedAt);
      body = (
        <>
          <p className={styles.line}>{O.waitingWords(facilitatorFirstNames)}</p>
          {askedAt && <p className={styles.small}>{O.youAskedWithReasonWords(askedAt, now, state.reason)}</p>}
          <WithdrawButton requestId={state.requestId} sessionKey={session.sessionKey} locked={locked} />
        </>
      );
      break;
    }
    case "approved": {
      const at = date(state.at);
      body = (
        <>
          {at && <p className={styles.line}>{O.approvedLineWords(state.by, at, state.reply)}</p>}
          {state.came && <p className={styles.small}>{O.CAME_AFTER_ALL}</p>}
        </>
      );
      break;
    }
    case "approved-absent":
      body = <p className={styles.line}>{O.APPROVED_BUT_ABSENT}</p>;
      break;
    case "declined":
      body = (
        <>
          <p className={styles.line}>{O.declinedLineWords(session.weekNumber, session.occurrence, state.by, state.reply)}</p>
          {state.register === "absent" && (
            <div className={styles.registerRow}>
              <span>{O.weekAndDayWords(session.weekNumber, session.occurrence, session.dateKey)}</span>
              <span className={`${styles.chip} ${styles.chipPlain}`}>{O.ABSENT}</span>
              <span className={styles.small}>{O.WHAT_THE_REGISTER_SAYS}</span>
            </div>
          )}
        </>
      );
      break;
    case "withdrawn": {
      const at = date(state.at);
      body = (
        <>
          {at && <p className={styles.line}>{O.withdrewWords(at, now)}</p>}
          {state.again && session.ask.open && session.ask.when === "after" && form}
        </>
      );
      break;
    }
    default:
      return null;
  }

  return (
    <section className={styles.card} aria-labelledby={`last-session-${session.sessionKey}`} data-testid="excuse-last-session" data-state={state.kind}>
      <p className={styles.eyebrow}>{O.lastSessionWords(session.weekNumber, session.occurrence)}</p>
      <div className={styles.cardHead}>
        <h2 id={`last-session-${session.sessionKey}`} className={styles.cardTitle}>
          {whenOf(session)}
        </h2>
        {chip}
      </div>
      {groupName && <p className={styles.small}>{groupName}</p>}
      {body}
    </section>
  );
}
