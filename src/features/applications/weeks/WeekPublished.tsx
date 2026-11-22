"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import {
  KEEP_PUBLISHED,
  NOBODY_IS_EMAILED,
  PUBLISHED,
  UNPUBLISH_BODY,
  nobodyStartedWords,
  unpublishAskWords,
  unpublishQuestionWords,
  unpublishWords,
  unpublishedWords,
} from "@/lib/courses/weekSettings/words";
import styles from "./weeks.module.css";
import own from "./weekSettings.module.css";

/**
 * "PUBLISHED" ON A WEEK'S PAGE on a programme's Weeks tab, and taking the week
 * back, through the one checked route that does it
 * (`PATCH /api/courses/runs/[runId]/weeks/[weekId]/published`).
 *
 * The page asks on the server whether the week is in use (`readWeekInUse`:
 * somebody has ticked or written in it, or a group's session for it has
 * passed) and hands the answer in. In use, the card says it stays published,
 * in the route's own sentence (`stays`), and offers nothing. Not in use, it
 * says nobody has started the week and offers "Unpublish week 5…", which
 * asks first. The route asks again in one transaction with its write, so a
 * tick that lands between the page and the press is counted, and whatever it
 * refuses is said here in its own words.
 *
 * Once it has answered the page is read again; the line after the press
 * stays while the card has nothing else to say. Nobody is emailed.
 */
export default function WeekPublished({
  runId,
  weekId,
  weekNumber,
  published,
  stays,
}: {
  runId: string;
  weekId: string;
  weekNumber: number;
  /** The week is published now, as stored. */
  published: boolean;
  /** The route's sentence for a week in use, or null while nobody has started it. */
  stays: string | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function unpublish() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/published`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: false }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "That didn’t save. Try again.");
      setAsking(false);
      setDone(true);
      router.refresh();
    } catch (err) {
      setAsking(false);
      setProblem(err instanceof Error ? err.message : "That didn’t save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!published) {
    return done ? (
      <p className={styles.done} role="status">
        {unpublishedWords(weekNumber)}
      </p>
    ) : null;
  }

  return (
    <section className={styles.panel} aria-labelledby={`week-published-${weekId}`}>
      <h3 id={`week-published-${weekId}`} className={styles.subheading}>
        {PUBLISHED}
      </h3>
      {stays ? (
        <p>{stays}</p>
      ) : (
        <>
          <p>{nobodyStartedWords(weekNumber)}</p>
          <div>
            <button type="button" className={styles.button} onClick={() => setAsking(true)} disabled={!hydrated || busy}>
              {unpublishAskWords(weekNumber)}
            </button>
          </div>
        </>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}

      <Modal open={asking} onClose={() => setAsking(false)} ariaLabel={unpublishQuestionWords(weekNumber)} width="sm">
        {(dismiss) => (
          <section className={own.dialog} aria-labelledby={`week-unpublish-${weekId}`}>
            <h2 id={`week-unpublish-${weekId}`} className={styles.subheading}>
              {unpublishQuestionWords(weekNumber)}
            </h2>
            <p>{UNPUBLISH_BODY}</p>
            <p className={styles.muted}>{NOBODY_IS_EMAILED}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={dismiss} disabled={busy}>
                {KEEP_PUBLISHED}
              </button>
              <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void unpublish()} disabled={busy}>
                {unpublishWords(weekNumber)}
              </button>
            </div>
          </section>
        )}
      </Modal>
    </section>
  );
}
