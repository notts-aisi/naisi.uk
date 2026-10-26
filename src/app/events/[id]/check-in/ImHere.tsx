"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./checkIn.module.css";

type Props = {
  eventId: string;
  /** The sign-up and its token, when the page was opened from a confirmation email's link. */
  rsvpId: string | null;
  token: string | null;
};

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; atWords: string }
  | { kind: "problem"; words: string };

/**
 * "I'm here": one press, one small request. Disabled until the page's script
 * has arrived, so a press is never lost to a page nothing is listening to.
 */
export function ImHere({ eventId, rsvpId, token }: Props) {
  const hydrated = useHydrated();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (state.kind === "done") {
    return (
      <p className={styles.done} role="status">
        You’re checked in at {state.atWords}.
      </p>
    );
  }

  async function press() {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rsvpId && token ? { rsvpId, token } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { atWords?: string; error?: string };
      if (!res.ok || !data.atWords) throw new Error(data.error ?? "That didn’t go through. Try again.");
      setState({ kind: "done", atWords: data.atWords });
    } catch (err) {
      setState({
        kind: "problem",
        words:
          err instanceof TypeError
            ? "There’s no connection. Try again, or give your name at the door."
            : err instanceof Error
              ? err.message
              : "That didn’t go through. Try again.",
      });
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.primary}
        disabled={!hydrated || state.kind === "busy"}
        onClick={() => void press()}
      >
        {state.kind === "busy" ? "Checking you in…" : "I’m here"}
      </button>
      {state.kind === "problem" && (
        <p className={styles.problem} role="alert">
          {state.words}
        </p>
      )}
    </>
  );
}
