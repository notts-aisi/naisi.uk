"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COPY_ITS_WEEKS, copiedWords, sourceWeeksWords } from "@/lib/courses/weeksTab/words";
import type { CopySource } from "@/lib/courses/weeksTab/copy";
import styles from "./weeks.module.css";

/**
 * "Copy its weeks", one button a run (board pr-weeks, "Copy weeks from the
 * course"): sends the copy route (`POST .../runs/[runId]/clone-weeks`) the run
 * to copy from, never asking it to overwrite, so the weeks this run has stay
 * as they are. The route decides who may and answers with its counts, which
 * are said here; the page is read again from the server after.
 */
export default function CopyWeeks({ runId, sources }: { runId: string; sources: CopySource[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ runId: string; tone: "done" | "error"; text: string } | null>(null);

  async function copy(fromRunId: string) {
    if (busy) return;
    setBusy(fromRunId);
    setSaid(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/clone-weeks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromRunId, overwrite: false }),
      });
      const body = (await res.json().catch(() => ({}))) as { created?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn’t copy those weeks. Try again.");
      setSaid({ runId: fromRunId, tone: "done", text: copiedWords(body.created ?? 0, body.skipped ?? 0) });
      router.refresh();
    } catch (err) {
      setSaid({ runId: fromRunId, tone: "error", text: err instanceof Error ? err.message : "Couldn’t copy those weeks. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className={styles.sources}>
      {sources.map((source) => (
        <li key={source.runId} className={styles.source}>
          <span className={styles.sourceName}>{source.label}</span>
          <span className={styles.sourceCount}>{sourceWeeksWords(source.weeks)}</span>
          <button type="button" className={styles.button} onClick={() => void copy(source.runId)} disabled={busy !== null}>
            {busy === source.runId ? "Copying…" : COPY_ITS_WEEKS}
          </button>
          {said?.runId === source.runId && (
            <p className={said.tone === "error" ? styles.problem : styles.done} role={said.tone === "error" ? "alert" : "status"}>
              {said.text}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
