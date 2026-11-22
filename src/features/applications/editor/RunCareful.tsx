"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import kit from "@/features/applications/kit/kit.module.css";
import { CancelCohortDialog, DestroyDialog, InterruptedBanner, NO_LABEL_TO_TYPE } from "@/features/courses/DangerZoneParts";
import useDestroy from "@/features/courses/useDestroy";
import type { RunCarefulView } from "@/lib/applications/handover/views";
import * as W from "@/lib/courses/runCareful/words";
import { patchRunArchived, postRunCancelled } from "./editorClient";
import styles from "./RunHandOver.module.css";

/**
 * CAREFUL, at the foot of the Course run section (admins only): archive the
 * run once it is completed or cancelled, and bring it back once archived;
 * cancel the cohort; destroy the run. Every one asks first.
 *
 *  - Archive and its way back go through the run's archive route, the older
 *    run page's, with a question each. Offered only once the run is over:
 *    archiving a run people are on would take it out of their lists while
 *    its emails go on.
 *  - Cancel is the older run page's dialog, typed label and all
 *    (`CancelCohortDialog`), through the one status route.
 *  - Destroy is the older run page's dialog (`DestroyDialog`): the live
 *    manifest, the typed label, the receipt, and a destroy that was
 *    interrupted said above it.
 *
 * None of them emails anybody. After each the section is read again.
 */
