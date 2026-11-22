"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import MemberText from "@/components/ui/MemberText";
import PageHead from "@/components/ui/PageHead";
import { useHydrated } from "@/hooks/useHydrated";
import * as R from "@/lib/courses/excused/requestWords";
import * as P from "@/lib/courses/registerCorrection/pageWords";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import type { AccessNeedsPageView } from "@/lib/courses/teamAsk/page";
import * as T from "@/lib/courses/teamAsk/words";
import { TEAM_MESSAGE_LIMITS } from "@/lib/firestore/courseTeamAsks";
import { openAccessNeeds, replyToTeamMessage, takeTeamMessage } from "../../teamAsk/api";
import { HandlingBlock, HistoryBlock } from "./Blocks";
import styles from "./Requests.module.css";

/**
 * ONE ACCESS ASK, FOR AN ADMIN (`loadAccessNeedsPage`, which answers nobody
 * else): who sent it and their places this term, and, IN PLACE OF WHAT THEY
 * WROTE, "Only admins can open what Elena wrote, and each opening is
 * recorded." with "Open what Elena wrote". The press asks the open route,
 * which reads the words and the tick and records the opening in one
 * transaction; only then are they drawn here, from this page's own state,
 * never from the server's first render and never kept anywhere else.
 *
 * Then, as for a message: the reply box with "Send the reply", who has it
 * with "Take it", the reply once sent, and the history (each opening among
 * it). The person who sent it neither opens nor replies to it.
 */
export default function AccessNeedsPage({ view }: { view: AccessNeedsPageView }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"reply" | "take" | "open" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ words: string; tellFacilitator: boolean } | null>(null);
  // What was opened is not kept when the page is left: a page the browser
  // restores from its back-forward cache shows the button again, so reading
  // it again is another opening, recorded.
  useEffect(() => {
    const forget = () => flushSync(() => setOpened(null));
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) setOpened(null);
    };
    window.addEventListener("pagehide", forget);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("pagehide", forget);
      window.removeEventListener("pageshow", restored);
    };
  }, []);
  const now = new Date();
  const first = view.subjectFirstName || R.firstOf(view.subject.name);
  const off = !hydrated || busy !== null;
  const state = view.status === "replied" ? "replied" : view.handling ? "handling" : "waiting";

  async function open() {
    setBusy("open");
    setProblem(null);
    const answer = await openAccessNeeds(view.id);
    setBusy(null);
    const body = answer.body ?? {};
    if (!answer.ok || typeof body.words !== "string") {
      setProblem(answer.status === 0 || answer.status >= 500 ? T.ACCESS_DIDNT_OPEN : (answer.error ?? T.ACCESS_DIDNT_OPEN));
      return;
    }
    setOpened({ words: body.words, tellFacilitator: body.tellFacilitator === true });
    // The history now has this opening.
    router.refresh();
  }

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
      const emailed = (answer.body?.emailed as { person?: string } | undefined)?.person ?? "";
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
        title={T.accessTitleWords(view.subject.name)}
        badges={
          <>
            <Chip tone={state === "replied" ? "success" : state === "handling" ? "accent" : "warning"}>{T.STAFF_CHIP[state]}</Chip>
            <Chip tone="neutral">{T.ADMINS_ONLY}</Chip>
          </>
        }
        description={R.sentWords(view.askedAt, now)}
      />

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="status">
          {problem}
        </p>
      )}

      <div className={styles.columns}>
        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="access-person">
            <h2 id="access-person" className={styles.cardTitle}>
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
            {opened ? (
              <>
                <blockquote className={styles.quote}>
                  <MemberText text={opened.words} />
                </blockquote>
                <p className={styles.line}>{T.accessTickWords(first, opened.tellFacilitator)}</p>
              </>
            ) : view.canOpen ? (
              <>
                <p className={styles.line}>{T.accessOpenLineWords(first)}</p>
                <div className={styles.actions}>
                  <Button variant="secondary" onClick={() => void open()} disabled={off}>
                    {T.accessOpenButtonWords(first)}
                  </Button>
                </div>
              </>
            ) : null}
          </section>

          {view.canReply ? (
            <section className={styles.card} aria-labelledby="access-reply">
              <h2 id="access-reply" className={styles.cardTitle}>
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
                  {busy === "reply" ? T.PAGE_WORDS.sending : T.SEND_THE_REPLY}
                </Button>
              </div>
              <p className={styles.line}>{T.replyLineWords(first)}</p>
              <p className={styles.line}>{T.ACCESS_REPLY_GENERAL}</p>
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
            <section className={styles.card} aria-labelledby="access-replies">
              <h2 id="access-replies" className={styles.cardTitle}>
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
