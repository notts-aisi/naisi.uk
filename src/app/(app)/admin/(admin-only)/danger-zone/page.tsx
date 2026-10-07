"use client";

/**
 * TEMPORARY admin page: fire-once data-wipe controls. After both
 * environments (dev + prod) have been reset, remove:
 *   - this directory: `src/app/(app)/admin/(admin-only)/danger-zone/`
 *   - the API route: `src/app/api/admin/nuke-tasks/`
 *   - the "Danger zone" entry in `src/layout/appNav.ts`
 *
 * There are no Firestore documents to clean up afterwards, only these files.
 *
 * What has to be typed, in what order, and what stays disabled until then is
 * the page's whole safety: the wipe button only opens the box, the box asks
 * for the phrase, and Confirm wipe is disabled until the phrase is exact.
 */

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Notice from "@/components/ui/Notice";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import { AdminColumn, AdminPanel } from "@/features/admin/adminPanels";
import styles from "@/features/admin/DangerZone.module.css";
import { useTasks } from "@/features/tasks/hooks/useTasks";

const REQUIRED_CONFIRM = "DELETE ALL TASKS";

type DeletionReport = {
  tasks: number;
  comments: number;
  activity: number;
  attachments: number;
  storageDeleted: number;
  storageFailed: number;
  /** Storage blobs swept from the `tasks/` prefix that weren't
   *  referenced by any attachment doc: orphans from pre-cascade
   *  deletes. */
  prefixSwept: number;
};

export default function DangerZonePage() {
  // Admin sees every task in the project via Firestore rules; no filter
  // needed beyond `includeArchived` so the archived rows count too.
  const { tasks, loading } = useTasks({ includeArchived: true });
  const [stage, setStage] = useState<"idle" | "confirming" | "wiping" | "done">(
    "idle",
  );
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DeletionReport | null>(null);

  async function handleNuke() {
    if (confirmText !== REQUIRED_CONFIRM) {
      setError(`Type "${REQUIRED_CONFIRM}" exactly to enable.`);
      return;
    }
    setStage("wiping");
    setError(null);
    try {
      const res = await fetch("/api/admin/nuke-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: REQUIRED_CONFIRM }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Wipe failed (${res.status})`,
        );
      }
      const body = (await res.json()) as { deleted?: DeletionReport };
      setReport(body.deleted ?? null);
      setStage("done");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Wipe failed");
      setStage("confirming");
    }
  }

  return (
    <AdminPage wide>
      <PageHead
        crumb="Site settings"
        title="Danger zone"
        description="Temporary tools that cannot be undone. Each runs against whichever database this copy of the site is wired to: the practice site wipes the practice data, and the live site wipes the live data."
      />

      <AdminColumn>
        <Notice tone="warning" role="note">
          This page and its route are to be removed once both copies of the site have been reset.
        </Notice>

        <AdminPanel
          tone="careful"
          title="Wipe all tasks"
          description={
            <>
              Wipes every document under <code>tasks/</code> in this project, including{" "}
              <strong>ghost parents</strong> (paths shown in italics in the Firebase console,
              where the task is gone and its old comments, activity or attachments survived an
              earlier delete). Storage is swept under <code>tasks/</code> as well, to catch files
              that no attachment points at any more. Cannot be undone. Task templates, accounts,
              projects and the email delivery records are NOT touched.
            </>
          }
        >
          <p className={styles.count}>
            Live task count:{" "}
            <strong>
              {loading
                ? "counting…"
                : `${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
            </strong>{" "}
            <span className={styles.aside}>
              (the report after a wipe also counts ghost parents and stray files, which this
              number cannot see)
            </span>
          </p>

          {stage === "idle" && (
            <div className={styles.actions}>
              <Button
                variant="danger"
                onClick={() => {
                  setStage("confirming");
                  setConfirmText("");
                  setError(null);
                }}
                disabled={loading}
              >
                Wipe every task path in this project
              </Button>
              {!loading && tasks.length === 0 && (
                <p className={styles.note}>
                  The count says zero, but ghost parents and stray files may still be in
                  Firestore and Storage. Pressing the wipe is still useful: the report will say
                  whether anything was swept.
                </p>
              )}
            </div>
          )}

          {stage === "confirming" && (
            <div className={styles.confirm}>
              <p className={styles.confirmText}>
                Type <code>{REQUIRED_CONFIRM}</code> below to enable the wipe.
                There is no undo.
              </p>
              <Input
                type="text"
                autoFocus
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={REQUIRED_CONFIRM}
                aria-label={`Type ${REQUIRED_CONFIRM} to enable the wipe`}
                className={styles.confirmInput}
                spellCheck={false}
                autoComplete="off"
              />
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.confirmActions}>
                <Button
                  variant="danger"
                  onClick={handleNuke}
                  disabled={confirmText !== REQUIRED_CONFIRM}
                >
                  Confirm wipe
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStage("idle");
                    setConfirmText("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {stage === "wiping" && (
            <p className={styles.note} role="status">
              Wiping… don&apos;t close this tab. This can take a moment if
              there are many tasks with attachments.
            </p>
          )}

          {stage === "done" && report && (
            <div className={styles.done} role="status">
              <strong>Done.</strong> Deleted {report.tasks} task path
              {report.tasks === 1 ? "" : "s"} (including ghost parents),{" "}
              {report.comments} comments, {report.activity} activity entries,{" "}
              {report.attachments} attachments. Storage:{" "}
              {report.storageDeleted} referenced file
              {report.storageDeleted === 1 ? "" : "s"} cleaned,{" "}
              {report.storageFailed} failed,{" "}
              {report.prefixSwept} more stray file
              {report.prefixSwept === 1 ? "" : "s"} swept from under{" "}
              <code>tasks/</code>. Refresh the task board and the
              Firebase console to confirm the empty state.
            </div>
          )}
        </AdminPanel>
      </AdminColumn>
    </AdminPage>
  );
}
