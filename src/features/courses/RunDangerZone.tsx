"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Switch from "@/components/ui/Switch";
import {
  COURSE_RUN_STATUS_LABEL,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import { ALLOWED_TRANSITIONS } from "@/lib/courses/runStatus";
import { setRunStatus } from "./courseMutations";
import useDestroy from "./useDestroy";
import {
  CancelCohortDialog,
  DangerDisclosure,
  DestroyDialog,
  DestroyEntry,
  DestroyReceipt,
  InterruptedBanner,
  NO_LABEL_TO_TYPE,
  UnfinishedNotice,
} from "./DangerZoneParts";
import styles from "./RunDangerZone.module.css";

// The shared pieces, for the older course page's danger zone, which imports them from here.
export { BlockerList, DangerDisclosure, DestroyDialog, InterruptedBanner, UnfinishedNotice } from "./DangerZoneParts";

/**
 * The run's end-of-life controls on the older run page. The danger-zone
 * pieces it shares with `CourseDangerZone` and Course run are in
 * `DangerZoneParts.tsx`.
 *
 * ── TWO PATHS, AND THEY ARE NOT NEIGHBOURS ──────────────────────────────────
 * ARCHIVE is the everyday one. It is a boolean on the run doc, it is
 * reversible, it destroys nothing, and it is therefore a plain toggle in a
 * plain card with copy that says exactly which surfaces stop showing the run.
 * It sits ABOVE the danger zone and outside it, because putting the safe path
 * behind the same disclosure as the unsafe one teaches people to open the
 * disclosure.
 *
 * DESTROY is not an intensified archive. It is a records-destruction
 * procedure, and it is built like one:
 *
 *   1. It is behind a disclosure, so it is never a mis-click away.
 *   2. It reads a LIVE manifest first and shows what dies as counts, not as an
 *      adjective. "38 enrolments, 412 progress rows, 96 exercise answers" is a
 *      sentence an admin can weigh; "all associated data" is not.
 *   3. It states what SURVIVES with the same weight — the delivery log stays,
 *      templates outlive their course — because a destroy that quietly leaves
 *      things behind is as bad a surprise as one that quietly takes them.
 *   4. It refuses to offer the button at all when the manifest reports a
 *      blocker. A disabled button invites hunting for the state that enables
 *      it; an absent one sends you to read the sentence.
 *   5. It takes a byte-equal typed confirmation of the run's own label.
 *   6. It cannot be dismissed while the cascade is running.
 *   7. It ends in a receipt naming the audit record, with no congratulation.
 *
 * ── THE INTERRUPTED CASE IS A FIRST-CLASS STATE ─────────────────────────────
 * The cascade is paged, so a destroy can be several requests long, and a closed
 * laptop lands squarely in the middle of one. The audit doc's `completedAt:
 * null` is the evidence, the manifest route reports it, and this component
 * surfaces it ABOVE the disclosure — not inside it. Someone returning to a
 * half-destroyed run should not have to open a collapsed panel to find that
 * out. Resuming is the same POST with the same body; the route reads its own
 * audit doc to know where it was.
 *
 * That is also why the two reads are split. The interrupted question is asked
 * on every visit (two document reads, `?probe=interrupted`) because the answer
 * has to reach someone who came here for something else entirely. The manifest
 * — ten live aggregation counts — waits until the disclosure is opened, which
 * is the first moment anybody has expressed interest in destroying anything.
 */

// ---------------------------------------------------------------------------
// Shared props / helpers
// ---------------------------------------------------------------------------

/** The page-level ActionToast driver, passed down like every other section. */
type ToastRun = (
  action: () => Promise<void>,
  opts?: { savingMessage?: string; successMessage?: string },
) => Promise<void>;

type Props = {
  courseId: string;
  run: CourseRunDoc;
  runAction: ToastRun;
  /**
   * Re-read the run doc. Called after archive and after cancel, NEVER after a
   * destroy: there is no doc left to read.
   */
  onRunChanged: () => void;
};

/**
 * `PATCH /api/courses/runs/[runId]/archive`. A route rather than a client-direct
 * write because archiving has consequences the rules can't express — it is what
 * drops the run out of the public catalogue and out of members' live sections —
 * and because the same flag is read by surfaces this admin can't see.
 */
async function setRunArchived(runId: string, archived: boolean): Promise<void> {
  const res = await fetch(`/api/courses/runs/${encodeURIComponent(runId)}/archive`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(
      body.error ?? (archived ? "Couldn't archive this run." : "Couldn't restore this run."),
    );
  }
}

/** Live-cohort statuses, where archiving is a bigger deal than usual. */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "running"];

// ---------------------------------------------------------------------------
// RunDangerZone
// ---------------------------------------------------------------------------

