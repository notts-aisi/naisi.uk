import { londonDateKey } from "@/lib/courses/weekPlan";
import { AI_SURVEY, closesAtInstant } from "@/lib/aiSurvey/definition";
import { deleteUsedList, levelAll, peekState, sweepCodeRecords, surveyDb } from "@/lib/aiSurvey/store";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * THE AI AT NOTTINGHAM SURVEY'S TIDY-UP. Three things, each of them part of
 * what the survey's notice promises:
 *
 *  1. A PENDING CODE IS DELETED WHEN IT RUNS OUT. A code is deleted when it
 *     is used and on its fifth wrong try; this is the third way, for the code
 *     nobody typed. Yesterday's per-address counts go with them, and the
 *     minute counts older than two hours.
 *  2. THE SHARED DOCUMENTS ARE REWRITTEN TOGETHER, so that none of them
 *     carries an update time of its own. A save does this for itself while
 *     people are answering (`writePage`); this is for when they stop, so the
 *     last save of an evening does not leave its document standing out.
 *  3. THE USED-EMAIL LIST IS DELETED a set number of days after the survey
 *     closes, with every code record, and the survey's state says when.
 *     Destroying the key those hashes were made with is a person's job: the
 *     site's own account cannot delete a secret, and should not be able to.
 *
 * IT EMAILS NOBODY, so it registers on: a promise about what is deleted must
 * not wait on a switch nobody pressed. It never skips work for being late. It
 * logs nothing but the count on its receipt. Safe to run alongside itself:
 * every step is a delete or a rewrite that a second run repeats harmlessly.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function run(ctx: JobContext): Promise<JobResult> {
  const db = surveyDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  // Looked at, never made: the survey's records are made by its first visitor.
  const state = await peekState(db);
  if (!state) return { processed: 0, hasMore: false, note: "no survey yet" };

  const now = ctx.now.getTime();
  const swept = await sweepCodeRecords(db, now, londonDateKey(ctx.now), ctx.maxPerTick);
  await levelAll(db, state);

  const closedFrom = state.stage === "closed" && state.closedEarly ? state.closedEarly.toMillis() : closesAtInstant().getTime();
  const closed = state.stage === "closed" || (state.stage === "open" && now >= closedFrom);
  const due = closed && now >= closedFrom + AI_SURVEY.values.usedEmailListDays * DAY_MS;
  if (due && !state.usedListDeleted) {
    await deleteUsedList(db, state);
    return { processed: swept + 1, hasMore: false, note: "the used-email list was deleted" };
  }
  return { processed: swept, hasMore: swept >= ctx.maxPerTick, note: swept === 0 ? "nothing run out" : `${swept} records` };
}

export const aiSurveyTidyJob: JobRegistration = {
  id: "ai-survey-tidy",
  label: "The AI survey's tidy-up",
  description:
    "For the anonymous AI at Nottingham survey: deletes codes that ran out, rewrites its shared documents together so none carries a time of its own, and, a week after the survey closes, deletes its list of used email addresses. Emails nobody. Turning it off leaves run-out codes and that list in place.",
  // Codes and counts a tick, deleted in one batch.
  maxPerTick: 400,
  // Nothing is skipped for being late.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe.
  reclaimAfterMinutes: 20,
  handler: run,
};
