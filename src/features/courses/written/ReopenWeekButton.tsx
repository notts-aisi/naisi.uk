"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useHydrated } from "@/hooks/useHydrated";
import {
  KEEP_IT_LOCKED,
  REOPEN,
  REOPEN_FAILED,
  reopenConfirmWords,
  reopenWeekWords,
  reopenedDoneWords,
} from "@/lib/courses/weekWork/words";
import styles from "./written.module.css";

/**
 * "REOPEN WEEK 3 FOR SOFIA", WITH A CONFIRM (privacy v15: "the people running
 * your group can reopen it for you"): on a person's row in a group's This
 * week's work and on their answer's review page, for a week that is
 * submitted or locked, drawn only for a reader the one gate lets act on the
 * person's work (`writtenReviewRole`); the route asks the gate again
 * (`POST /api/courses/runs/[runId]/weeks/[weekId]/reopen`). Nobody is
 * emailed: the person's week page says it was reopened, by whom and until
 * when. Once it has gone through, the page is drawn again from the server.
 */
export default function ReopenWeekButton({
  runId,
  weekNumber,
  uid,
  firstName,
  quiet = false,
}: {
  runId: string;
  weekNumber: number;
  uid: string;
  firstName: string;
  /** A text button, for a row in a table; a secondary button otherwise. */
  quiet?: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const label = reopenWeekWords(weekNumber, firstName);
  const weekId = `w${String(weekNumber).padStart(2, "0")}`;

  const reopen = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !out?.ok) throw new Error(out?.error ?? REOPEN_FAILED);
      setConfirming(false);
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : REOPEN_FAILED);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className={styles.quiet} role="status">
        {reopenedDoneWords(weekNumber, firstName)}
      </span>
    );
  }
  return (
    <>
      {quiet ? (
        <button type="button" className={styles.textButton} onClick={() => setConfirming(true)} disabled={!hydrated}>
          {label}
        </button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirming(true)} disabled={!hydrated}>
          {label}
        </Button>
      )}
      {confirming && (
        <Modal open onClose={() => setConfirming(false)} ariaLabel={label} width="sm">
          {(dismiss) => (
            <div className={styles.dialog}>
              <h2 className={styles.dialogTitle}>{label}?</h2>
              <p className={styles.dialogBody}>{reopenConfirmWords(weekNumber, firstName)}</p>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.dialogActions}>
                <Button type="button" variant="ghost" onClick={dismiss} disabled={busy}>
                  {KEEP_IT_LOCKED}
                </Button>
                <Button type="button" onClick={() => void reopen()} disabled={busy}>
                  {REOPEN}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
