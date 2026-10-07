import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  SCHEDULER_RUNS_COLLECTION,
  TICK_BUCKET_MINUTES,
  normalizeSchedulerRun,
  tickBucketKey,
  tickReceiptId,
} from "@/lib/firestore/schedulerRuns";
import { INVITATION_REMINDERS_JOB_ID } from "./reminders";

/**
 * IS THE DAILY INVITATION REMINDER ACTUALLY RUNNING ON THIS COPY OF THE SITE?
 *
 * The decision-day page tells an admin that invited people "get a reminder
 * each day until they reply". That is a promise about a scheduled job, and
 * three separate things have to be true for it to hold: the job is in the
 * scheduler's list, its switch is on, and the scheduler itself is being
 * called on this copy of the site. A switch alone proves the second only.
 *
 * So the question is asked of the one thing that proves all three at once:
 * the receipt a scheduled run leaves behind. If one of the last few runs
 * lists this job and did not skip it as switched off, the reminders are
 * running. Anything else, a failed read included, is "no", and the page then
 * gives the reply-by day and says nothing about reminders.
 *
 * Reads three documents by id and writes nothing.
 */

/** How many quarter-hour runs back a receipt still counts as "running now". */
const RUNS_LOOKED_AT = 3;

export async function invitationRemindersArmed(db: Firestore, now: Date): Promise<boolean> {
  const receipts = Array.from({ length: RUNS_LOOKED_AT }, (_, back) =>
    db
      .collection(SCHEDULER_RUNS_COLLECTION)
      // Depth 0 is the run the scheduler itself started, never one a person pressed.
      .doc(tickReceiptId(tickBucketKey(new Date(now.getTime() - back * TICK_BUCKET_MINUTES * 60_000)), 0)),
  );
  try {
    const snaps = await db.getAll(...receipts);
    return snaps.some(
      (snap) =>
        snap.exists &&
        normalizeSchedulerRun(snap.id, snap.data()).jobs.some(
          (job) => job.id === INVITATION_REMINDERS_JOB_ID && job.skipped !== "disabled",
        ),
    );
  } catch {
    return false;
  }
}
