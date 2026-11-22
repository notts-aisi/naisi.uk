"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip, { type ChipTone } from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import { useHydrated } from "@/hooks/useHydrated";
import * as R from "@/lib/courses/excused/requestWords";
import { REPLY_WITHOUT_DECIDING } from "@/lib/courses/excused/words";
import type { MoveRequestPageView } from "@/lib/courses/moveRequest/page";
import { moveRequestTitleWords } from "@/lib/courses/moveRequest/words";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import * as V from "@/lib/courses/visitRequest/words";
import { MEMBER_REQUEST_LIMITS } from "@/lib/firestore/courseMemberRequests";
import { approveMoveRequest, declineMoveRequest, replyToMoveRequest, takeMoveRequest } from "../moveRequest/api";
import { HandlingBlock, HistoryBlock } from "./Blocks";
import styles from "./Requests.module.css";

const TONE: Record<string, ChipTone> = { waiting: "warning", approved: "success", declined: "neutral", withdrawn: "neutral", gone: "neutral" };

/**
 * ONE REQUEST TO CHANGE GROUP FOR GOOD, FOR AN ADMIN (`loadMoveRequestPage`,
 * which answers nobody else): who asks, their own words, what for ("Asks
 * for": the group as it is now, with the places left), what approving will
 * do and who is told, with the count (the staff move's own preview: the week
 * its rule gives now, and its lines); a reply; "Approve and email 3 people",
 * "Decline and send the reply", "Reply without deciding"; who has it, with
 * "Take it"; the replies and the history.
 *
 * The person who asked never decides it, and the routes ask again who the
 * caller is and check the week and the count on the button at the press. A
 * request that went by itself says so and offers nothing.
 */