export default function RunCareful({
  runId,
  careful,
  live,
  onDone,
}: {
  runId: string;
  careful: RunCarefulView;
  /** The page is live and nothing else in the section is pressing. */
  live: boolean;
  /** Read the section again, with the sentence saying what happened. */
  onDone: (said: string) => Promise<void>;
}) {
  const [asking, setAsking] = useState<"archive" | "restore" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [cancelText, setCancelText] = useState("");

  const destroy = useDestroy("run", runId, careful.label);
  const { loadInterrupted, loadManifest, phase } = destroy;
  const [destroying, setDestroying] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Two document reads, so a destroy that stopped part way is said here
  // without anybody opening anything. The manifest waits for the dialog.
  useEffect(() => {
    void loadInterrupted();
  }, [loadInterrupted]);

  function close() {
    if (busy) return;
    setAsking(null);
    setProblem(null);
  }

  async function act(kind: "archive" | "restore" | "cancel") {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (kind === "cancel") await postRunCancelled(runId);
      else await patchRunArchived(runId, kind === "archive");
      setAsking(null);
      setCancelText("");
      await onDone(
        kind === "cancel" ? W.CANCELLED : kind === "archive" ? W.archivedWords(careful.label) : W.restoredWords(careful.label),
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That did not go through. Try again.");
      // The cancel dialog has no line of its own for a refusal: it closes,
      // and the refusal is said under the rows.
      if (kind === "cancel") setAsking(null);
    } finally {
      setBusy(false);
    }
  }

  function openDestroy() {
    destroy.reset();
    setConfirmText("");
    setDestroying(true);
    void loadManifest();
  }

  function closeDestroy() {
    if (phase === "destroying") return;
    setDestroying(false);
    // A run destroyed is gone: the section says so once it is read again.
    if (phase === "done") void onDone("");
  }

  // A destroyed run's receipt leads back to this page, which then says the run has gone.
  const here = usePathname() ?? "";
  const interrupted = phase === "idle" ? destroy.interrupted : null;
  const subtitle = careful.courseTitle ? `${careful.courseTitle} · ${careful.label || runId}` : careful.label || runId;
  const archiving = asking === "archive" || asking === "restore";

  return (
    <div className={styles.part}>
      <h3 className={styles.partTitle}>{W.CAREFUL_TITLE}</h3>
      {interrupted && (
        <InterruptedBanner
          noun="run"
          interrupted={interrupted}
          onResume={() => {
            setConfirmText("");
            destroy.reset();
            setDestroying(true);
            void loadManifest();
          }}
        />
      )}
      <ul className={styles.rows}>
        {careful.archive !== null && (
          <li className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowName}>{W.ARCHIVE_TITLE}</span>
              <span className={styles.small}>
                {careful.archive === "offer"
                  ? W.ARCHIVE_OFFER_HINT
                  : careful.archive === "archived"
                    ? W.ARCHIVED_HINT
                    : W.ARCHIVE_NOT_YET_HINT}
              </span>
            </div>
            {careful.archive === "offer" && (
              <button type="button" className={styles.quiet} disabled={!live} onClick={() => setAsking("archive")}>
                {W.ARCHIVE_BUTTON}
              </button>
            )}
            {careful.archive === "archived" && (
              <button type="button" className={styles.quiet} disabled={!live} onClick={() => setAsking("restore")}>
                {W.RESTORE_BUTTON}
              </button>
            )}
          </li>
        )}
        {careful.canCancel && (
          <li className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowName}>{W.CANCEL_TITLE}</span>
              <span className={styles.small}>{W.CANCEL_HINT}</span>
            </div>
            <button
              type="button"
              className={styles.danger}
              disabled={!live}
              onClick={() => {
                setCancelText("");
                setProblem(null);
                setAsking("cancel");
              }}
            >
              {W.CANCEL_BUTTON}
            </button>
          </li>
        )}
        <li className={styles.row}>
          <div className={styles.rowText}>
            <span className={styles.rowName}>{W.DESTROY_TITLE}</span>
            <span className={styles.small}>{W.DESTROY_HINT}</span>
          </div>
          <button type="button" className={styles.danger} disabled={!live || phase === "destroying"} onClick={openDestroy}>
            {W.DESTROY_BUTTON}
          </button>
        </li>
      </ul>

      {problem && asking === null && (
        <p className={styles.dialogProblem} role="alert">
          {problem}
        </p>
      )}

      <Modal
        open={archiving}
        onClose={close}
        ariaLabel={asking === "restore" ? W.restoreQuestion(careful.label) : W.archiveQuestion(careful.label)}
        width="sm"
        sheet
      >
        <div className={styles.dialog}>
          <h2 className={styles.dialogTitle}>
            {asking === "restore" ? W.restoreQuestion(careful.label) : W.archiveQuestion(careful.label)}
          </h2>
          <p className={styles.dialogBody}>{asking === "restore" ? W.RESTORE_BODY : W.ARCHIVE_BODY}</p>
          <p className={styles.small}>{W.NOBODY_IS_EMAILED}</p>
          {problem && (
            <p className={styles.dialogProblem} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.quiet} disabled={busy} onClick={close}>
              {asking === "restore" ? W.KEEP_ARCHIVED : W.KEEP_IT}
            </button>
            <button
              type="button"
              className={kit.primary}
              disabled={busy}
              onClick={() => void act(asking === "restore" ? "restore" : "archive")}
            >
              {asking === "restore" ? W.RESTORE_CONFIRM : W.ARCHIVE_CONFIRM}
            </button>
          </div>
        </div>
      </Modal>

      <CancelCohortDialog
        open={asking === "cancel"}
        run={{ id: runId, label: careful.label, courseTitle: careful.courseTitle }}
        cancelling={busy}
        cancelText={cancelText}
        onCancelTextChange={setCancelText}
        onClose={close}
        onConfirm={() => {
          if (cancelText === careful.label && careful.label) void act("cancel");
        }}
      />

      <DestroyDialog
        open={destroying}
        onClose={closeDestroy}
        state={destroy}
        noun="run"
        nameLabel="run label"
        expectedName={careful.label}
        subtitle={subtitle}
        extraBlockers={careful.label ? [] : [NO_LABEL_TO_TYPE]}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        manifestBusy={destroy.manifestState === "loading"}
        doneHref={here}
        doneLabel={W.BACK_TO_SETTINGS}
      />
    </div>
  );
}
