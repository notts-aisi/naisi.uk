"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { CheckedIn } from "./CheckedIn";
import styles from "./checkIn.module.css";

type Props = {
  eventId: string;
  /** The sign-up and its token, when the page was opened from a confirmation email's link. */
  rsvpId: string | null;
  token: string | null;
  /** The page was opened by the event's door code: the press says so, and is recorded as a scan of it. */
  doorCode: boolean;
  /** The person's first name, for the answer once checked in; null for "Hello.". */
  firstName: string | null;
  /** The question over the button: "Hi Kofi. Are you here?" and "You signed up for this.". */
  question: { title: string; lead: string };
  /** Under the button: what the press does, and who can see who came. */
  whoSees: string;
};

/**
 * What a press sends: the sign-up and its token from a confirmation email's
 * link, which decides on its own; else that the door code opened the page,
 * so the check-in is recorded as a scan of it; else nothing.
 */
export function pressBody(input: {
  rsvpId: string | null;
  token: string | null;
  doorCode: boolean;
}): { rsvpId: string; token: string } | { doorCode: true } | Record<string, never> {
  if (input.rsvpId && input.token) return { rsvpId: input.rsvpId, token: input.token };
  return input.doorCode ? { doorCode: true } : {};
}

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; atWords: string }
  | { kind: "problem"; words: string };

/**
 * The question and "I'm here": one press, one small request. Disabled until
 * the page's script has arrived, so a press is never lost to a page nothing
 * is listening to. Once the press goes through, the question goes and the
 * answer takes its place, as the page draws it for somebody already checked
 * in (`CheckedIn`, B5).
 */
export function ImHere({ eventId, rsvpId, token, doorCode, firstName, question, whoSees }: Props) {
  const hydrated = useHydrated();
  const [state, setState] = useState<State>({ kind: "idle" });

  if (state.kind === "done") return <CheckedIn firstName={firstName} atWords={state.atWords} />;

  async function press() {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pressBody({ rsvpId, token, doorCode })),
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
      <h1 className={styles.title}>{question.title}</h1>
      <p className={styles.lead}>{question.lead}</p>
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
      <p>{whoSees}</p>
    </>
  );
}
