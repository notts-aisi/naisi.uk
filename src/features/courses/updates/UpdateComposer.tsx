"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useHydrated } from "@/hooks/useHydrated";
import {
  COMPOSER_HEADING,
  EMAIL_SWITCH_LABEL,
  MESSAGE_LABEL,
  TEST_BUTTON,
  TITLE_LABEL,
  TO_HINT,
  TO_LABEL,
  POSTING,
  TEST_FAILED,
  TEST_SENDING,
  TOO_MANY_TO_EMAIL,
  UNKNOWN_OUTCOME,
  counterWords,
  emailSwitchWords,
  postButtonWords,
  postedWords,
  testWords,
} from "@/lib/courses/updates/words";
import { COURSE_UPDATE_LIMITS, type CourseUpdateTo } from "@/lib/firestore/courseUpdates";
import styles from "./UpdateComposer.module.css";

/**
 * "New update" (wk-messages, option B): To, Title, Message with its count,
 * "Also email it", "Send a test to me", and "Post and email N people", or
 * "Post" with the switch off.
 *
 * Used twice: on the lead's Messages tab, where To offers everyone, each
 * group and the facilitators, and on a facilitator's page for their own
 * group, where To is that group and is said rather than offered.
 *
 * THE NUMBERS ARE THE SEND'S. Every audience comes with who its email
 * reaches, counted on the server by the function the press calls. The press
 * sends the number on its button, and the route refuses it (409, with the
 * new number) when that is no longer who the email reaches; the button then
 * shows the new number and nothing has been posted.
 *
 * BEFORE IT HYDRATES the title and the message are boxes nobody is listening
 * to yet, so they are uncontrolled (what was typed survives hydration) and
 * every button is disabled until React has the page (`useHydrated`).
 *
 * After a post the title and message are cleared, so a second press cannot
 * post the same update again, and the page is read again so the list below
 * shows it. No address reaches this component, in either direction.
 */

export type ComposerAudience = {
  /** Unique among the audiences: "everyone", "facilitators", or a group's id. */
  key: string;
  to: CourseUpdateTo;
  groupId: string | null;
  /** "Everyone on AGI Strategy (31)". */
  label: string;
  /** Who the email reaches, counted as the press counts it. */
  emails: number;
  /** Over what one send can take, so the email is not offered. */
  refused: boolean;
  /**
   * Who is placed in the audience and not yet told their group, and that
   * they read the update once Publish tells them; null when nobody is.
   */
  notYetTold: string | null;
};

type Note = { tone: "ok" | "problem"; text: string };

