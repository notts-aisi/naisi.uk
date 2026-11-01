"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { invitedWords, newSinceWords, peopleCount } from "@/lib/events/inviteWords";
import styles from "./InviteNewSince.module.css";

/**
 * "INVITE THE N NEW SINCE", on a published event for chosen people's sign-ups.
 *
 * Somebody who joins the event's tags after it was published is not invited
 * by themselves. This asks `GET /api/events/[id]/invitations` how many there
 * are now, and offers to invite them, with the number on the button, which is
 * the number the press reaches (src/lib/events/invitations.ts). For somebody
 * who may not invite (the route answers as if there were no event), nothing
 * is drawn.
 */
export default function InviteNewSince({ eventId }: { eventId: string }) {
  const [count, setCount] = useState<{ newSince: number; emails: number } | null>(null);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "inviting" } | { kind: "done"; words: string } | { kind: "error"; words: string }
  >({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${encodeURIComponent(eventId)}/invitations`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { ok?: boolean; newSince?: number; emails?: number } | null;
        if (cancelled || !res.ok || !body?.ok) return;
        setCount({ newSince: body.newSince ?? 0, emails: body.emails ?? 0 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, attempt]);

  if (!count) return null;

  async function invite() {
    if (!count || count.newSince === 0) return;
    const question = `Invite the ${peopleCount(count.newSince)} new since? It emails ${
      count.emails === 1 ? "1 invitation" : `${count.emails} invitations`
    }, and it shows on their Home.`;
    if (!window.confirm(question)) return;
    setState({ kind: "inviting" });
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/invitations`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; invited?: number; emailed?: number; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setState({ kind: "error", words: body?.error ?? "We couldn’t invite them. Try again in a moment." });
        return;
      }
      setState({ kind: "done", words: invitedWords(body.invited ?? 0, body.emailed ?? 0) });
      setAttempt((n) => n + 1);
    } catch {
      setState({ kind: "error", words: "We couldn’t invite them. Try again in a moment." });
    }
  }

  return (
    <section className={styles.card} aria-labelledby="invite-new-since">
      <h2 id="invite-new-since" className={styles.title}>
        People who joined its tags since
      </h2>
      <p className={styles.text}>
        {count.newSince === 0
          ? "Everybody it’s for is invited already."
          : `${peopleCount(count.newSince)} in its tags ${count.newSince === 1 ? "isn’t" : "aren’t"} invited yet. Nobody is invited by themselves.`}
      </p>
      {state.kind === "done" && (
        <p className={styles.text} role="status">
          {state.words}
        </p>
      )}
      {state.kind === "error" && (
        <p className={styles.problem} role="alert">
          {state.words}
        </p>
      )}
      {count.newSince > 0 && (
        <div>
          <Button onClick={invite} disabled={state.kind === "inviting"}>
            {state.kind === "inviting" ? "Inviting…" : newSinceWords(count.newSince)}
          </Button>
        </div>
      )}
    </section>
  );
}
