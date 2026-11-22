"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import * as O from "@/lib/courses/excused/ownWords";
import type { ChangeGroupView } from "@/lib/courses/moveRequest/own";
import { CHANGE_GROUP_FOR_GOOD } from "@/lib/courses/moveRequest/words";
import { DISMISS, WAITING } from "@/lib/courses/visitRequest/words";
import { useCardRefresh } from "../nextSession/refresh";
import { dismissMoveRequest, withdrawMoveRequest } from "./api";
import excuse from "../excused/Excuse.module.css";
import styles from "../visitRequest/VisitRequest.module.css";

/**
 * CHANGING GROUP FOR GOOD, ON THE PROGRAMME PAGE'S CARD (never Home's:
 * `NextSessionCards` draws these only when the programme page hands it the
 * view):
 *
 *  - `ChangeGroupButton`: "Change group for good", to the form's own page,
 *    with the card's buttons. In a view-as session it is drawn and cannot be
 *    pressed.
 *  - `MoveRequestWaiting`: chip "Waiting", "Sent today, 1:05pm", "You asked
 *    to move to Group I for good. An admin decides.", a reply when one came,
 *    and "Withdraw the request".
 *  - `MoveRequestDeclined`: the message at the top, with "Dismiss".
 *  - `MoveRequestApproved`: "You’re in Group I from week 3. ..." at the top,
 *    with who approved it and when.
 *
 * Every press has the card read again; a refusal is the route's own sentence.
 */

export function ChangeGroupButton({ runId, locked = false }: { runId: string; locked?: boolean }) {
  if (locked) {
    return (
      <button type="button" className={excuse.ticketButton} disabled>
        {CHANGE_GROUP_FOR_GOOD}
      </button>
    );
  }
  return (
    <Link className={styles.goLink} href={`/learn/${encodeURIComponent(runId)}/change-group`}>
      {CHANGE_GROUP_FOR_GOOD}
    </Link>
  );
}

export function MoveRequestWaiting({ waiting, locked = false }: { waiting: NonNullable<ChangeGroupView["waiting"]>; locked?: boolean }) {
  const router = useRouter();
  const refreshCard = useCardRefresh();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function press() {
    setBusy(true);
    setProblem(null);
    const answer = await withdrawMoveRequest(waiting.requestId);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error ?? O.DIDNT_SEND);
      return;
    }
    router.refresh();
    refreshCard();
  }

  return (
    <div className={excuse.state} data-state="move-waiting">
      <div className={styles.headRow}>
        <span className={`${excuse.chip} ${excuse.chipWaiting}`}>{WAITING}</span>
        <span className={excuse.small}>{waiting.sent}</span>
      </div>
      <p className={excuse.line}>{waiting.line}</p>
      {waiting.reply && <p className={excuse.small}>{waiting.reply}</p>}
      <div className={excuse.withdraw}>
        <button type="button" className={excuse.secondary} onClick={() => void press()} disabled={!hydrated || locked || busy}>
          {busy ? O.WITHDRAWING : O.WITHDRAW_THE_REQUEST}
        </button>
        <p className={excuse.problem} role="status">
          {problem ?? ""}
        </p>
      </div>
    </div>
  );
}

export function MoveRequestDeclined({ declined, locked = false, className }: { declined: NonNullable<ChangeGroupView["declined"]>; locked?: boolean; className?: string }) {
  const router = useRouter();
  const refreshCard = useCardRefresh();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function press() {
    setBusy(true);
    setProblem(null);
    const answer = await dismissMoveRequest(declined.requestId);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error ?? O.DIDNT_SEND);
      return;
    }
    setGone(true);
    router.refresh();
    refreshCard();
  }

  if (gone) return null;
  return (
    <div className={className}>
      <section className={styles.message} data-state="move-declined">
        <p className={excuse.line}>{declined.line}</p>
        <button type="button" className={excuse.secondary} onClick={() => void press()} disabled={!hydrated || locked || busy}>
          {DISMISS}
        </button>
        <p className={excuse.problem} role="status">
          {problem ?? ""}
        </p>
      </section>
    </div>
  );
}

export function MoveRequestApproved({ approved, className }: { approved: NonNullable<ChangeGroupView["approved"]>; className?: string }) {
  return (
    <div className={className}>
      <section className={styles.message} data-state="move-approved">
        <p className={excuse.line}>{approved.line}</p>
        <p className={excuse.small}>{approved.by}</p>
      </section>
    </div>
  );
}
