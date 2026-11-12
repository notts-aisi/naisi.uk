import { getAdminDb } from "@/lib/firebase/admin";
import { deleteClosedReasons } from "@/lib/courses/excused/tidy";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * KEEPS THE PRIVACY POLICY'S PROMISE ABOUT A REASON TO BE EXCUSED
 * (`src/lib/courses/excused/tidy.ts`): once a programme closes, the reason
 * on each request to be excused from one of its sessions is deleted, and
 * what was decided stays.
 *
 * IT EMAILS NOBODY, so it registers on, as `surveys-names-off` and
 * `event-check-ins-tidy` do: a promise to delete must not wait on a switch
 * nobody pressed. Nothing is skipped for being late: whatever is due comes
 * off whenever the tick next runs it. It logs counts, never a reason.
 */

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const done = await deleteClosedReasons(db, ctx.now);
  if (done.deleted > 0) ctx.log("reasons to be excused deleted", { deleted: done.deleted, runsClosed: done.runsClosed });
  return {
    processed: done.deleted,
    hasMore: false,
    note: done.deleted === 0 ? "none due" : `${done.deleted} reasons deleted`,
  };
}

export const excusedReasonsOffJob: JobRegistration = {
  id: "courses-excused-reasons-off",
  label: "Excused weeks: reasons off when a programme closes",
  description:
    "Deletes the reason on each request to be excused from a session once its programme has closed, keeping that the person was excused, as the privacy policy promises. Emails nobody. Turning it off breaks that promise for as long as it is off.",
  // Every due request in one pass; a quiet tick reads only requests still holding a reason.
  maxPerTick: 1,
  // Nothing is skipped for being late.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe (`policyFor` floors it regardless).
  reclaimAfterMinutes: 20,
  handler: run,
};
