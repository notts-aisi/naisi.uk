"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { NO, YES } from "@/lib/courses/facilitatorAsks/words";
import styles from "./Facilitating.module.css";

/**
 * "Yes, I’ll facilitate" and "I can’t this term" (st-fac-ask-phone).
 *
 * Each press posts one word to the answer route and then asks the server to
 * draw the page again, so what is on the screen afterwards is what is stored
 * and never what this component guessed. A refusal (too late, the place
 * taken) is shown as the sentence the route answered with, where the buttons
 * are. Takes the ask's id and nothing else.
 *
 * Nothing here works before the page's scripts have loaded, so both buttons
 * are disabled until they have.
 */

const COULD_NOT_REACH = "We couldn’t reach the site, so nothing was recorded. Check your connection and try again.";
const COULD_NOT_RECORD = "We couldn’t record that. Try again in a moment.";

export default function AskAnswer({ askId }: { askId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [sending, setSending] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redrawing, startRedraw] = useTransition();
  // Held from the press itself, so two taps before the buttons are disabled send one answer.
  const inFlight = useRef(false);

  async function send(answer: "yes" | "no") {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(answer);
    setError(null);
    try {
      const response = await fetch(`/api/courses/facilitator-asks/${encodeURIComponent(askId)}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) setError(body?.error ?? COULD_NOT_RECORD);
      startRedraw(() => router.refresh());
      if (response.ok) document.getElementById("facilitate-heading")?.focus();
    } catch {
      setError(COULD_NOT_REACH);
    } finally {
      inFlight.current = false;
      setSending(null);
    }
  }

  const off = !hydrated || sending !== null || redrawing;
  return (
    <div className={styles.buttons}>
      <button type="button" className={styles.yes} disabled={off} onClick={() => void send("yes")}>
        {sending === "yes" ? "Saying yes…" : YES}
      </button>
      <button type="button" className={styles.no} disabled={off} onClick={() => void send("no")}>
        {sending === "no" ? "Saying no…" : NO}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
