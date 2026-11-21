"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import MemberText from "@/components/ui/MemberText";
import PageHead from "@/components/ui/PageHead";
import { useHydrated } from "@/hooks/useHydrated";
import * as R from "@/lib/courses/excused/requestWords";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import type { TeamMessagePageView } from "@/lib/courses/teamAsk/page";
import * as T from "@/lib/courses/teamAsk/words";
import { TEAM_MESSAGE_LIMITS } from "@/lib/firestore/courseTeamAsks";
import { replyToTeamMessage, takeTeamMessage } from "../../teamAsk/api";
import { HandlingBlock, HistoryBlock } from "./Blocks";
import styles from "./Requests.module.css";

/**
 * ONE MESSAGE TO THE TEAM, FOR AN ADMIN (`loadTeamMessagePage`, which answers
 * nobody else): who sent it and their places this term, what they wrote (as
 * plain text, never made into links), the reply box with "Send the reply",
 * who has it with "Take it", the reply once sent, and the history.
 *
 * The person who sent it never replies to it, and the routes ask again who
 * the caller is. One reply answers it and closes it.
 */
export default function TeamMessagePage({ view }: { view: TeamMessagePageView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "take" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const now = new Date();
  const first = view.subjectFirstName || R.firstOf(view.subject.name);
  const off = !hydrated || busy !== null;
  const state = view.status === "replied" ? "replied" : view.handling ? "handling" : "waiting";

  async function act(action: "reply" | "take") {
    setBusy(action);
    setProblem(null);
    setSaid(null);
    const answer = action === "reply" ? await replyToTeamMessage(view.id, reply) : await takeTeamMessage(view.id);
    setBusy(null);
    if (!answer.ok) {
      setProblem(answer.error);
      router.refresh();
      return;
    }
    if (action === "reply") {
      const emailed = (answer.body?.emailed as { person?: string } | undefined)?.person === "sent";
      setSaid(T.repliedSaidWords(first, emailed));
      setReply("");
    }
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <PageHead
        crumb={
          <Link href={REQUESTS_PATH} className={styles.crumb}>
            {P.REQUESTS_TITLE}
          </Link>
        }
        title={T.messageTitleWords(view.subject.name, view.topic)}
        badges={<Chip tone={state === "replied" ? "success" : state === "handling" ? "accent" : "warning"}>{T.STAFF_CHIP[state]}</Chip>}
        description={R.sentWords(view.askedAt, now)}
      />

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="message-person">
            <h2 id="message-person" className={styles.cardTitle}>
              {view.subject.name}
            </h2>
            {view.places.length === 0 ? (
              <p className={styles.line}>{T.NO_PLACE_THIS_TERM}</p>
            ) : (
              view.places.map((place, index) => (
                <p key={`${place.programmeName}-${index}`} className={styles.line}>
                  {R.personLineWords(place.programmeName, place.groupName, place.facilitatorNames)}
                </p>
              ))
            )}
            <blockquote className={styles.quote}>
              <MemberText text={view.words} />
            </blockquote>
          </section>

          {view.canReply ? (
            <section className={styles.card} aria-labelledby="message-reply">
              <h2 id="message-reply" className={styles.cardTitle}>
                {T.replyToWords(first)}
              </h2>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{T.REPLY_LABEL}</span>
                <textarea
                  className={styles.textarea}
                  value={reply}
                  maxLength={TEAM_MESSAGE_LIMITS.reply}
                  rows={4}
                  onChange={(event) => setReply(event.target.value.replace(/[\r\n]+/g, " "))}
                  disabled={off}
                />
              </label>
              <div className={styles.actions}>
                <Button onClick={() => void act("reply")} disabled={off || !reply.trim()}>
                  {busy === "reply" ? R.SAVING : T.SEND_THE_REPLY}
                </Button>
              </div>
              <p className={styles.line}>{T.replyLineWords(first)}</p>
              {problem && (
                <p className={styles.problem} role="status">
                  {problem}
                </p>
              )}
            </section>
          ) : (
            view.yours && (
              <section className={styles.card}>
                <p className={styles.line}>{T.YOURS}</p>
              </section>
            )
          )}
        </div>

        <div className={styles.side}>
          {view.status === "waiting" && (
            <HandlingBlock
              title={T.HANDLING}
              handling={view.handling}
              mine={view.mine}
              canTake={view.canTake}
              busy={off}
              onTake={() => void act("take")}
            />
          )}
          {view.replies.length > 0 && (
            <section className={styles.card} aria-labelledby="message-replies">
              <h2 id="message-replies" className={styles.cardTitle}>
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
              words: T.historyWords(entry.what, entry.what === "asked" ? first : entry.by.name),
            }))}
          />
        </div>
      </div>
    </div>
  );
}
