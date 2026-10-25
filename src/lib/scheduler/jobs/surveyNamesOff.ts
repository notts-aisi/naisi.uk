import { getAdminDb } from "@/lib/firebase/admin";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { namesDueOff, takeNamesOffSurvey } from "@/lib/surveys/namesOff";
import { listSurveys } from "@/lib/surveys/repo";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * NAMES COME OFF CONFIDENTIAL SURVEY ANSWERS, on the day each survey says:
 * a year after its programme's last session. Each confidential survey's box
 * promises it ("Your name comes off on Thu 9 Dec 2027"), and the privacy
 * policy may promise it only because this job keeps it.
 *
 * For each survey whose day has come, every answer's person is set to null
 * (the answers stay, so the totals stay) and every row of who it was sent to
 * is deleted, then the survey is stamped so it is not visited again
 * (`src/lib/surveys/namesOff.ts`).
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
  const due = (await listSurveys(db)).filter((survey) => namesDueOff(survey, today));
  let processed = 0;
  for (const survey of due) {
    if (processed >= ctx.maxPerTick || ctx.budget.expired()) {
      return { processed, hasMore: true, note: `${due.length - processed} still to do` };
    }
    const done = await takeNamesOffSurvey(db, survey);
    ctx.log("names came off a survey", { surveyId: survey.id, answers: done.answers, people: done.people });
    processed += 1;
  }
  return { processed, hasMore: false, note: processed === 0 ? "none due" : `${processed} surveys` };
}

export const surveyNamesOffJob: JobRegistration = {
  id: "surveys-names-off",
  label: "Names off survey answers",
  description:
    "Takes people's names off confidential survey answers a year after their programme's last session, as each survey promised, and deletes who it was sent to. The answers stay in the totals. Emails nobody. Turning it off breaks that promise for as long as it is off.",
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