export default function MoveRequestPage({ view }: { view: MoveRequestPageView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const now = new Date();
  const first = R.firstOf(view.subject.name);
  const off = !hydrated || busy !== null;
  const approving = view.approving;

  async function act(action: "approve" | "decline" | "reply" | "take") {
    setBusy(action);
    setProblem(null);
    setSaid(null);
    const answer =
      action === "approve" && approving?.ok
        ? await approveMoveRequest(view.id, approving.preview.weekNumber, approving.preview.emails, reply)
        : action === "decline"
          ? await declineMoveRequest(view.id, reply)
          : action === "reply"
            ? await replyToMoveRequest(view.id, reply)
            : await takeMoveRequest(view.id);
    setBusy(null);
    if (!answer.ok) {
      setProblem(answer.error);
      router.refresh();
      return;
    }
    const body = answer.body ?? {};
    if (action === "approve") setSaid(typeof body.message === "string" ? body.message : null);
    else if (action !== "take") setSaid(V.saidWords(action, first, (body.emailed as { person?: string } | undefined)?.person === "sent"));
    if (action !== "take") setReply("");
    router.refresh();
  }

  const decided =
    view.status === "approved" || view.status === "declined"
      ? R.decidedWeekWords({ status: view.status, by: view.decidedBy?.name ?? "", at: view.decidedAt, personFirstName: first, now })
      : view.status === "withdrawn"
        ? R.decidedWeekWords({ status: "withdrawn", by: "", at: view.withdrawnAt, personFirstName: first, now })
        : null;

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <Link href={REQUESTS_PATH} className={styles.crumb}>
            {P.REQUESTS_TITLE}
          </Link>
        }
        title={moveRequestTitleWords(view.subject.name)}
        badges={<Chip tone={TONE[view.state] ?? "neutral"}>{view.state === "gone" ? V.ROW_CHIP.closed : P.stateChip(view.status)}</Chip>}
        description={R.sentWords(view.askedAt, now)}
      />

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="move-person">
            <h2 id="move-person" className={styles.cardTitle}>
              {view.subject.name}
            </h2>
            <p className={styles.line}>{R.personLineWords(view.programme.name, view.group.name, view.facilitators.map((each) => each.name))}</p>
            {view.reason && <blockquote className={styles.quote}>{R.quoted(view.reason)}</blockquote>}
            <div>
              <p className={styles.label}>{V.ASKS_FOR}</p>
              <p className={styles.line}>{[view.asksFor.words, view.asksFor.detail].filter(Boolean).join(" · ")}</p>
            </div>
          </section>

          {view.closed && (
            <section className={styles.card}>
              <p className={styles.line}>{view.closed}</p>
            </section>
          )}

          {decided && (
            <section className={styles.card}>
              <p className={styles.line}>{decided}</p>
              {view.reply && view.status !== "withdrawn" && <blockquote className={styles.quote}>{R.quoted(view.reply)}</blockquote>}
            </section>
          )}

          {approving && (
            <section className={styles.card} aria-labelledby="move-happen">
              <h2 id="move-happen" className={styles.cardTitle}>
                {R.WHAT_WILL_HAPPEN}
              </h2>
              {approving.ok ? (
                <>
                  <p className={styles.line}>
                    <strong>{approving.preview.weekStated}</strong>
                  </p>
                  {approving.preview.weeksStay && <p className={styles.line}>{approving.preview.weeksStay}</p>}
                  {approving.preview.skipsOld && <p className={styles.line}>{approving.preview.skipsOld}</p>}
                  <dl className={styles.before}>
                    {approving.preview.lines.map((each, index) => (
                      <div key={`${each.label}-${index}`} className={styles.beforeRow}>
                        <dt>{each.label}</dt>
                        <dd>{each.text}</dd>
                      </div>
                    ))}
                    <div className={styles.beforeRow}>
                      <dt>{R.TOLD}</dt>
                      <dd>
                        {approving.preview.told.count}
                        {approving.preview.told.rest}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className={styles.warn}>{approving.error}</p>
              )}
            </section>
          )}

          {view.canDecide ? (
            <section className={styles.card} aria-labelledby="move-reply">
              <h2 id="move-reply" className={styles.cardTitle}>
                {R.replyToWords(first)}
              </h2>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{R.REPLY}</span>
                <textarea
                  className={styles.textarea}
                  value={reply}
                  maxLength={MEMBER_REQUEST_LIMITS.reply}
                  rows={3}
                  onChange={(event) => setReply(event.target.value.replace(/[\r\n]+/g, " "))}
                  disabled={off}
                />
              </label>
              <div className={styles.actions}>
                {approving?.ok && (
                  <Button onClick={() => void act("approve")} disabled={off}>
                    {busy === "approve" ? R.SAVING : approving.button}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => void act("decline")} disabled={off || !reply.trim()}>
                  {busy === "decline" ? R.SAVING : V.DECLINE_AND_SEND_THE_REPLY}
                </Button>
                <Button variant="secondary" onClick={() => void act("reply")} disabled={off || !reply.trim()}>
                  {busy === "reply" ? R.SAVING : REPLY_WITHOUT_DECIDING}
                </Button>
              </div>
              <p className={styles.line}>
                {R.DECLINE_NEEDS_A_REPLY} {R.replyEmailsWords(first)}
              </p>
              {problem && (
                <p className={styles.problem} role="status">
                  {problem}
                </p>
              )}
            </section>
          ) : (
            view.yours && (
              <section className={styles.card}>
                <p className={styles.line}>{R.YOURS}</p>
              </section>
            )
          )}
        </div>

        <div className={styles.side}>
          {view.state === "waiting" && (
            <HandlingBlock
              title={V.HANDLING}
              handling={view.handling}
              mine={view.mine}
              canTake={view.canTake}
              busy={off}
              onTake={() => void act("take")}
            />
          )}
          {view.replies.length > 0 && (
            <section className={styles.card} aria-labelledby="move-replies">
              <h2 id="move-replies" className={styles.cardTitle}>
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
          <HistoryBlock
            title={R.HISTORY}
            rows={view.history.map((entry, index) => ({
              key: `${entry.what}-${entry.at}-${index}`,
              when: P.dayAndClock(entry.at),
              words: V.historyWords(entry.what, entry.by.name, entry.what === "asked" || entry.what === "withdrawn" || entry.what === "dismissed" ? first : ""),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