export default function RunDangerZone({ courseId, run, runAction, onRunChanged }: Props) {
  const state = useDestroy("run", run.id, run.label);
  const { manifestState, loadInterrupted, loadManifest, phase } = state;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [archiving, setArchiving] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelText, setCancelText] = useState("");
  const [cancelling, setCancelling] = useState(false);

  /**
   * The archived value we last wrote, so the switch answers the tap rather
   * than the round trip. Cleared whenever a fresh run doc arrives — that doc,
   * not this, is the truth, and a flag that failed to stick SHOULD snap back.
   */
  const [archivedWritten, setArchivedWritten] = useState<boolean | null>(null);
  const [syncedRun, setSyncedRun] = useState<CourseRunDoc | null>(null);
  if (run !== syncedRun) {
    setSyncedRun(run);
    setArchivedWritten(null);
  }
  // `archived` is a real field on CourseRunDoc (orthogonal to the status
  // union: it is not a point in the application → running → completed
  // lifecycle, it is a decision to stop showing a run that may be at any
  // point in it), and the normaliser defaults a run predating it to false.
  const archived = archivedWritten ?? run.archived;

  /**
   * The INTERRUPTED PROBE on mount — two document reads — and nothing else.
   * It is what makes the banner appear on a run whose destroy died mid-page
   * without anyone opening anything.
   *
   * The full manifest is NOT read here: its ten aggregation queries are the
   * price of a decision nobody on this page has made yet, and most visits to
   * a run editor never touch the danger zone at all. It is loaded when the
   * disclosure opens (below) and re-read fresh when the dialog opens.
   */
  useEffect(() => {
    void loadInterrupted();
  }, [loadInterrupted]);

  async function toggleArchived(next: boolean) {
    // The toast holds the screen but not the switch, and a double-tap would
    // send two PATCHes racing each other to set opposite values.
    if (archiving) return;
    setArchiving(true);
    let ok = false;
    try {
      await runAction(
        async () => {
          await setRunArchived(run.id, next);
          ok = true;
        },
        {
          savingMessage: next ? "Archiving run…" : "Restoring run…",
          successMessage: next ? "Run archived" : "Run restored",
        },
      );
    } finally {
      setArchiving(false);
    }
    if (ok) {
      setArchivedWritten(next);
      onRunChanged();
    }
  }

  /**
   * Cancelling calls the SAME status route the editor's dropdown uses. It is
   * here, not there, because it is the one status move that cannot be walked
   * back: the lifecycle table makes `cancelled` terminal, so a mis-tap in a
   * select would permanently kill a cohort's run. The typed confirmation is
   * the destroy dialog's, deliberately: same shape, same exactness, so the
   * gesture reads as "this is the irreversible kind of button".
   *
   * No cascade, and no email. Nothing is deleted: applications, enrolments and
   * everything the cohort produced stay exactly where they are, which is why
   * this is not in the danger zone proper. Telling the cohort is still a
   * manual job today; a cohort cancellation notice is a later change.
   */
  async function cancelRun() {
    if (cancelling || cancelText !== run.label || !run.label) return;
    setCancelling(true);
    let ok = false;
    try {
      await runAction(
        async () => {
          await setRunStatus(run.id, "cancelled");
          ok = true;
        },
        {
          savingMessage: "Cancelling cohort…",
          successMessage: "Cohort cancelled",
        },
      );
    } finally {
      setCancelling(false);
    }
    if (ok) {
      setCancelOpen(false);
      setCancelText("");
      onRunChanged();
    }
  }

  function openDialog() {
    state.reset();
    setConfirmText("");
    setDialogOpen(true);
    // Always a FRESH read at the moment of the decision. The mount read may be
    // an hour old, and the numbers in this dialog are the whole argument.
    void loadManifest();
  }

  function resumeDialog() {
    // Deliberately no `reset()`: a resume carries the failure it is resuming
    // from, and the totals already reported.
    setDialogOpen(true);
    void loadManifest();
  }

  function closeDialog() {
    if (phase === "destroying") return;
    setDialogOpen(false);
  }

  // The server's own table decides whether cancelling is even on the menu, so
  // this card disappears on a run that is already finished or cancelled rather
  // than offering a button the route would refuse.
  //
  // Read straight off the table, NOT through `canTransition`: that helper
  // answers true for a same-status move (the route treats a re-send as an
  // idempotent no-op), so asking it "can a cancelled run be cancelled" got a
  // yes and drew the whole danger card on a cohort that was already called off.
  const canCancel = ALLOWED_TRANSITIONS[run.status].includes("cancelled");
  // A run with no label can't be confirmed by typing it. Local, and stated the
  // same way the server's blockers are.
  const localBlockers = run.label ? [] : [NO_LABEL_TO_TYPE];

  // Suppress the interrupted report while this session is mid-flight or
  // finished: from the moment `destroy()` is called the open audit doc is
  // OURS, and the banner would be describing the thing on screen.
  const interrupted = phase === "idle" ? state.interrupted : null;

  return (
    <>
      <Card padding="lg">
        <h3 className={styles.sectionTitle}>Archive</h3>
        <p className={styles.hint}>
          Archiving takes a finished run out of the way without touching a row
          of it. It drops out of the admin list&apos;s default view, out of the
          public catalogue, out of members&apos; live sections on /learn, and
          out of any application window — while everyone who took it keeps their
          history, their progress and their answers exactly as they left them.
          Reversible at any time.
        </p>

        <div className={styles.archiveRow}>
          <Switch
            checked={archived}
            onChange={toggleArchived}
            disabled={archiving}
            size="lg"
            label={archived ? "Archived" : "Not archived"}
            description={
              archived
                ? "Hidden from the catalogue and from live sections. Member history still reads."
                : "Listed wherever this run would normally appear."
            }
          />
        </div>

        {!archived && LIVE_STATUSES.includes(run.status) && (
          <p className={styles.warn}>
            This run is {COURSE_RUN_STATUS_LABEL[run.status].toLowerCase()}.
            Archiving it now takes it off the catalogue and out of the cohort&apos;s
            live sections immediately — they keep access through their history,
            but the run stops being the thing their dashboard points at.
          </p>
        )}
      </Card>

      {canCancel && (
        <Card padding="lg">
          <h3 className={styles.sectionTitle}>Cancel this cohort</h3>
          <p className={styles.hint}>
            Cancelling calls the run off. It stops being applicable to and stops
            being a live cohort on /learn, and it cannot be undone: a cancelled
            run never moves back to draft or running. Nothing is deleted, so
            every application, enrolment and answer stays readable as history.
            Use archive instead if you only want the run out of the way.
          </p>
          <p className={styles.warn}>
            Nobody is emailed. If this cohort has been meeting, tell them
            yourself before or straight after you cancel.
          </p>
          <div className={styles.archiveRow}>
            <Button
              type="button"
              variant="danger"
              disabled={cancelling}
              onClick={() => {
                setCancelText("");
                setCancelOpen(true);
              }}
            >
              Cancel this cohort…
            </Button>
          </div>
        </Card>
      )}

      <Card padding="lg" className={styles.zoneCard}>
        {interrupted && (
          <InterruptedBanner
            noun="run"
            interrupted={interrupted}
            onResume={() => {
              setConfirmText("");
              state.reset();
              resumeDialog();
            }}
          />
        )}

        {phase === "done" && (
          <DestroyReceipt
            state={state}
            noun="run"
            name={run.label || run.id}
            doneHref={`/admin/courses/${encodeURIComponent(courseId)}`}
            doneLabel="Back to the course"
          />
        )}

        {(phase === "failed" || phase === "stalled") && !dialogOpen && (
          <UnfinishedNotice state={state} noun="run" onResume={resumeDialog} />
        )}

        {phase !== "done" && (
          // The manifest is read when this OPENS, not on mount — see the
          // probe note above.
          <DangerDisclosure title="Danger zone" onFirstOpen={loadManifest}>
            <h4 className={styles.dangerTitle}>Destroy this run</h4>
            <p className={styles.dangerBody}>
              Destroying removes the run and everything keyed to it — its weeks,
              its groups, every application and enrolment, and the progress,
              answers, attendance and mirrored tasks the cohort produced. It
              cannot be undone, it is not what you want for a finished cohort
              (archive is), and what it removes is other people&apos;s work as
              much as yours. Use it for runs created in error, test cohorts, and
              data you have decided must not be retained.
            </p>
            <p className={styles.dangerBody}>
              Every destroy is recorded in <code>courseDeletions</code> — who
              started it, what the manifest said, and what actually went.
            </p>

            <DestroyEntry
              state={state}
              extraBlockers={localBlockers}
              buttonLabel="Destroy this run…"
              onOpen={openDialog}
            />
          </DangerDisclosure>
        )}
      </Card>

      <CancelCohortDialog
        open={cancelOpen}
        run={run}
        cancelling={cancelling}
        cancelText={cancelText}
        onCancelTextChange={setCancelText}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void cancelRun()}
      />

      <DestroyDialog
        open={dialogOpen}
        onClose={closeDialog}
        state={state}
        noun="run"
        nameLabel="run label"
        expectedName={run.label}
        subtitle={run.courseTitle ? `${run.courseTitle} · ${run.label || run.id}` : run.label || run.id}
        extraBlockers={localBlockers}
        confirmText={confirmText}
        onConfirmTextChange={setConfirmText}
        manifestBusy={manifestState === "loading"}
        doneHref={`/admin/courses/${encodeURIComponent(courseId)}`}
        doneLabel="Back to the course"
      />
    </>
  );
}
