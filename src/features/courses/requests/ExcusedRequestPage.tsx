"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import { useHydrated } from "@/hooks/useHydrated";
import type { ExcusedPageWeek, ExcusedRequestPageView } from "@/lib/courses/excused/page";
import * as R from "@/lib/courses/excused/requestWords";
import { NEVER_A_COUNT, REASON_GONE, REPLY_WITHOUT_DECIDING, approveButtonWords, declineButtonWords, timesThisTermWords } from "@/lib/courses/excused/words";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import { EXCUSED_LIMITS } from "@/lib/firestore/courseExcusedRequests";
import { approveExcused, declineExcused, replyToExcused } from "../excused/api";
import styles from "./Requests.module.css";

const TONE: Record<string, ChipTone> = { waiting: "warning", approved: "success", declined: "neutral", withdrawn: "neutral" };

/**
 * ONE REQUEST TO BE EXCUSED, FOR AN ADMIN (`loadExcusedRequestPage`, which
 * answers nobody else): the person and their reason (or, once the programme
 * has closed, that it was deleted), each week with its session and its own
 * decision, what approving each will do before it is pressed (the line will
 * say Excused; a finished register that says Absent changes, logged in the
 * group's history; a line that says they came is left alone), who is
 * emailed and how many, how often they have been excused this term with each
 * kind told apart, the replies and the history.
 *
 * Each week is decided on its own: "Approve and email 2 people", or "Decline
 * and email Grace" with the reply a decline needs; "Reply without deciding"
 * sends the reply alone. One email per decision. The person who asked never
 * decides it, and the routes ask again who the caller is. There is no "Take
 * it" for a request to be excused.
 */
