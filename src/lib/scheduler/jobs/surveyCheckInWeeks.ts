import { own } from "@/lib/applications/keys";
import { listForms } from "@/lib/applications/handover/run";
import type { ApplicationForm } from "@/lib/applications/normalise";
import { namingProgrammeIn } from "@/lib/courses/programmeLead";
import { getAdminDb } from "@/lib/firebase/admin";
import { freezeWholeWeeks, readRunWeeks } from "@/lib/surveys/checkIns/weeks";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * EACH WEEK OF A PROGRAMME'S CHECK-INS IS FIXED THE FIRST TIME IT SHOWS
 * (docs/surveys.md, "Check-ins at the end of a session"). A programme's lead
 * reads the check-ins at the end of its groups' sessions a week at a time,
 * every group's together, and only once the week is whole. On each tick this
 * job looks at every run a programme names and, for each week that is whole
 * and has begun and is not fixed yet, records which check-ins the week has
 * (`freezeWholeWeeks`, `src/lib/surveys/checkIns/weeks.ts`). The lead's
 * Check-ins view and the Overview read only fixed weeks, and only the
 * check-ins each was fixed with, so a check-in opened for a week afterwards
 * (a group's session dated or moved later) never joins it. A week shows to
 * the lead from the first tick after it is whole.
 *
 * Which runs: every run exactly one programme names, on any form in any
 * state (`namingProgrammeIn`, the rule the check-in itself is opened by), and
 * whatever the run's status, so a run settled before a tick reached its last
 * week still has that week fixed. A run being destroyed is left alone
 * (`readRunWeeks`). Once every week of a run is fixed, a look at it writes
 * nothing.
 *
 * IT EMAILS NOBODY, so it registers on, as `surveys-names-off` does: a job
 * that reaches no inbox needs no owner to arm it, and while it is off a
 * programme's lead sees no new week of check-ins at all. It claims no marker:
 * each week is created once (`.create()`), so two ticks at once fix it once,
 * and a week fixed already is never changed. A run that fails to read is
 * logged and stepped over, so the other runs' weeks still show; nothing is
 * skipped for being late.
 */

/** Every run a programme on these forms names, once each, in id order. */
function namedRuns(forms: readonly ApplicationForm[]): string[] {
  const runIds = new Set<string>();
  for (const form of forms) {
    for (const programmeId of form.programmeIds) {
      const runId = own(form.programmes, programmeId)?.runId;
      if (runId) runIds.add(runId);
    }
  }
  return [...runIds].sort();
}

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const forms = await listForms(db);
  const runIds = namedRuns(forms);
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < runIds.length; index += 1) {
    if (processed >= ctx.maxPerTick || ctx.budget.expired()) {
      return { processed, hasMore: true, note: `${runIds.length - index} runs still to look at` };
    }
    const runId = runIds[index];
    const naming = namingProgrammeIn(forms, runId);
    if (!naming) continue;
    try {
      const weeks = await readRunWeeks(db, runId);
      if (!weeks) continue;
      const fixed = await freezeWholeWeeks(db, { roundId: naming.roundId, programmeId: naming.programmeId, now: ctx.now, ...weeks });
      for (const weekNumber of fixed) ctx.log("a week's check-ins were fixed", { runId, weekNumber });
      processed += fixed.length;
    } catch (err) {
      failed += 1;
      ctx.log("a run's weeks of check-ins could not be looked at", { runId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const done = processed === 0 ? "none due" : `${processed} ${processed === 1 ? "week" : "weeks"}`;
  return { processed, hasMore: false, note: failed === 0 ? done : `${done}, ${failed} ${failed === 1 ? "run" : "runs"} not looked at` };
}

export const surveyCheckInWeeksJob: JobRegistration = {
  id: "surveys-check-in-weeks",
  label: "Check-in weeks for programme leads",
  description:
    "Fixes which check-ins make up each week of a programme the first time every group's check-in that week has closed, so the programme's lead can read the week, and a check-in opened for it later stays out of it. Emails nobody. Turning it off stops new weeks of check-ins showing to programme leads until it is on again.",
  // Weeks a tick: a run has a dozen at most, and a quiet tick fixes none.
  maxPerTick: 200,
  // Nothing is skipped for being late: a week that is whole is fixed whenever
  // the tick next reaches it.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe (`policyFor` floors it regardless).
  reclaimAfterMinutes: 20,
  handler: run,
};
