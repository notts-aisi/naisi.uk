"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import Switch from "@/components/ui/Switch";
import WhoIsThisFor, { type AudienceChoice } from "@/features/audience/WhoIsThisFor";
import { useHydrated } from "@/hooks/useHydrated";
import type { CountView } from "@/lib/audience/resolve";
import { MESSAGE_LIMITS, type MessageTally } from "@/lib/firestore/messageSends";
import { pushTargetOf } from "@/lib/messages/pushTarget";
import {
  COMPOSER_WORDS,
  countWords,
  sendButtonWords,
  sentWords,
  testResultWords,
} from "@/lib/messages/words";
import styles from "./messages.module.css";

/**
 * MESSAGES' WRITE: who it is for (the picker), then the subject and the
 * message, "Send a test to me" and "Send to N people".
 *
 * THE NUMBER ON THE BUTTON IS THE SEND'S. It is the picker's count of the
 * people who would be emailed, worked out on the server by the call the send
 * makes, and the press carries it: when it no longer holds, the route refuses
 * (409) and nothing goes, and the picker counts again.
 *
 * A TEST FIRST. The send is held until a test of exactly these words has
 * reached the writer, as Publish holds; the server is the authority (it
 * refuses an untested send), and this only says so before the press.
 *
 * A NOTICE TO ONE GROUP OR ONE PROGRAMME'S PEOPLE also goes to phones, as
 * the group email and the cohort email's important notice it took over did
 * (`pushTargetOf`), and the composer says so above the buttons.
 *
 * "ALSO POST IT ON THE PROGRAMME'S PAGE" is offered when the choice is one of
 * the tags the page names (`postTargets`): one programme's people or one
 * group, with nobody left out. On by default, so the people it is to keep
 * the programme's updates.
 *
 * BEFORE IT HYDRATES the subject and the message are boxes nobody is
 * listening to yet, so they are uncontrolled (what was typed survives
 * hydration, and is read once React has the page), and every button is
 * disabled until then (`useHydrated`). No address reaches this component, in
 * either direction.
 */

/** A tag the message may also be posted for, and the line under the switch. */
export type ComposerPostTarget = { tagId: string; programme: string; words: string };

type Props = {
  /** Tags to start with: the programme a programme's Messages tab opened this for. */
  initial: string[];
  postTargets: ComposerPostTarget[];
};

type Note = { tone: "ok" | "problem"; text: string };

/** The words as the server reads them: the subject trimmed, the message with its line breaks made `\n` and trimmed. */
const asSent = (subject: string, message: string) => ({
  subject: subject.trim(),
  message: message.replace(/\r\n/g, "\n").trim(),
});