export default function ExcusedRequestPage({ view }: { view: ExcusedRequestPageView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const now = new Date();
  const first = R.firstOf(view.subject.name);
  const off = !hydrated || busy !== null;
  const waitingWeeks = view.weeks.filter((week) => week.status === "waiting");

  async function act(action: "approve" | "decline" | "reply", sessionKey: string | null) {
    setBusy(`${action}-${sessionKey ?? ""}`);
    setProblem(null);
    setSaid(null);
    const answer =
      action === "approve"
        ? await approveExcused(view.id, sessionKey ?? "", reply)
        : action === "decline"
          ? await declineExcused(view.id, sessionKey ?? "", reply)
          : await replyToExcused(view.id, reply);
    setBusy(null);
    if (!answer.ok) {
      setProblem(answer.error);
      router.refresh();
      return;
    }
    const emailed = (answer.body?.emailed ?? {}) as { person?: string; facilitators?: number };
    setSaid(R.decidedSaidWords({ action, firstName: first, person: emailed.person ?? "", facilitators: emailed.facilitators ?? 0 }));
    setReply("");
    router.refresh();
  }

  const weekCard = (week: ExcusedPageWeek) => {
    const label = R.weekLineWords(week);
    return (
      <section key={week.sessionKey} className={styles.card} aria-label={label} data-testid="excused-week" data-state={week.status}>
        <div className={styles.weekHead}>
          <h2 className={styles.cardTitle}>{label}</h2>
          <Chip tone={TONE[week.status] ?? "neutral"}>{P.stateChip(week.status)}</Chip>
        </div>
        {week.asked === "after" && <p className={styles.line}>{R.ASKED_AFTER}</p>}
        {week.cancelled && week.status === "waiting" && <p className={styles.line}>{R.SESSION_NOT_HAPPENING}</p>}
        {week.status === "waiting" && week.approving ? (
          <>
            {week.approving.write === "correct" && week.line.finished && (
              <p className={styles.warn}>
                {R.finishedAbsentWords(R.firstOf(week.line.finished.by.name), week.line.finished.at, first, now)}
              </p>
            )}
            <dl className={styles.before} aria-label={R.WHAT_WILL_HAPPEN}>
              <div className={styles.beforeRow}>
                <dt>{R.APPROVING}</dt>
                <dd>
                  {week.approving.words}
                  {(week.approving.write === "in-advance" || week.approving.write === "draft") && ` ${R.workCarriesOnWords(week.weekNumber)}`}
                </dd>
              </div>
              <div className={styles.beforeRow}>
                <dt>{R.TOLD}</dt>
                <dd>{week.approving.told}</dd>
              </div>
            </dl>
            {view.canDecide && (
              <div className={styles.actions}>
                <Button
                  onClick={() => void act("approve", week.sessionKey)}
                  disabled={off}
                  data-testid="excused-approve"
                  aria-label={`${approveButtonWords(week.approving.emails, week.approving.emails === 1 && week.approving.person ? first : "")}, ${label}`}
                >
                  {busy === `approve-${week.sessionKey}` ? R.SAVING : approveButtonWords(week.approving.emails, week.approving.emails === 1 && week.approving.person ? first : "")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void act("decline", week.sessionKey)}
                  disabled={off || !reply.trim()}
                  data-testid="excused-decline"
                  aria-label={`${declineButtonWords(first)}, ${label}`}
                >
                  {busy === `decline-${week.sessionKey}` ? R.SAVING : declineButtonWords(first)}
                </Button>
              </div>
            )}
          </>
        ) : week.status !== "waiting" ? (
          <>
            <p className={styles.line}>
              {R.decidedWeekWords({
                status: week.status === "approved" || week.status === "declined" ? week.status : "withdrawn",
                by: week.decidedBy?.name ?? "",
                at: week.status === "withdrawn" ? week.withdrawnAt : week.decidedAt,
                personFirstName: first,
                now,
              })}
            </p>
            {week.reply && <blockquote className={styles.quote}>{R.quoted(week.reply)}</blockquote>}
            {week.status === "approved" && R.registerOutcomeWords(week.register) && <p className={styles.line}>{R.registerOutcomeWords(week.register)}</p>}
          </>
        ) : null}
      </section>
    );
  };

  const before = view.excusedBefore;
  const timeSet = before.weeks.filter((week) => week.kind === "time-set");
  const others = before.weeks.filter((week) => week.kind !== "time-set");

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <Link href={REQUESTS_PATH} className={styles.crumb}>
            {P.REQUESTS_TITLE}
          </Link>
        }
        title={R.requestTitleWords(view.subject.name, view.weeks)}
        badges={<Chip tone={TONE[view.status] ?? "neutral"}>{P.stateChip(view.status)}</Chip>}
        description={R.sentWords(view.askedAt, now)}
      />

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="excused-person" data-testid="excused-person">
            <h2 id="excused-person" className={styles.cardTitle}>
              {view.subject.name}
            </h2>
            <p className={styles.line}>
              {R.personLineWords(
                view.programme.name,
                view.group.name,
                view.facilitators.map((each) => each.name),
              )}
            </p>
            {view.reason ? (
              <blockquote className={styles.quote} data-testid="excused-reason">
                {R.quoted(view.reason)}
              </blockquote>
            ) : view.reasonGoneAt ? (
              <p className={styles.line}>
                {REASON_GONE}
              </p>
            ) : null}
            <div>
              <p className={styles.label}>{R.ASKS_TO_BE_EXCUSED_FROM}</p>
              {view.weeks.map((week) => (
                <p key={week.sessionKey} className={styles.line}>
                  {R.weekLineWords(week)}
                </p>
              ))}
            </div>
            {view.weeks.some((week) => week.offered.online) && (
              <div>
                <p className={styles.label}>{R.OFFERED_FIRST}</p>
                <p className={styles.line}>{R.offeredFirstWords(true, first)}</p>
              </div>
            )}
          </section>

          {view.weeks.map(weekCard)}

          {waitingWeeks.length > 0 && view.canDecide ? (
            <section className={styles.card} aria-labelledby="excused-reply">
              <h2 id="excused-reply" className={styles.cardTitle}>
                {R.replyToWords(first)}
              </h2>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{R.REPLY}</span>
                <textarea
                  className={styles.textarea}
                  value={reply}
                  maxLength={EXCUSED_LIMITS.reply}
                  rows={3}
                  onChange={(event) => setReply(event.target.value.replace(/[\r\n]+/g, " "))}
                  disabled={off}
                  data-testid="excused-reply-text"
                />
              </label>
              <p className={styles.line}>
                {R.ONE_EMAIL_PER_DECISION} {R.DECLINE_NEEDS_A_REPLY}
              </p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => void act("reply", null)} disabled={off || !reply.trim()} data-testid="excused-reply">
                  {busy === "reply-" ? R.SAVING : REPLY_WITHOUT_DECIDING}
                </Button>
              </div>
              <p className={styles.line}>{R.replyEmailsWords(first)}</p>
              {problem && (
                <p className={styles.problem} role="status">
                  {problem}
                </p>
              )}
            </section>
          ) : (
            <section className={styles.card}>
              <p className={styles.line}>{view.yours ? R.YOURS : R.NOTHING_TO_DECIDE}</p>
              {problem && (
                <p className={styles.problem} role="status">
                  {problem}
                </p>
              )}
            </section>
          )}
        </div>

        <div className={styles.side}>
          <section className={styles.card} aria-labelledby="excused-before" data-testid="excused-before">
            <div className={styles.weekHead}>
              <h2 id="excused-before" className={styles.cardTitle}>
                {R.EXCUSED_BEFORE}
              </h2>
              <Chip tone="neutral">{R.STAFF_ONLY}</Chip>
            </div>
            <p className={styles.line}>{timesThisTermWords(before.count)}</p>
            {others.length > 0 && (
              <ul className={styles.history}>
                {others.map((week) => {
                  const row = R.excusedBeforeRow(week.weekNumber, week.occurrence, week.dateKey, week.kind);
                  return (
                    <li key={week.sessionKey}>
                      <span>{row.week}</span>
                      <br />
                      <span className={styles.historyWhen}>{row.kind}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className={styles.label}>{R.MOST_WEEKS_TITLE}</p>
            <p className={styles.line}>
              {timeSet.length === 0 ? R.NONE : timeSet.map((week) => R.excusedBeforeRow(week.weekNumber, week.occurrence, week.dateKey, week.kind).week).join(", ")}
            </p>
            <p className={styles.line}>{NEVER_A_COUNT}</p>
          </section>

          <section className={styles.card} aria-labelledby="excused-who">
            <h2 id="excused-who" className={styles.cardTitle}>
              {R.WHO_DECIDES}
            </h2>
            <p className={styles.line}>{R.WHO_DECIDES_LINE}</p>
          </section>

          {view.replies.length > 0 && (
            <section className={styles.card} aria-labelledby="excused-replies">
              <h2 id="excused-replies" className={styles.cardTitle}>
                {R.REPLIES}
              </h2>
              <ol className={styles.history}>
                {view.replies.map((each, index) => (
                  <li key={`${each.at}-${index}`} className={styles.historyRow}>
                    <span className={styles.historyWhen}>{R.replyByWords(each.by.name, each.at, now)}</span>
                    <span>{R.quoted(each.text)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className={styles.card} aria-labelledby="excused-history">
            <h2 id="excused-history" className={styles.cardTitle}>
              {R.HISTORY}
            </h2>
            <ol className={styles.history}>
              {view.history.map((entry, index) => {
                const week = entry.sessionKey ? view.weeks.find((each) => each.sessionKey === entry.sessionKey) : undefined;
                return (
                  <li key={`${entry.what}-${entry.at}-${index}`} className={styles.historyRow}>
                    <span className={styles.historyWhen}>{P.dayAndClock(entry.at)}</span>
                    <span>
                      {R.historyWords({
                        what: entry.what,
                        by: entry.by.name,
                        weekNumber: view.weeks.length > 1 && week ? week.weekNumber : null,
                        occurrence: week?.occurrence ?? 1,
                        personFirstName: entry.what === "asked" || entry.what === "withdrawn" ? first : "",
                      })}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
