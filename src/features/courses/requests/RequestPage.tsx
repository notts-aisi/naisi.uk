"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import { useHydrated } from "@/hooks/useHydrated";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import type { RequestPageView } from "@/lib/courses/requests/load";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import { requestAction } from "../registerCorrection/api";
import styles from "./Requests.module.css";

/**
 * ONE REQUEST'S PAGE, for an admin and the programme's lead: what the line
 * says now and what it should say, the asker's reason, who finished the
 * register and when, what approving will do, "Approve and correct", a reply
 * and "Decline" (a reply is needed to decline), who has it with "Take it",
 * and its history.
 *
 * Nobody approves or declines their own ask: the route refuses it, and the
 * page offers neither (`canDecide`). When the line no longer says what the
 * request says it did, the route refuses the approval with its own sentence,
 * which the page shows, and the request stays waiting. Nobody is emailed by
 * anything here.
 */
export default function RequestPage({ view }: { view: RequestPageView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "decline" | "take">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const waiting = view.status === "waiting";
  const off = !hydrated || busy !== null;

  async function act(action: "approve" | "decline" | "take") {
    setBusy(action);
    setProblem(null);
    setSaid(null);
    const answer = await requestAction(view.id, action, action === "decline" ? reply.trim() : undefined);
    setBusy(null);
    if (!answer.ok) {
      setProblem(answer.error);
      router.refresh();
      return;
    }
    setSaid(
      action === "approve"
        ? `Approved. ${view.subject.name}’s line now says ${view.to}. Nobody was emailed.`
        : action === "decline"
          ? "Declined. The reply is on the register, for the person who asked. Nobody was emailed."
          : "You have it.",
    );
    router.refresh();
  }

  const before = P.approvingLines({ subject: view.subject.name, asker: view.askedBy.name, groupName: view.group.name, mine: view.yours });

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <Link href={REQUESTS_PATH} className={styles.crumb}>
            {P.REQUESTS_TITLE}
          </Link>
        }
        title={`${P.REGISTER_CORRECTION}: ${view.group.name}, ${view.occurrence > 1 ? `week ${view.weekNumber}, session ${view.occurrence}` : `week ${view.weekNumber}`}`}
        badges={<Chip tone={waiting ? (view.handling ? "accent" : "warning") : view.status === "approved" ? "success" : "neutral"}>{P.stateChip(view.state)}</Chip>}
        description={P.askedByWords(view.askedBy.name, view.askedAt)}
      />

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="request-what" data-testid="request-what">
            <h2 id="request-what" className={styles.cardTitle}>
              {view.subject.name}
            </h2>
            <p className={styles.change}>
              <span className={styles.from}>{view.line.now}</span> <span aria-hidden="true">→</span>
              <span className={styles.srOnly}> to </span> <strong>{view.to}</strong>
            </p>
            {view.programme.name && <p className={styles.line}>{view.programme.name}</p>}
            {view.line.setBy && (
              <p className={styles.line}>
                {P.setByChip({ name: view.line.setBy.name, at: view.line.setBy.at, how: view.line.setBy.how })}
              </p>
            )}
            {view.reason && (
              <blockquote className={styles.quote}>
                {P.firstOf(view.askedBy.name)}: {P.quoted(view.reason)}
              </blockquote>
            )}
            <p className={styles.line}>{P.finishedByWords(view.finished)}</p>
            {waiting && !view.line.asAsked && (
              <p className={styles.warn}>
                The line says {view.line.now} now, not {view.from} as it did when this was asked. Approving would be refused: decline it, with a reply.
              </p>
            )}
          </section>

          {waiting ? (
            <section className={styles.card} aria-labelledby="request-happen" data-testid="request-decide">
              <h2 id="request-happen" className={styles.cardTitle}>
                {P.WHAT_WILL_HAPPEN}
              </h2>
              <dl className={styles.before}>
                {before.map((row) => (
                  <div key={row.label} className={styles.beforeRow}>
                    <dt>{row.label}</dt>
                    <dd>{row.text}</dd>
                  </div>
                ))}
              </dl>
              {view.canDecide ? (
                <>
                  <div className={styles.actions}>
                    <Button onClick={() => void act("approve")} disabled={off} data-testid="request-approve">
                      {busy === "approve" ? P.SAVING : P.APPROVE_AND_CORRECT}
                    </Button>
                  </div>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{P.replyLabel(view.askedBy.name)}</span>
                    <textarea
                      className={styles.textarea}
                      value={reply}
                      maxLength={P.REASON_MAX}
                      rows={3}
                      onChange={(event) => setReply(P.oneLine(event.target.value))}
                      disabled={off}
                    />
                  </label>
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => void act("decline")} disabled={off || !reply.trim()} data-testid="request-decline">
                      {busy === "decline" ? P.SAVING : P.DECLINE}
                    </Button>
                  </div>
                </>
              ) : (
                <p className={styles.line}>{P.YOURS_TO_WAIT}</p>
              )}
              {problem && (
                <p className={styles.problem} role="status">
                  {problem}
                </p>
              )}
            </section>
          ) : (
            <section className={styles.card} aria-labelledby="request-decided">
              <h2 id="request-decided" className={styles.cardTitle}>
                What happened
              </h2>
              <p className={styles.line}>{P.decidedWords(view.status, view.decidedBy, view.decidedAt)}</p>
              {view.reply && <blockquote className={styles.quote}>{P.quoted(view.reply)}</blockquote>}
            </section>
          )}

        </div>

        <div className={styles.side}>
          <section className={styles.card} aria-labelledby="request-handling">
            <h2 id="request-handling" className={styles.cardTitle}>
              Handling
            </h2>
            <p className={styles.line}>{P.handlingWords(view.handling, view.mine)}.</p>
            {waiting && view.canTake && (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => void act("take")} disabled={off} data-testid="request-take">
                  {busy === "take" ? P.SAVING : P.TAKE_IT}
                </Button>
              </div>
            )}
          </section>

          <section className={styles.card} aria-labelledby="request-history">
            <h2 id="request-history" className={styles.cardTitle}>
              History
            </h2>
            <ol className={styles.history}>
              {view.history.map((entry, index) => (
                <li key={`${entry.what}-${entry.at}-${index}`} className={styles.historyRow}>
                  <span className={styles.historyWhen}>{P.dayAndClock(entry.at)}</span>
                  <span>{P.historyWords(entry)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
