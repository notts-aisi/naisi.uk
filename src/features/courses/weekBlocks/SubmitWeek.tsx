"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { SubmitWeekAnswer } from "@/app/api/courses/runs/[runId]/weeks/[weekId]/submit/route";
import { checkStopsSubmit, type NotDone } from "@/lib/courses/weekWork/model";
import {
  CUT_TO_SUBMIT,
  EVERYTHING_DONE,
  GO_BACK,
  GO_BACK_AND_FINISH,
  SUBMIT_ANYWAY,
  SUBMIT_FAILED,
  SUBMIT_LOCKS_LINE,
  SUBMITTING,
  checkLockLineWords,
  checkTitleWords,
  notDoneLeadWords,
  notDoneWords,
  submitWeekWords,
} from "@/lib/courses/weekWork/words";
import styles from "./weekWork.module.css";

/**
 * SUBMIT, AT THE END OF THE WEEK'S WORK, AND THE CHECK BEFORE IT (the week
 * you submit). One button for the whole week: "Submit week 3", and under it
 * that submitting locks the week.
 *
 * Pressing it first writes every box's waiting save (`flushAll`), then opens
 * the check: what isn't done, named one thing a line, from the page's own
 * count (`weekCheck`), and who may then read the written answer. "Go back and
 * finish" closes it; "Submit anyway" submits the week as it stands. An answer
 * over its word limit stops Submit, with no "Submit anyway". With everything
 * done, the check says so and Submit goes ahead from it.
 *
 * The submit itself is `POST /api/courses/runs/[runId]/weeks/[weekId]/submit`;
 * what comes back (the week's new state, the answers it sent) goes to the
 * page through `onSubmitted`, which draws the week locked.
 */

type Props = {
  runId: string;
  weekId: string;
  weekNumber: number;
  /** What isn't done, from the page's live count: read each time the check is drawn. */
  notDone: readonly NotDone[];
  /** The week has a written answer, which its readers may read once submitted. */
  hasAnswer: boolean;
  /** A facilitator's own week: the programme team reads it, not a facilitator. */
  ownIsTheLeads: boolean;
  /** Writes every box's waiting save; resolves once each has settled. */
  flushAll: () => Promise<void>;
  onSubmitted: (answer: SubmitWeekAnswer) => void;
};

async function postSubmit(runId: string, weekId: string): Promise<SubmitWeekAnswer> {
  const res = await fetch(
    `/api/courses/runs/${encodeURIComponent(runId)}/weeks/${encodeURIComponent(weekId)}/submit`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submit: true }) },
  );
  const out = (await res.json().catch(() => null)) as (SubmitWeekAnswer & { error?: string }) | null;
  if (!res.ok || !out?.ok) throw new Error(out?.error ?? SUBMIT_FAILED);
  return out;
}

export default function SubmitWeek({ runId, weekId, weekNumber, notDone, hasAnswer, ownIsTheLeads, flushAll, onSubmitted }: Props) {
  const [checking, setChecking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (preparing || busy) return;
    setError(null);
    setPreparing(true);
    try {
      await flushAll();
    } finally {
      setPreparing(false);
    }
    setChecking(true);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await flushAll();
      const answer = await postSubmit(runId, weekId);
      setChecking(false);
      onSubmitted(answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : SUBMIT_FAILED);
    } finally {
      setBusy(false);
    }
  };

  const stops = checkStopsSubmit(notDone);
  const missing = notDone.length;

  return (
    <section className={styles.submit} aria-label={submitWeekWords(weekNumber)}>
      <Button type="button" fullWidth size="lg" onClick={() => void open()} disabled={preparing || busy}>
        {submitWeekWords(weekNumber)}
      </Button>
      <p className={styles.submitLine}>{SUBMIT_LOCKS_LINE}</p>
      {error && !checking && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {checking && (
        <Modal open onClose={() => setChecking(false)} ariaLabel={checkTitleWords(weekNumber)} width="sm" sheet>
          {(dismiss) => (
            <div className={styles.dialog}>
              <h2 className={styles.dialogTitle}>{checkTitleWords(weekNumber)}</h2>
              {missing > 0 ? (
                <>
                  <p className={styles.dialogLead}>{notDoneLeadWords(missing)}</p>
                  <ul className={styles.dialogList} role="list">
                    {notDone.map((item, index) => (
                      <li key={`${item.kind}-${index}`} className={styles.dialogItem}>
                        {notDoneWords(item)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={styles.dialogLead}>{EVERYTHING_DONE}</p>
              )}
              <p className={styles.dialogQuiet}>{stops ? CUT_TO_SUBMIT : checkLockLineWords({ hasAnswer, ownIsTheLeads })}</p>
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.dialogActions}>
                {missing > 0 ? (
                  <>
                    <Button type="button" fullWidth onClick={dismiss} disabled={busy}>
                      {GO_BACK_AND_FINISH}
                    </Button>
                    {!stops && (
                      <Button type="button" variant="secondary" fullWidth onClick={() => void submit()} disabled={busy}>
                        {busy ? SUBMITTING : SUBMIT_ANYWAY}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button type="button" fullWidth onClick={() => void submit()} disabled={busy}>
                      {busy ? SUBMITTING : submitWeekWords(weekNumber)}
                    </Button>
                    <Button type="button" variant="secondary" fullWidth onClick={dismiss} disabled={busy}>
                      {GO_BACK}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
