"use client";

import { useRef, useState, type FormEvent } from "react";
import { Textarea } from "@/components/ui/Input";
import { useHydrated } from "@/hooks/useHydrated";
import { ANSWER_MAX_CHARS, QUESTION_KEYS } from "@/lib/anonymousFeedback/model";
import { QUESTION_WORDS, SEND_WORDS } from "@/lib/anonymousFeedback/words";
import styles from "./anonymousFeedback.module.css";

/**
 * The anonymous form's three questions and "Send anonymously".
 *
 * Every box is a real, labelled form control left to the browser
 * (uncontrolled), so nothing typed before the page's script arrives is lost;
 * Send waits for the script (`useHydrated`), because the answers go by the
 * request below and never by the browser's own submission.
 *
 * THE REQUEST CARRIES THE ANSWERS AND THE FORM'S SECRET, AND NOTHING OF THE
 * PERSON: `credentials: "omit"` keeps the browser from sending its cookies,
 * the sign-in among them, and `referrerPolicy: "no-referrer"` from saying
 * which page it came from. Nothing is kept in the browser, before or after.
 * Once sent, the boxes are gone from the page, so nobody using the same
 * screen later can read them.
 *
 * It takes only the two values it draws, never a document.
 */
export default function AnonymousForm({ token, closing }: { token: string; closing: string }) {
  const hydrated = useHydrated();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "idle" || !formRef.current) return;
    const data = new FormData(formRef.current);
    const answer = (key: string) => {
      const value = data.get(key);
      return typeof value === "string" ? value : "";
    };
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, keep: answer("keep"), change: answer("change"), drop: answer("drop") }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("idle");
        setError(result.error ?? SEND_WORDS.tryAgain);
        return;
      }
      setState("sent");
    } catch {
      setState("idle");
      setError(SEND_WORDS.tryAgain);
    }
  }

  if (state === "sent") {
    return (
      <div className={styles.sent} role="status">
        <p className={styles.sentLine}>{SEND_WORDS.thanks}</p>
        <p className={styles.sentNote}>{SEND_WORDS.afterThanks}</p>
      </div>
    );
  }

  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
      {QUESTION_KEYS.map((key, index) => {
        const words = QUESTION_WORDS[key];
        const id = `anonymous-${key}`;
        return (
          <div key={key} className={styles.question}>
            <label htmlFor={id} className={styles.questionTitle}>
              <span className={styles.number}>{index + 1}</span>
              <span>{words.title}</span>
            </label>
            <p id={`${id}-hint`} className={styles.hint}>
              {words.hint}
            </p>
            <Textarea
              id={id}
              name={key}
              rows={5}
              maxLength={ANSWER_MAX_CHARS}
              aria-describedby={`${id}-hint`}
              className={styles.answer}
            />
          </div>
        );
      })}
      <div className={styles.finish}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={styles.send} disabled={!hydrated || state !== "idle"}>
          {state === "sending" ? SEND_WORDS.sending : SEND_WORDS.send}
        </button>
        <p className={styles.closing}>{closing}</p>
      </div>
    </form>
  );
}
