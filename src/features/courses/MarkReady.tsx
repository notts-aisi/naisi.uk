"use client";

import { useState } from "react";
import { MARK_READY, NOT_READY } from "@/lib/courses/weekReady";

/**
 * "Mark ready" and "Not ready" for one week of a run (board pr-weeks, Q35):
 * the one control for the one route that stores Ready
 * (`PUT /api/courses/runs/[runId]/weeks/[weekId]/ready`).
 *
 * Drawn where each person who may press it already works: an admin in the
 * run's week editor, and the programme's lead on the programme's Overview,
 * beside the line that says week 1 isn’t ready. The route decides who may;
 * this only says what it answered. Nobody is emailed.
 *
 * It brings no stylesheet of its own: each page hands it the classes of its
 * own buttons (`classes`), so it looks like the page it is on. The button
 * class must carry `appearance: none` and its own colours, as every button
 * here does, or Safari paints it grey.
 *
 * `onDone` reads the page again once the route has answered, so what the
 * page says about the week is what is stored, never what was pressed.
 */
export default function MarkReady({
  runId,
  weekId,
  ready,
  onDone,
  classes,
}: {
  runId: string;
  weekId: string;
  /** Whether the week is ready now, as stored (`weekIsReady`). */
  ready: boolean;
  onDone: () => void;
  /** The page's own classes: the wrapper, the button, and the line that says a press was refused. */
  classes: { control: string; button: string; problem: string };
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function press() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(
        `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/ready`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ready: !ready }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "That didn’t save. Try again.");
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={classes.control}>
      <button type="button" className={classes.button} onClick={() => void press()} disabled={busy}>
        {busy ? "Saving…" : ready ? NOT_READY : MARK_READY}
      </button>
      {problem && (
        <p className={classes.problem} role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
