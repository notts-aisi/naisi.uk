import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  COURSE_RUN_STATUSES,
  COURSE_RUN_STATUS_LABEL,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import { draftExitBlocker } from "./draftExit";
import { canTransition, stepsThroughRunning } from "./runStatus";

/**
 * THE ONE CHECKED PATH A RUN'S STATUS MOVES BY, for everything that moves it
 * on the server: the status route (an admin or a course approver, from the
 * older editor or a programme's Settings) and the job that completes a run
 * once its work closes (`src/lib/scheduler/jobs/runsComplete.ts`). The first
 * hand-over starts a draft run running inside its own transaction instead,
 * asking the same week id check (`draftExit.ts`).
 *
 * In one transaction, in this order:
 *
 *  1. the run is read; a run that is not there is 404;
 *  2. a run mid-destroy refuses every move (409): the cascade owns the
 *     document until it is gone, and a status that came back to life would
 *     advertise a half-emptied cohort on every surface that reads it;
 *  3. a move to the status it already has is a no-op, never an error: a
 *     double-clicked button, or the job meeting a run an admin has just
 *     completed, writes nothing;
 *  4. the move must be one entry of the table (`canTransition`), or, only
 *     when the caller asks to step through Running, the two entries
 *     `stepsThroughRunning` names (Applications open or closed, to Running,
 *     to Completed); anything else is 400;
 *  5. a move out of draft meets the week id check (409);
 *  6. the status is written with `updatedAt`. Nothing else is written,
 *     nobody is emailed.
 *
 * The transaction is what makes the job safe to run twice at once and safe
 * beside a press: whichever commits second has read a run that changed,
 * runs again, and finds the status already there.
 */

export type StatusMoveRefusal = { ok: false; status: 400 | 404 | 409; error: string };
export type StatusMoveDone = { ok: true; status: CourseRunStatus; changed: boolean };

export const RUN_BEING_DESTROYED = "This run is being destroyed and its status can't be changed.";

function readStatus(raw: unknown): CourseRunStatus {
  return COURSE_RUN_STATUSES.includes(raw as CourseRunStatus) ? (raw as CourseRunStatus) : "draft";
}

export async function moveRunStatus(
  db: Firestore,
  runId: string,
  next: CourseRunStatus,
  options: { throughRunning?: boolean } = {},
): Promise<StatusMoveDone | StatusMoveRefusal> {
  const ref = db.collection("courseRuns").doc(runId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: "Run not found" } as const;
    const data = snap.data() ?? {};
    if (data.destroying === true) return { ok: false, status: 409, error: RUN_BEING_DESTROYED } as const;

    const current = readStatus(data.status);
    if (current === next) return { ok: true, status: current, changed: false } as const;

    const legal =
      canTransition(current, next) || (options.throughRunning === true && stepsThroughRunning(current, next) !== null);
    if (!legal) {
      return {
        ok: false,
        status: 400,
        error: `Can't move a run from "${COURSE_RUN_STATUS_LABEL[current]}" to "${COURSE_RUN_STATUS_LABEL[next]}".`,
      } as const;
    }

    // The last moment the week ids can still be reconciled. After this write
    // both the normalise route and the rules refuse, whatever the plan says.
    const blocker = draftExitBlocker(current, next, data.weekPlan);
    if (blocker) return { ok: false, status: 409, error: blocker } as const;

    tx.update(ref, { status: next, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, status: next, changed: true } as const;
  });
}
