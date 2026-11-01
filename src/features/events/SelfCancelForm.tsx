"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { HELD_PLACE_WORDS } from "@/lib/events/attendanceWords";
import styles from "./RsvpPages.module.css";

type Props = {
  eventId: string;
  rsvpId: string;
  token: string;
  name: string;
  eventTitle: string;
  /**
   * Whether the sign-up holds a confirmed place, which this page then offers
   * to give back in the event page's own words ("Can't make it"). A request
   * not decided yet, or a place on the waiting list, is cancelled as before.
   */
  confirmedPlace: boolean;
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
  confirmedPlace,
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
    return confirmedPlace ? (
      <div className={styles.card}>
        <h1 className={styles.title}>{HELD_PLACE_WORDS.givenHeading}.</h1>
        <p className={styles.muted}>
          Thanks for letting us know. If you change your mind, you can ask for a place
          again from the event page.
        </p>
      </div>
    ) : (
      <div className={styles.card}>
        <h1 className={styles.title}>Your RSVP is cancelled.</h1>
        <p className={styles.muted}>
          Thanks for letting us know. If you change your mind, you can sign up again
          from the event page.
        </p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>
        {confirmedPlace ? `Can’t make it to ${eventTitle}?` : `Cancel your RSVP for ${eventTitle}?`}
      </h1>
      <p className={styles.muted}>
        {confirmedPlace
          ? `Hi ${name || "there"}. Give your place back and somebody else can have it.`
          : `Hi ${name || "there"}. Confirm below and we'll free up your spot.`}
      </p>

      {state.kind === "error" && (
        <p className={styles.danger} role="alert">
          {state.message}
        </p>
      )}

      <div className={styles.actions}>
        <Button onClick={onConfirm} disabled={submitting}>
          {confirmedPlace
            ? submitting
              ? HELD_PLACE_WORDS.giving
              : HELD_PLACE_WORDS.giveBack
            : submitting
              ? "Cancelling…"
              : "Yes, cancel my RSVP"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push(`/events/${eventId}`)}
          disabled={submitting}
        >
          {confirmedPlace ? HELD_PLACE_WORDS.keep : "Never mind"}
        </Button>
      </div>
      {confirmedPlace && <p className={styles.muted}>{HELD_PLACE_WORDS.never}</p>}
    </div>
  );
}
