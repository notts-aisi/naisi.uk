import type { CourseRunStatus } from "@/lib/firestore/courses";

/**
 * The run lifecycle, as a table rather than scattered `if`s:
 *
 *   draft -> applications-open -> applications-closed -> running -> completed
 *
 * plus `draft -> running`, the step a run a programme names takes the first
 * time people are handed over to it (or when an admin starts it early from
 * the programme's Settings): such a run takes no application of its own, so
 * the two application stages have nothing to say about it.
 *
 * plus `cancelled`, reachable from any state that has not finished. Nothing
 * leaves `completed` or `cancelled`: both are terminal, because a run that
 * has ended (or been called off) has already had its emails sent and its
 * enrolments settled, and "un-completing" it would silently re-arm every
 * date-driven surface that reads the status.
 *
 * Deliberately forward-only: re-opening a closed application window is NOT
 * modelled here. If that turns out to be wanted, it is a table entry plus a
 * decision about what happens to already-rejected applicants, not something
 * to fall into by accident.
 *
 * This module is the SINGLE source of truth. The status route enforces it,
 * the run editor's dropdown is built from it, and `firestore.rules` mirrors
 * it, so the admin is never offered a move the server will refuse and an
 * approver cannot reach one client-direct. Anything that wants to know "can
 * this run go there" imports `canTransition` rather than restating the table.
 *
 * KEEP THE RULES MIRROR IN STEP. `firestore.rules` carries the same table as
 * a literal in `runStatusMoveAllowed()` on the `courseRuns` block. It exists
 * because the week-plan freeze is keyed on the status: without it an approver
 * could walk a live run back to `draft`, edit the frozen plan, and walk it
 * forward again, and the freeze would be three writes from defeated. Editing
 * this table without editing that one leaves the two disagreeing, and the
 * rules half is the one that decides.
 */
export const ALLOWED_TRANSITIONS: Record<CourseRunStatus, CourseRunStatus[]> = {
  // `running` straight from draft is the step a run a programme names takes
  // at its first hand-over, or when an admin starts it early from the
  // programme's Settings. It still passes the week id check every exit from
  // draft passes (`draftExit.ts`).
  draft: ["applications-open", "running", "cancelled"],
  // OPEN ENROLMENT is why `running` is reachable directly from here. An
  // open-mode run (the pre-course) has no review stage to close: sign-ups
  // stay open into the first weeks of teaching, so the cohort starts while
  // the window is still open, and forcing it through `applications-closed`
  // would shut the door the mode exists to leave open. The admissions path
  // is unaffected and still closes first.
  "applications-open": ["applications-closed", "running", "cancelled"],
  "applications-closed": ["running", "cancelled"],
  running: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * Whether the server will accept `from -> to`. Re-sending the status a run
 * already has is treated as legal here because the route handles it as an
 * idempotent no-op rather than an error.
 */
export function canTransition(from: CourseRunStatus, to: CourseRunStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * THE ONE STEP THROUGH. "Mark it completed now" on a run a programme names
 * whose stored status is still Applications open or Applications closed: the
 * programme's Settings shows all three live statuses as Running, so the move
 * it offers is to Completed, and the status route takes it as two moves of
 * the table, to Running and then to Completed, both checked. Nothing else
 * steps through: every other move is one entry of the table or refused.
 *
 * The moves in order, or null when `to` cannot be reached from `from` this way.
 */
export function stepsThroughRunning(from: CourseRunStatus, to: CourseRunStatus): CourseRunStatus[] | null {
  // A draft is never completed: it has had nobody on it.
  if (to !== "completed" || (from !== "applications-open" && from !== "applications-closed")) return null;
  if (!canTransition(from, "running") || !canTransition("running", "completed")) return null;
  return ["running", "completed"];
}
