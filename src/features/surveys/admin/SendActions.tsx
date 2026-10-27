"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { useHydrated } from "@/hooks/useHydrated";
import { SEND_WORDS, emailButtonWords, joinedButtonWords, peopleWords, type AudienceKind } from "@/lib/surveys/words";
import styles from "./surveyAdmin.module.css";

/**
 * The buttons under one of the Send tab's emails: "Send a test to me" and the
 * send itself, which says how many people it reaches. The first send and a
 * reminder wait for a test of their own wording, as Publish does; the send
 * to people who joined since repeats the email already tested and sent.
 *
 * The number on the button travels with the press, and the route refuses
 * when it is not the number the send would reach now, answering with the new
 * one, so nobody is emailed by a button showing a stale count.
 */

type Kind = "first" | "joined" | "remind";

const ROUTE: Record<Kind, { path: string; body: (emails: number) => Record<string, unknown> }> = {
  first: { path: "send", body: (emails) => ({ to: "everyone", emails }) },
  joined: { path: "send", body: (emails) => ({ to: "joined", emails }) },
  remind: { path: "remind", body: (emails) => ({ emails }) },
};

function buttonWords(kind: Kind, emails: number, audienceKind: AudienceKind): string {
  return kind === "joined" ? joinedButtonWords(emails, audienceKind) : emailButtonWords(emails);
}

type Tally = { sent?: number; held?: number; suppressed?: number; failed?: number; noAddress?: number };

function tallyWords(tally: Tally): string {
  const parts: string[] = [];
  const handed = (tally.sent ?? 0) + (tally.held ?? 0);
  parts.push(`Sent to ${peopleWords(handed)}.`);
  if (tally.held) parts.push(`${tally.held} held by this copy of the site.`);
  if (tally.suppressed) parts.push(`${tally.suppressed} not sent: the address is on the do-not-email list.`);
  if (tally.noAddress) parts.push(`${tally.noAddress} not sent: no email address on their account.`);
  if (tally.failed) parts.push(`${tally.failed} could not be sent; they are still owed it.`);
  return parts.join(" ");
}

export default function SendActions({
  surveyId,
  kind,
  audienceKind = "start",
  emails,
  testFresh,
  testLine,
  blocked,
  extraBody,
  sendLabel,
}: {
  surveyId: string;
  kind: Kind;
  /** Who the survey reaches, for the words on the joined-since button. */
  audienceKind?: AudienceKind;
  /** The number the send would reach now. */
  emails: number;
  /** Whether the presser's own test of this wording has gone. Ignored for "joined". */
  testFresh: boolean;
  /** "Test sent to you at 9:52am", or "". */
  testLine: string;
  /** Why nothing can be sent, or "". */
  blocked: string;
  /** More for the send's body: a survey after an event's first email names who it goes to. */
  extraBody?: Record<string, unknown>;
  /** The send button's words, when the survey's own differ from the programme's. */
  sendLabel?: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const needsTest = kind !== "joined";

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as Tally & { error?: string; delivery?: string; recorded?: boolean };
    return { ok: response.ok, result };
  }

  async function test() {
    setBusy("test");
    setError("");
    setDone("");
    try {
      const { ok, result } = await post("test", { email: kind === "remind" ? "reminder" : "survey" });
      if (!ok) setError(result.error ?? "That test couldn’t be sent. Try again in a minute.");
      else if (!result.recorded) {
        setError(
          result.delivery === "suppressed"
            ? "Your address is on the do-not-email list, so the test reached nobody and doesn’t count."
            : "This copy of the site held the test, so it reached nobody and doesn’t count.",
        );
      } else router.refresh();
    } catch {
      setError("That test couldn’t be sent. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  }

  async function send() {
    setBusy("send");
    setError("");
    setDone("");
    try {
      const { ok, result } = await post(ROUTE[kind].path, { ...ROUTE[kind].body(emails), ...extraBody });
      if (!ok) setError(result.error ?? "Nothing was sent. Try again in a minute.");
      else setDone(tallyWords(result));
      router.refresh();
    } catch {
      setError("Nothing could be confirmed as sent. Check your connection, then reload before pressing again.");
    } finally {
      setBusy("");
    }
  }

  const sendDisabled = !hydrated || busy !== "" || emails === 0 || blocked !== "" || (needsTest && !testFresh);
  return (
    <div className={styles.section}>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className={styles.done} role="status">
          {done}
        </p>
      )}
      <div className={styles.buttons}>
        {needsTest && testLine && (
          <span className={styles.status} role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {testLine}
          </span>
        )}
        {needsTest && (
          <Button variant="secondary" onClick={test} disabled={!hydrated || busy !== "" || blocked !== ""}>
            {busy === "test" ? SEND_WORDS.testing : SEND_WORDS.test}
          </Button>
        )}
        <Button onClick={send} disabled={sendDisabled}>
          {sendLabel ?? buttonWords(kind, emails, audienceKind)}
        </Button>
      </div>
      {blocked ? (
        <p className={styles.note}>{blocked}</p>
      ) : needsTest && !testFresh ? (
        <p className={styles.note}>Send yourself a test of this email first. The button waits for it.</p>
      ) : null}
    </div>
  );
}
