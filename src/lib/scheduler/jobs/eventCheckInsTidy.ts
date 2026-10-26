import { getAdminDb } from "@/lib/firebase/admin";
import { tidyCheckIns } from "@/lib/events/checkIns";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * KEEPS CHECK-IN'S TWO PROMISES ON THEIR DAYS (`src/lib/events/checkIns.ts`):
 * a walk-in's email, given only for that event's survey, is deleted a week
 * after the event; and a year after an event the names come off its
 * check-ins, so what is left counts who came and names nobody. The door list
 * and the walk-in form say the first, and the privacy policy says both.
 *
 * IT EMAILS NOBODY, so it registers on, as `surveys-names-off` does: a
 * promise to delete must not wait on a switch nobody pressed. Nothing is
 * skipped for being late: whatever is due comes off whenever the tick next
 * runs it.
 */

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const done = await tidyCheckIns(db, ctx.now);
  if (done.emailsGone > 0 || done.namesOff > 0) {
    ctx.log("check-ins tidied", { emailsGone: done.emailsGone, namesOff: done.namesOff });
  }
  const processed = done.emailsGone + done.namesOff;
  return {
    processed,
    hasMore: false,
    note: processed === 0 ? "none due" : `${done.emailsGone} emails deleted, ${done.namesOff} names off`,
  };
}

export const eventCheckInsTidyJob: JobRegistration = {
  id: "event-check-ins-tidy",
  label: "Check-in: emails and names off",
  description:
    "Deletes walk-ins' emails a week after their event, and takes the names off an event's check-ins a year after it, as the door list and the privacy policy promise. The counts stay. Emails nobody. Turning it off breaks those promises for as long as it is off.",
  // Every due record in one pass, in batches; a quiet day reads nothing.
  maxPerTick: 1,
  // Nothing is skipped for being late.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe (`policyFor` floors it regardless).
  reclaimAfterMinutes: 20,
  handler: run,
};
