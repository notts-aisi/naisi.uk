import { getAdminDb } from "@/lib/firebase/admin";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { deleteRunRatings, readRatingSheets } from "@/lib/ratings/store";
import { namesDueOff, takeNamesOffSurvey, twoYearsAfter } from "@/lib/surveys/namesOff";
import { surveysNamesDueBy } from "@/lib/surveys/repo";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * NAMES COME OFF CONFIDENTIAL SURVEY ANSWERS, on the day each survey says:
 * two years after its programme's last session. Each confidential survey's
 * box promises it ("Your name comes off on Sat 9 Dec 2028"), and the privacy
 * policy may promise it only because this job keeps it.
 *
 * For each survey whose day has come, every answer's person is set to null
 * (the answers stay, so the totals stay) and every row of who it was sent to
 * is deleted, then the survey is stamped so it is not visited again
 * (`src/lib/surveys/namesOff.ts`). Every kind is found, a check-in at the end
 * of a session included: the surveys due are read by their day
 * (`surveysNamesDueBy`, one range on `namesOffOn`), never by the list of
 * surveys, which leaves the check-ins out.
 *
 * THE RATINGS GO THE SAME DAY. The facilitators' and mentors' ratings of a
 * programme's people (`src/lib/ratings/`) are deleted two years after the
 * run's last session, the day names come off its surveys: each run with
 * ratings has a sheet holding that session's day, and once two years have
 * passed since it (`twoYearsAfter`, the one two-year rule) the run's ratings
 * and its sheet are deleted. A ratings pass runs after the surveys, within
 * the same tick's budget.
 *
 * IT EMAILS NOBODY, so it registers on: a job that changes no inbox needs no
 * owner to arm it, and a promise to take names off must not wait on a switch
 * nobody pressed. It never skips work for being late: names due off come off
 * however long the scheduler was down.
 */

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const today = londonDateKey(ctx.now);
  const due = (await surveysNamesDueBy(db, today)).filter((survey) => namesDueOff(survey, today));
  let processed = 0;
  for (const survey of due) {
    if (processed >= ctx.maxPerTick || ctx.budget.expired()) {
      return { processed, hasMore: true, note: `${due.length - processed} still to do` };
    }
    const done = await takeNamesOffSurvey(db, survey);
    ctx.log("names came off a survey", { surveyId: survey.id, answers: done.answers, people: done.people });
    processed += 1;
  }
  // The ratings two years after each run's last session.
  const sheets = (await readRatingSheets(db)).filter((sheet) => {
    const off = twoYearsAfter(sheet.lastSessionOn);
    return off !== null && off <= today;
  });
  let runs = 0;
  for (const sheet of sheets) {
    if (processed >= ctx.maxPerTick || ctx.budget.expired()) {
      return { processed, hasMore: true, note: `${sheets.length - runs} runs' ratings still to do` };
    }
    const ratings = await deleteRunRatings(db, sheet.runId);
    ctx.log("a run's ratings were deleted", { runId: sheet.runId, ratings });
    processed += 1;
    runs += 1;
  }
  const done = processed - runs;
  if (processed === 0) return { processed, hasMore: false, note: "none due" };
  return { processed, hasMore: false, note: runs === 0 ? `${done} surveys` : `${done} surveys, ${runs} runs' ratings` };
}

export const surveyNamesOffJob: JobRegistration = {
  id: "surveys-names-off",
  label: "Names off survey answers",
  description:
    "Takes people's names off confidential survey answers two years after their programme's last session, as each survey promised, and deletes who it was sent to and the ratings given at the programme's end. The answers stay in the totals. Emails nobody. Turning it off breaks that promise for as long as it is off.",
  // Surveys a tick, each a few batched writes.
  maxPerTick: 5,
  // Nothing is skipped for being late: a name due off comes off whenever the
  // tick next reaches it.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe (`policyFor` floors it regardless).
  reclaimAfterMinutes: 20,
  handler: run,
};
