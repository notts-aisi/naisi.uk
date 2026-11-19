import { getAdminDb } from "@/lib/firebase/admin";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { moveWaitingAnswers } from "@/lib/anonymousFeedback/move";
import { moveWaitingSocietyFeedback } from "@/lib/societyFeedback/move";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * THE ANONYMOUS FORM'S NIGHT MOVE (docs/surveys.md, "The anonymous form at a
 * programme's end"): every answer from a day that is over moves from its
 * waiting record into the record kept, which the database stamps with the
 * move's time and which holds the day and not the time
 * (`src/lib/anonymousFeedback/move.ts`). The form's page and the privacy
 * policy promise it, and may only because this job keeps it.
 *
 * IT ALSO MOVES ANONYMOUS FEEDBACK FOR THE WHOLE SOCIETY the same way
 * (`src/lib/societyFeedback/move.ts`): each finished London day's entries,
 * shuffled, into the record kept. One job, because the two promises are the
 * same promise and this job is already switched on; the two moves share the
 * tick's budget, the keep, change and drop form's first.
 *
 * IT EMAILS NOBODY, so it registers on: a promise about what is kept must not
 * wait on a switch nobody pressed. It never skips work for being late: a day's
 * answers move whenever the tick next reaches them. It logs nothing but the
 * count on its receipt.
 */

/** An error's own message, short, for the run's report. */
function errorWords(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "an unknown error";
}

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const today = londonDateKey(ctx.now);
  const expired = () => ctx.budget.expired();
  // Each half runs whatever the other did, and a failure says which half it
  // was and what the other moved, on the run's report. The message is the
  // error's own and never holds anybody's words: the moves copy fields by name.
  const failed: string[] = [];
  let answers = { moved: 0, left: 0 };
  let feedback = { moved: 0, left: 0 };
  try {
    answers = await moveWaitingAnswers(db, today, { max: ctx.maxPerTick, expired });
  } catch (err) {
    failed.push(`the keep, change and drop form's answers (${errorWords(err)})`);
  }
  try {
    feedback = await moveWaitingSocietyFeedback(db, today, { max: Math.max(0, ctx.maxPerTick - answers.moved), expired });
  } catch (err) {
    failed.push(`anonymous feedback (${errorWords(err)})`);
  }
  if (failed.length > 0) {
    throw new Error(`The move failed for ${failed.join(" and for ")}. Moved in this run: ${answers.moved} answers, ${feedback.moved} feedback.`);
  }
  const moved = answers.moved + feedback.moved;
  const hasMore = answers.left > 0 || feedback.left > 0;
  const parts = [answers.moved > 0 ? `${answers.moved} answers` : "", feedback.moved > 0 ? `${feedback.moved} feedback` : ""].filter(Boolean);
  return { processed: moved, hasMore, note: parts.length === 0 ? "none due" : parts.join(", ") };
}

export const anonymousFeedbackMoveJob: JobRegistration = {
  id: "anonymous-feedback-move",
  label: "Anonymous answers to their day",
  description:
    "Moves each day's answers to the anonymous keep, change and drop form, and each day's anonymous feedback, once the day is over, into the record kept, which holds the day and not the time, and deletes the record each waited in. Emails nobody. Turning it off leaves each answer's time on its waiting record for as long as it is off, which breaks what the two forms and the privacy policy say.",
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
