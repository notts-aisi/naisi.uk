"use client";

import { useState, type ReactNode } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { cardStateOf, weeksToChoose } from "@/lib/courses/excused/card";
import type { ExcusedOwnView, OwnExcusedSession } from "@/lib/courses/excused/own";
import * as O from "@/lib/courses/excused/ownWords";
import { SAID_BEFORE_REQUESTS, SAID_IN_ADVANCE, SAID_WHEN_TIME_SET } from "@/lib/courses/excused/words";
import { CANT_MAKE_IT, cantMakeItLabel } from "@/lib/courses/cantMakeIt/words";
import type { JoiningOnlineView } from "@/lib/courses/joiningOnline/model";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import JoiningOnline from "../weekly/JoiningOnline";
import ExcuseSheet from "./ExcuseSheet";
import WithdrawButton from "./WithdrawButton";
import styles from "./Excuse.module.css";

const date = (iso: string | null): Date | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
};

/**
 * WHAT THE TICKET OF A PERSON'S NEXT SESSION SAYS ABOUT BEING EXCUSED, for
 * somebody taking part in the group (`ticketEntryOf` is "ask"): where today's
 * instant "Can't make it" stood.
 *
 * Nothing asked yet: "Joining online" as today, and "Can't make it", which
 * opens the short flow (`ExcuseSheet`): a request an admin decides, which
 * asks first what else they could do, joining online beside it where the
 * session allows it. One at a time, as
 * before: somebody who has said they are joining online is offered "Can't
 * make it" only once they will be in the room after all.
 *
 * Asked: the card in its state, one per row of the rules' table: waiting
 * (with "Withdraw the request"), still waiting once the session has started,
 * excused with who approved it, when and the reply, came after all, declined
 * with the reply, withdrawn; and the two kinds of being excused that came
 * before requests, "Said when the time was set" and "Said in advance, before
 * requests". Never a count.
 *
 * `locked` is a view-as session: everything is drawn and nothing can be
 * pressed (every route refuses it too).
 */
export default function TicketExcuse({
  view,
  session,
  groupName,
  facilitatorFirstNames,
  joiningOnline,
  hasLink,
  locked = false,
  certificateNeeds = null,
}: {
  view: ExcusedOwnView;
  session: OwnExcusedSession;
  groupName: string;
  facilitatorFirstNames: readonly string[];
  joiningOnline: JoiningOnlineView | null;
  hasLink: boolean;
  locked?: boolean;
  /** What a certificate needs, said in the form (`certificateNeedsWords`), or null. */
  certificateNeeds?: string | null;
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState(joiningOnline?.said === true);
  const state = cardStateOf(session);
  const now = new Date();
  const startsAt = date(session.startsAt);
  const day = startsAt ? londonDayLabel(startsAt) : "";
  const when = startsAt ? `${londonDayLabel(startsAt)}, ${londonClockLabel(startsAt)}` : "";

  // The way in: offered while the session may still be asked about.
  const asks = state.kind === "open" || ((state.kind === "declined" || state.kind === "withdrawn") && state.again && session.ask.open && session.ask.when === "before");
  const online = joiningOnline && (asks || said) ? (
    <JoiningOnline key={`online-${joiningOnline.sessionKey}-${said}`} view={{ ...joiningOnline, said }} hasLink={hasLink} locked={locked} onSaidChange={setSaid} />
  ) : null;
  const entry =
    asks && !said ? (
      <button
        type="button"
        className={styles.ticketButton}
        aria-label={cantMakeItLabel(day)}
        onClick={() => setOpen(true)}
        disabled={!hydrated}
        data-testid="excuse-open"
      >
        {CANT_MAKE_IT}
      </button>
    ) : null;
  const weeks = asks
    ? weeksToChoose(view, session.sessionKey).map((each) => ({
        sessionKey: each.sessionKey,
        weekNumber: each.weekNumber,
        occurrence: each.occurrence,
        dateKey: each.dateKey,
        // `weeksToChoose` offers sessions still to come alone.
        upcoming: true,
        onlineOffered: each.first.online,
      }))
    : [];

  let block: ReactNode = null;
  switch (state.kind) {
    case "waiting": {
      const askedAt = date(state.askedAt);
      block = (
        <div className={styles.state} data-state="waiting">
          <span className={`${styles.chip} ${styles.chipWaiting}`}>{O.ASKED_TO_BE_EXCUSED}</span>
          {state.started ? (
            <>
              <p className={styles.line}>{O.STILL_WAITING}</p>
              {askedAt && <p className={styles.small}>{O.youAskedWithReasonWords(askedAt, now, state.reason)}</p>}
            </>
          ) : (
            <p className={styles.line}>{O.waitingWords(facilitatorFirstNames)}</p>
          )}
          <WithdrawButton requestId={state.requestId} sessionKey={session.sessionKey} locked={locked} note={!state.started} />
        </div>
      );
      break;
    }
    case "approved": {
      const at = date(state.at);
      block = (
        <div className={styles.state} data-state="approved">
          <span className={`${styles.chip} ${styles.chipExcused}`}>{O.EXCUSED}</span>
          {at && <p className={styles.line}>{O.approvedLineWords(state.by, at, state.reply)}</p>}
          {state.came && <p className={styles.small}>{O.CAME_AFTER_ALL}</p>}
        </div>
      );
      break;
    }
    case "approved-absent":
      block = (
        <div className={styles.state}>
          <span className={`${styles.chip} ${styles.chipPlain}`}>{O.ABSENT}</span>
          <p className={styles.line}>{O.APPROVED_BUT_ABSENT}</p>
        </div>
      );
      break;
    case "time-set":
    case "in-advance":
      block = (
        <div className={styles.state} data-state={state.kind}>
          <span className={`${styles.chip} ${styles.chipExcused}`}>{O.EXCUSED}</span>
          <p className={styles.line}>
            {state.kind === "time-set" ? SAID_WHEN_TIME_SET : state.beforeRequests ? SAID_BEFORE_REQUESTS : SAID_IN_ADVANCE}
          </p>
        </div>
      );
      break;
    case "declined":
      block = (
        <div className={styles.state} data-state="declined">
          <span className={`${styles.chip} ${styles.chipPlain}`}>{O.NOT_EXCUSED}</span>
          <p className={styles.line}>{O.declinedLineWords(session.weekNumber, session.occurrence, state.by, state.reply)}</p>
        </div>
      );
      break;
    case "withdrawn": {
      const at = date(state.at);
      block = at ? (
        <div className={styles.state} data-state="withdrawn">
          <p className={styles.line}>{O.withdrewWords(at, now)}</p>
        </div>
      ) : null;
      break;
    }
    default:
      block = null;
  }

  if (!block && !online && !entry) return null;
  return (
    <>
      {block}
      {online}
      {entry}
      {open && (
        <ExcuseSheet
          open={open}
          onClose={() => setOpen(false)}
          day={day}
          groupId={view.groupId}
          groupName={groupName}
          first={{
            sessionKey: session.sessionKey,
            weekNumber: session.weekNumber,
            occurrence: session.occurrence,
            dateKey: session.dateKey,
            upcoming: true,
            onlineOffered: session.first.online,
            when,
          }}
          weeks={weeks}
          facilitatorFirstNames={facilitatorFirstNames}
          joiningOnline={session.first.online && joiningOnline && !said ? joiningOnline : null}
          hasLink={hasLink}
          locked={locked}
          onSaidOnline={setSaid}
          certificateNeeds={certificateNeeds}
        />
      )}
    </>
  );
}
