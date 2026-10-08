"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import styles from "./RsvpPages.module.css";

type Props = {
  eventId: string;
  rsvpId: string;
  token: string;
  name: string;
  eventTitle: string;
};

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

export default function SelfCancelForm({
  eventId,
  rsvpId,
  token,
  name,
  eventTitle,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onConfirm() {
    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `/api/events/${eventId}/rsvp/${rsvpId}/cancel?t=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setState({
          kind: "error",
          message: body?.error ?? `Cancel failed (${res.status})`,
        });
        return;
      }
      setState({ kind: "cancelled" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Cancel failed",
      });
    }
  }

  if (state.kind === "cancelled") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Your RSVP is cancelled.</h1>
        <p className={styles.muted}>
          Thanks for letting us know. If you change your mind, you can sign up again
          from the event page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Cancel your RSVP for {eventTitle}?</h1>
      <p className={styles.muted}>
        Hi {name || "there"}. Confirm below and we&apos;ll free up your spot.
      </p>

      {state.kind === "error" && (
        <p className={styles.danger} role="alert">
          {state.message}
        </p>
      )}

      <div className={styles.actions}>
        <Button onClick={onConfirm} disabled={state.kind === "submitting"}>
          {state.kind === "submitting" ? "Cancelling…" : "Yes, cancel my RSVP"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push(`/events/${eventId}`)}
          disabled={state.kind === "submitting"}
        >
          Never mind
        </Button>
      </div>
    </div>
  );
}
