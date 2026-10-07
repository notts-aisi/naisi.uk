"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import type { EventDoc } from "@/lib/firestore/events";
import styles from "./TestRsvpPanel.module.css";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/**
 * Admin-only tool on the attendee dashboard: generate random confirmed RSVPs
 * to trial an event's signup, catering and pizza-helper views before it ships,
 * and clear them again. Backed by /api/events/[id]/test-rsvps.
 */
export default function TestRsvpPanel({
  event,
  syntheticCount,
  onChanged,
}: {
  event: EventDoc;
  syntheticCount: number;
  /** Re-sync the dashboard after test RSVPs are generated or removed. */
  onChanged: () => Promise<void>;
}) {
  const [count, setCount] = useState(12);
  const [state, setState] = useState<State>({ kind: "idle" });

  const published = event.status === "published";
  const busy = state.kind === "working";

  async function generate() {
    setState({ kind: "working" });
    try {
      const res = await fetch(`/api/events/${event.id}/test-rsvps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; created?: number; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setState({ kind: "error", message: body?.error ?? `Failed (${res.status})` });
        return;
      }
      const n = body.created ?? 0;
      // Server-side write: re-pull so the dashboard reflects it without a
      // wait on the realtime listener (or a manual reload).
      await onChanged().catch(() => {});
      setState({ kind: "done", message: `Added ${n} test sign-up${n === 1 ? "" : "s"}.` });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Generate failed",
      });
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Remove all ${syntheticCount} test sign-up${syntheticCount === 1 ? "" : "s"} from this event?`,
      )
    ) {
      return;
    }
    setState({ kind: "working" });
    try {
      const res = await fetch(`/api/events/${event.id}/test-rsvps`, { method: "DELETE" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: true; deleted?: number; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setState({ kind: "error", message: body?.error ?? `Failed (${res.status})` });
        return;
      }
      const n = body.deleted ?? 0;
      // Server-side write: re-pull so the dashboard reflects it without a
      // wait on the realtime listener (or a manual reload).
      await onChanged().catch(() => {});
      setState({ kind: "done", message: `Removed ${n} test sign-up${n === 1 ? "" : "s"}.` });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Remove failed",
      });
    }
  }

  return (
    <Card as="section" padding="lg">
      <h2 className={styles.title}>Test sign-ups</h2>
      <p className={styles.hint}>
        Made-up people with confirmed places, to check the sign-up, the answers
        and the order helper without typing sign-ups in by hand. About a third
        say they have no requirements; the rest carry a mix. They are marked
        as test data, and they go when the event is deleted.
      </p>

      {published && (
        <p className={styles.note}>
          This event is published, so no more can be made here. Any already
          here can still be removed.
        </p>
      )}

      {(!published || syntheticCount > 0) && (
        <div className={styles.row}>
          {!published && (
            <>
              <div className={styles.countField}>
                <Field id="test-signup-count" label="How many">
                  <Input
                    id="test-signup-count"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={60}
                    value={count}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value));
                      if (Number.isFinite(n)) setCount(Math.min(60, Math.max(1, n)));
                    }}
                    disabled={busy}
                  />
                </Field>
              </div>
              <Button variant="secondary" onClick={generate} disabled={busy}>
                {busy ? "Working…" : "Make test sign-ups"}
              </Button>
            </>
          )}
          {syntheticCount > 0 && (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Remove {syntheticCount} test sign-up{syntheticCount === 1 ? "" : "s"}…
            </Button>
          )}
        </div>
      )}

      {state.kind === "error" && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
      {state.kind === "done" && (
        <p className={styles.done} role="status">
          {state.message}
        </p>
      )}
    </Card>
  );
}
