"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Notice from "@/components/ui/Notice";
import FormRenderer from "./FormRenderer";
import type { FormQuestion, RsvpAnswer } from "@/lib/firestore/events";
import styles from "./RsvpPages.module.css";

type Props = {
  eventId: string;
  rsvpId: string;
  token: string;
  eventTitle: string;
  name: string;
  questions: FormQuestion[];
  initialAnswers: Record<string, RsvpAnswer>;
  hasPending: boolean;
};

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted" }
  | { kind: "error"; message: string };

export default function ChangeRequestForm({
  eventId,
  rsvpId,
  token,
  eventTitle,
  name,
  questions,
  initialAnswers,
  hasPending,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, RsvpAnswer>>(initialAnswers);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `/api/events/${eventId}/rsvp/${rsvpId}/request-change`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers, t: token }),
        },
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setState({
          kind: "error",
          message: body?.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      setState({ kind: "submitted" });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  if (state.kind === "submitted") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>Request sent.</h1>
        <p className={styles.muted}>
          A NAISI organiser will review your proposed changes. We&apos;ll be in touch if
          anything else is needed.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Update your answers for {eventTitle}</h1>
      <p className={styles.muted}>
        Hi {name || "there"}. Adjust anything below and we&apos;ll review the change.
        Your original answers stay in place until we approve the update.
      </p>
      {hasPending && (
        <Notice tone="warning" role="note">
          You already have a change request pending review. Submitting again will
          overwrite it.
        </Notice>
      )}

      <form onSubmit={onSubmit} className={styles.form}>
        <FormRenderer
          questions={questions}
          answers={answers}
          onChange={setAnswers}
          disabled={state.kind === "submitting"}
        />

        {state.kind === "error" && (
          <p className={styles.danger} role="alert">
            {state.message}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="submit" disabled={state.kind === "submitting"}>
            {state.kind === "submitting" ? "Sending…" : "Send change request"}
          </Button>
        </div>
      </form>
    </div>
  );
}
