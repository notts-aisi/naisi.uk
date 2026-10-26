import { getAdminDb } from "@/lib/firebase/admin";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { moveWaitingAnswers } from "@/lib/anonymousFeedback/move";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * THE ANONYMOUS FORM'S NIGHT MOVE (docs/surveys.md, "The anonymous form at a
 * programme's end"): every answer from a day that is over moves from its
 * waiting record into the record kept, which the database stamps with the
 * move's time and which holds the day and not the time
 * (`src/lib/anonymousFeedback/move.ts`). The form's page and the privacy
 * policy promise it, and may only because this job keeps it.
 *
 * IT EMAILS NOBODY, so it registers on: a promise about what is kept must not
 * wait on a switch nobody pressed. It never skips work for being late: a day's
 * answers move whenever the tick next reaches them. It logs nothing but the
 * count on its receipt.
 */

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const today = londonDateKey(ctx.now);
  const { moved, left } = await moveWaitingAnswers(db, today, { max: ctx.maxPerTick, expired: () => ctx.budget.expired() });
  return { processed: moved, hasMore: left > 0, note: moved === 0 ? "none due" : `${moved} answers` };
}

export const anonymousFeedbackMoveJob: JobRegistration = {
  id: "anonymous-feedback-move",
  label: "Anonymous answers to their day",
  description:
    "Moves each day's answers to the anonymous keep, change and drop form, once the day is over, into the record kept, which holds the day and not the time, and deletes the record each waited in. Emails nobody. Turning it off leaves each answer's time on its waiting record for as long as it is off, which breaks what the form and the privacy policy say.",
  // Answers a tick, moved a transaction of up to 200 at a time.
  maxPerTick: 2000,
  // Nothing is skipped for being late: a day's answers move whenever the tick
  // next reaches them.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe (`policyFor` floors it regardless).
  reclaimAfterMinutes: 20,
  handler: run,
};
