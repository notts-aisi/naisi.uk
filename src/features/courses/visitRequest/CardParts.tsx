"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import * as O from "@/lib/courses/excused/ownWords";
import type { AnotherSessionView } from "@/lib/courses/visitRequest/own";
import { DISMISS, GO_TO_ANOTHER_SESSION, WAITING, withdrewWords } from "@/lib/courses/visitRequest/words";
import { useCardRefresh } from "../nextSession/refresh";
import { dismissVisitRequest, withdrawVisitRequest } from "./api";
import excuse from "../excused/Excuse.module.css";
import styles from "./VisitRequest.module.css";

/**
 * GOING TO ANOTHER GROUP'S SESSION FOR A WEEK, ON THE CARD (Home and the
 * programme page alike, `NextSessionCards` decides where):
 *
 *  - `GoToAnotherSession`: the button, to the form's own page. In a view-as
 *    session it is drawn and cannot be pressed.
 *  - `VisitRequestWaiting`: chip "Waiting", "Sent today, 1:05pm", "You asked
 *    to go to Group I’s session on Wed 11 Nov, 6pm. An admin decides." (or why
 *    it can't go ahead), a reply when one came, and "Withdraw the request".
 *    Once withdrawn: "You withdrew your request to go to Group I."
 *  - `VisitRequestDeclined`: the message at the top, with "Dismiss".
 *
 * Every press has the card read again; a refusal is the route's own sentence.
 */

export function GoToAnotherSession({ runId, locked = false }: { runId: string; locked?: boolean }) {
  if (locked) {
    return (
      <button type="button" className={excuse.ticketButton} disabled>
        {GO_TO_ANOTHER_SESSION}
      </button>
    );
  }
  return (
    <Link className={styles.goLink} href={`/learn/${encodeURIComponent(runId)}/another-session`}>
      {GO_TO_ANOTHER_SESSION}
    </Link>
  );
}

export function VisitRequestWaiting({ waiting, locked = false }: { waiting: NonNullable<AnotherSessionView["waiting"]>; locked?: boolean }) {
  const router = useRouter();
  const refreshCard = useCardRefresh();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function press() {
    setBusy(true);
    setProblem(null);
    const answer = await withdrawVisitRequest(waiting.requestId);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.error ?? O.DIDNT_SEND);
      return;
    }
    setDone(true);
    router.refresh();
    refreshCard();
  }

  if (done) {
    return (
      <div className={excuse.state} data-state="visit-withdrawn">
        <p className={excuse.line} role="status">
          {withdrewWords(waiting.hostName)}
        </p>
      </div>
    );
  }
  return (
    <div className={excuse.state} data-state="visit-waiting">
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

export function VisitRequestDeclined({ declined, locked = false, className }: { declined: NonNullable<AnotherSessionView["declined"]>; locked?: boolean; className?: string }) {
  const router = useRouter();
  const refreshCard = useCardRefresh();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function press() {
    setBusy(true);
    setProblem(null);
    const answer = await dismissVisitRequest(declined.requestId);
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
      <section className={styles.message}>
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
