"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import kit from "@/features/applications/kit/kit.module.css";
import type { RunStandsView } from "@/lib/applications/handover/views";
import * as W from "@/lib/courses/runStands/words";
import { postRunStatus } from "./editorClient";
import styles from "./RunHandOver.module.css";

/**
 * WHERE THE RUN STANDS, in the Course run section (admins only): the three
 * stages, the sentence under them, and the two early moves, each asking
 * first. What is drawn is what the server worded (`loadRunStands`). A move
 * goes through the one status route, and the section is read again after
 * it, so the line always says what is stored.
 *
 * Neither move emails anybody, and neither can be undone here.
 */
export default function RunStands({
  runId,
  stands,
  live,
  onMoved,
}: {
  runId: string;
  stands: RunStandsView;
  /** The page is live and nothing else in the section is pressing. */
  live: boolean;
  /** Read the section again after a move, with the sentence saying what happened. */
  onMoved: (said: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const start = stands.move === "start";
  const title = start ? W.startTitle(stands.runLabel) : W.completeTitle(stands.runLabel);

  function close() {
    if (busy) return;
    setAsking(false);
    setProblem(null);
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await postRunStatus(runId, start ? "running" : "completed", stands.move === "complete-through");
      setAsking(false);
      await onMoved(start ? W.startedWords(stands.runLabel) : W.completedNowWords(stands.runLabel));
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.part}>
      <h3 className={styles.partTitle}>{W.WHERE_IT_STANDS}</h3>
      <ol className={styles.stages}>
        {stands.stage === "cancelled" ? (
          <li className={`${styles.stage} ${styles.stageNow}`} aria-current="step">
            {W.CANCELLED_STAGE}
          </li>
        ) : (
          W.RUN_STAGES.map((entry) => (
            <li
              key={entry.stage}
              className={entry.stage === stands.stage ? `${styles.stage} ${styles.stageNow}` : styles.stage}
              aria-current={entry.stage === stands.stage ? "step" : undefined}
            >
              {entry.label}
            </li>
          ))
        )}
      </ol>
      {stands.line && <p className={styles.line}>{stands.line}</p>}
      {stands.meaning && <p className={styles.small}>{stands.meaning}</p>}
      {stands.move && (
        <div className={styles.actions}>
          <button type="button" className={styles.quiet} disabled={!live || busy} onClick={() => setAsking(true)}>
            {start ? W.START_BUTTON : W.COMPLETE_BUTTON}
          </button>
        </div>
      )}

      <Modal open={asking} onClose={close} ariaLabel={title} width="sm" sheet>
        <div className={styles.dialog}>
          <h2 className={styles.dialogTitle}>{title}</h2>
          <p className={styles.dialogBody}>{start ? W.START_BODY : W.COMPLETE_BODY}</p>
          <p className={styles.small}>{W.NOBODY_IS_EMAILED}</p>
          {problem && (
            <p className={styles.dialogProblem} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.quiet} disabled={busy} onClick={close}>
              {start ? W.KEEP_DRAFT : W.KEEP_RUNNING}
            </button>
            <button type="button" className={kit.primary} disabled={busy} onClick={() => void confirm()}>
              {start ? W.START_CONFIRM : W.COMPLETE_CONFIRM}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
