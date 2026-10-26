"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import type { ConsentPanel as Panel } from "@/lib/surveys/answerView";
import { CONSENT_WORDS } from "@/lib/surveys/words";
import styles from "./AnswerScreen.module.css";

/**
 * A consent the person can change on their own survey page ("Stop the
 * follow-ups"), with one button that changes it and changes back. It posts to
 * the route for the door the page was opened through: the person's link, or
 * their session. Nothing is sent until the button is pressed, and the button
 * waits for the page's script.
 */
export default function ConsentPanel({ panel }: { panel: Panel }) {
  const hydrated = useHydrated();
  const [flipped, setFlipped] = useState(false);
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const shown = flipped ? panel.after : { line: panel.line, button: panel.button };
  const sets = flipped ? !panel.sets : panel.sets;

  async function change() {
    if (state !== "idle") return;
    setState("busy");
    setError("");
    const request =
      panel.submit.kind === "link"
        ? { url: "/api/surveys/consent", body: { token: panel.submit.token, purpose: panel.purpose, given: sets } }
        : { url: `/api/surveys/${encodeURIComponent(panel.submit.surveyId)}/consent`, body: { purpose: panel.purpose, given: sets } };
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? CONSENT_WORDS.followUps.failed);
      } else {
        setSaid(flipped ? (panel.sets ? CONSENT_WORDS.followUps.stopped : CONSENT_WORDS.followUps.started) : panel.after.done);
        setFlipped(!flipped);
      }
    } catch {
      setError(CONSENT_WORDS.followUps.failed);
    } finally {
      setState("idle");
    }
  }

  return (
    <section className={styles.consent} aria-label="Follow-ups">
      <p className={styles.consentLine}>{shown.line}</p>
      {said && !error && (
        <p className={styles.consentDone} role="status">
          {said}
        </p>
      )}
      {error && (
        <p className={styles.consentError} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={styles.consentButton} onClick={change} disabled={!hydrated || state === "busy"}>
        {shown.button}
      </button>
    </section>
  );
}