export default function UpdateComposer({
  runId,
  audiences,
}: {
  runId: string;
  /** In the order To offers them; the first is chosen to begin with. */
  audiences: readonly ComposerAudience[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  /** One of the form's two uncontrolled boxes, read from the page as it stands. */
  const box = (name: "title" | "message") =>
    (formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null) ?? null;

  const [selectedKey, setSelectedKey] = useState(audiences[0]?.key ?? "");
  const [emailOn, setEmailOn] = useState(true);
  const [messageLength, setMessageLength] = useState(0);
  const [emailsByKey, setEmailsByKey] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<"post" | "test" | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  // Whatever was typed before React took the page over is counted now.
  useEffect(() => {
    const message = formRef.current?.elements.namedItem("message") as HTMLTextAreaElement | null;
    setMessageLength(message?.value.length ?? 0);
  }, []);

  const audience = audiences.find((each) => each.key === selectedKey) ?? audiences[0];
  if (!audience) return null;
  const emails = emailsByKey[audience.key] ?? audience.emails;
  const canEmail = !audience.refused && emails > 0;
  const email = emailOn && canEmail;

  const send = async (test: boolean) => {
    setBusy(test ? "test" : "post");
    setNote(null);
    const payload = {
      to: audience.to,
      ...(audience.groupId ? { groupId: audience.groupId } : {}),
      title: box("title")?.value ?? "",
      message: box("message")?.value ?? "",
      ...(test ? { test: true } : { email, ...(email ? { emailCount: emails } : {}) }),
    };
    let response: Response;
    let body: Record<string, unknown> | null;
    try {
      response = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setBusy(null);
      setNote({ tone: "problem", text: test ? TEST_FAILED : UNKNOWN_OUTCOME });
      if (!test) router.refresh();
      return;
    }
    setBusy(null);
    const sentence = typeof body?.error === "string" ? body.error : null;

    if (response.status === 409 && typeof body?.emails === "number") {
      // The count on the button no longer holds: show the new one, post nothing.
      const next = body.emails;
      setEmailsByKey((current) => ({ ...current, [audience.key]: next }));
      setNote({ tone: "problem", text: sentence ?? UNKNOWN_OUTCOME });
      return;
    }
    if (!response.ok || body?.ok !== true) {
      // A sentence means the route refused before anything went. Anything
      // else could have gone either way.
      setNote({ tone: "problem", text: sentence ?? (test ? TEST_FAILED : UNKNOWN_OUTCOME) });
      if (!sentence && !test) router.refresh();
      return;
    }

    if (test) {
      const result = body.test as { delivery?: unknown; at?: unknown } | undefined;
      const delivery =
        result?.delivery === "held" || result?.delivery === "suppressed" ? result.delivery : "sent";
      setNote({ tone: delivery === "sent" ? "ok" : "problem", text: testWords(delivery, String(result?.at ?? "")) });
      return;
    }

    const title = box("title");
    const message = box("message");
    if (title) title.value = "";
    if (message) message.value = "";
    setMessageLength(0);
    const tally = body.email as { sent?: number; held?: number; suppressed?: number; failed?: number } | null;
    setNote({
      tone: "ok",
      text: postedWords(
        tally
          ? { sent: tally.sent ?? 0, held: tally.held ?? 0, suppressed: tally.suppressed ?? 0, failed: tally.failed ?? 0 }
          : null,
      ),
    });
    router.refresh();
  };

  const toId = `${ids}-to`;
  const toHintId = `${ids}-to-hint`;
  const waitingId = `${ids}-to-waiting`;
  const titleId = `${ids}-title`;
  const messageId = `${ids}-message`;
  const countId = `${ids}-count`;
  const switchId = `${ids}-email`;
  const offered = audiences.length > 1;

  return (
    <form
      ref={formRef}
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        if (hydrated && !busy) void send(false);
      }}
    >
      <h2 className={styles.heading}>{COMPOSER_HEADING}</h2>

      <div className={styles.field}>
        {offered ? (
          <>
            <label htmlFor={toId} className={styles.label}>
              {TO_LABEL}
            </label>
            <Select
              id={toId}
              value={audience.key}
              disabled={!hydrated || busy !== null}
              aria-describedby={audience.notYetTold ? `${toHintId} ${waitingId}` : toHintId}
              onChange={(event) => {
                setSelectedKey(event.target.value);
                setNote(null);
              }}
            >
              {audiences.map((each) => (
                <option key={each.key} value={each.key}>
                  {each.label}
                </option>
              ))}
            </Select>
            <p className={styles.hint} id={toHintId}>
              {TO_HINT}
            </p>
          </>
        ) : (
          <>
            <span className={styles.label}>{TO_LABEL}</span>
            <p className={styles.fixedTo}>{audience.label}</p>
          </>
        )}
        {audience.notYetTold && (
          <p className={styles.hint} id={waitingId}>
            {audience.notYetTold}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor={titleId} className={styles.label}>
          {TITLE_LABEL}
        </label>
        <Input
          id={titleId}
          name="title"
          type="text"
          autoComplete="off"
          maxLength={COURSE_UPDATE_LIMITS.title}
          defaultValue=""
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={messageId} className={styles.label}>
          {MESSAGE_LABEL}
        </label>
        <Textarea
          id={messageId}
          name="message"
          rows={5}
          maxLength={COURSE_UPDATE_LIMITS.message}
          aria-describedby={countId}
          defaultValue=""
          onInput={(event) => setMessageLength(event.currentTarget.value.length)}
        />
        <div className={styles.countRow}>
          <span />
          <span className={styles.count} id={countId}>
            {counterWords(messageLength, COURSE_UPDATE_LIMITS.message)}
          </span>
        </div>
      </div>

      <div className={styles.switchArea}>
        <label className={styles.switchRow} htmlFor={switchId}>
          <span className={styles.switchText}>
            {EMAIL_SWITCH_LABEL}
            <span className={styles.switchSub}>
              {audience.refused ? TOO_MANY_TO_EMAIL : emailSwitchWords(emails)}
            </span>
          </span>
          <input
            id={switchId}
            type="checkbox"
            role="switch"
            className={styles.switchInput}
            checked={email}
            disabled={!hydrated || busy !== null || !canEmail}
            onChange={(event) => setEmailOn(event.target.checked)}
          />
          <span className={`${styles.track} ${email ? styles.trackOn : ""}`} aria-hidden="true">
            <span className={styles.knob} />
          </span>
        </label>
      </div>

      <div className={styles.actions}>
        <Button
          type="button"
          variant="secondary"
          disabled={!hydrated || busy !== null}
          onClick={() => void send(true)}
        >
          {busy === "test" ? TEST_SENDING : TEST_BUTTON}
        </Button>
        <Button type="submit" variant="primary" disabled={!hydrated || busy !== null}>
          {busy === "post" ? POSTING : postButtonWords(email, emails)}
        </Button>
      </div>

      {note && (
        <p className={note.tone === "ok" ? styles.noteOk : styles.noteProblem} role="status">
          {note.text}
        </p>
      )}
    </form>
  );
}