export default function MessageComposer({ initial, postTargets }: Props) {
  const hydrated = useHydrated();
  const ids = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const box = (name: "subject" | "message") =>
    (formRef.current?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null) ?? null;

  const [choice, setChoice] = useState<AudienceChoice>({ include: initial, exclude: [], row: null });
  const [count, setCount] = useState<CountView | null>(null);
  const [recount, setRecount] = useState(0);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tested, setTested] = useState<{ subject: string; message: string } | null>(null);
  const [postOn, setPostOn] = useState(true);
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  // Whatever was typed before React took the page over is read now.
  useEffect(() => {
    const elements = formRef.current?.elements;
    setSubject((elements?.namedItem("subject") as HTMLInputElement | null)?.value ?? "");
    setMessage((elements?.namedItem("message") as HTMLTextAreaElement | null)?.value ?? "");
  }, []);

  const onPicked = useCallback((next: AudienceChoice, view: CountView | null) => {
    setChoice(next);
    setCount(view);
  }, []);

  const words = asSent(subject, message);
  const emailed = count?.emailed ?? 0;
  const target =
    choice.include.length === 1 && choice.exclude.length === 0
      ? (postTargets.find((each) => each.tagId === choice.include[0]) ?? null)
      : null;
  const post = target !== null && postOn;
  // The messages that also go to phones: a notice to one group or one programme's people (the server decides it by the same rule).
  const pushTarget = count !== null ? pushTargetOf(choice.include, count.mode) : null;
  const testFresh = tested !== null && tested.subject === words.subject && tested.message === words.message;

  /** Why Send waits, in the order the writer meets them; null when it is ready. */
  const waitingFor = (() => {
    if (choice.include.length === 0) return COMPOSER_WORDS.chooseFirst;
    if (!count) return COMPOSER_WORDS.counting;
    if (emailed === 0) return COMPOSER_WORDS.nobody;
    if (!words.subject || !words.message) return COMPOSER_WORDS.writeFirst;
    if (!tested) return COMPOSER_WORDS.testFirst;
    if (!testFresh) return COMPOSER_WORDS.testStale;
    return null;
  })();

  const press = async (kind: "test" | "send") => {
    setBusy(kind);
    setNote(null);
    const sent = asSent(box("subject")?.value ?? "", box("message")?.value ?? "");
    const payload =
      kind === "test"
        ? sent
        : { include: choice.include, exclude: choice.exclude, row: choice.row, ...sent, count: emailed, post };
    let response: Response;
    let body: Record<string, unknown> | null;
    try {
      response = await fetch(kind === "test" ? "/api/messages/test" : "/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      setBusy(null);
      setNote({ tone: "problem", text: kind === "test" ? COMPOSER_WORDS.testFailed : COMPOSER_WORDS.unknown });
      return;
    }
    setBusy(null);
    const sentence = typeof body?.error === "string" ? body.error : null;

    if (kind === "send" && response.status === 409 && typeof body?.count === "number") {
      // Who it reaches moved: nothing went, and the picker counts again.
      setCount(null);
      setRecount((n) => n + 1);
      setNote({ tone: "problem", text: sentence ?? COMPOSER_WORDS.unknown });
      return;
    }
    if (kind === "send" && response.status === 409 && typeof body?.test === "string") {
      // The server holds no test of these words: say so, and hold the button.
      setTested(null);
      setNote({ tone: "problem", text: sentence ?? COMPOSER_WORDS.testFirst });
      return;
    }
    if (!response.ok || body?.ok !== true) {
      setNote({ tone: "problem", text: sentence ?? (kind === "test" ? COMPOSER_WORDS.testFailed : COMPOSER_WORDS.unknown) });
      return;
    }

    if (kind === "test") {
      const result = body.test as { delivery?: unknown; at?: unknown } | undefined;
      const delivery = result?.delivery === "held" || result?.delivery === "suppressed" ? result.delivery : "sent";
      if (delivery === "sent") setTested(sent);
      setNote({ tone: delivery === "sent" ? "ok" : "problem", text: testResultWords(delivery, String(result?.at ?? "")) });
      return;
    }

    // Sent: the boxes are cleared, so a second press cannot send it again.
    const subjectBox = box("subject");
    const messageBox = box("message");
    if (subjectBox) subjectBox.value = "";
    if (messageBox) messageBox.value = "";
    setSubject("");
    setMessage("");
    setTested(null);
    const tally: MessageTally = {
      sent: Number(body.sent) || 0,
      held: Number(body.held) || 0,
      suppressed: Number(body.suppressed) || 0,
      failed: Number(body.failed) || 0,
    };
    setNote({ tone: "ok", text: sentWords(tally, typeof body.posted === "string" ? body.posted : null) });
  };

  const subjectId = `${ids}-subject`;
  const messageId = `${ids}-message`;
  const countId = `${ids}-count`;
  const waitingId = `${ids}-waiting`;
  const canSend = hydrated && busy === null && waitingFor === null;

  return (
    <div className={styles.composer}>
      <h2 className="visually-hidden">{COMPOSER_WORDS.heading}</h2>
      <section className={styles.card}>
        <WhoIsThisFor initial={{ include: initial }} onChange={onPicked} recount={recount} />
      </section>

      <form
        ref={formRef}
        className={styles.card}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) void press("send");
        }}
      >
        <div className={styles.field}>
          <label htmlFor={subjectId} className={styles.label}>
            {COMPOSER_WORDS.subject}
          </label>
          <Input
            id={subjectId}
            name="subject"
            type="text"
            autoComplete="off"
            maxLength={MESSAGE_LIMITS.subject}
            defaultValue=""
            onInput={(event) => setSubject(event.currentTarget.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={messageId} className={styles.label}>
            {COMPOSER_WORDS.message}
          </label>
          <Textarea
            id={messageId}
            name="message"
            rows={7}
            maxLength={MESSAGE_LIMITS.message}
            aria-describedby={countId}
            defaultValue=""
            onInput={(event) => setMessage(event.currentTarget.value)}
          />
          <p className={styles.counter} id={countId}>
            {countWords(message.length)} / {countWords(MESSAGE_LIMITS.message)}
          </p>
        </div>

        {target && (
          <div className={styles.post}>
            <Switch
              checked={post}
              onChange={setPostOn}
              disabled={!hydrated || busy !== null}
              label={COMPOSER_WORDS.post}
              description={target.words}
            />
          </div>
        )}

        {pushTarget && (
          <p className={styles.pushes}>
            {pushTarget.kind === "group" ? COMPOSER_WORDS.pushesGroup : COMPOSER_WORDS.pushesProgramme}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" disabled={!hydrated || busy !== null} onClick={() => void press("test")}>
            {busy === "test" ? COMPOSER_WORDS.testSending : COMPOSER_WORDS.test}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSend} aria-describedby={waitingFor ? waitingId : undefined}>
            {busy === "send" ? COMPOSER_WORDS.sending : sendButtonWords(emailed)}
          </Button>
        </div>
        {waitingFor && (
          <p className={styles.waiting} id={waitingId}>
            {waitingFor}
          </p>
        )}

        {note && (
          <p className={note.tone === "ok" ? styles.noteOk : styles.noteProblem} role="status">
            {note.text}
          </p>
        )}
      </form>
    </div>
  );
}
