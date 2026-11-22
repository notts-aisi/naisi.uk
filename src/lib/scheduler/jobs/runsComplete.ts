import type { Firestore } from "firebase-admin/firestore";
import { moveRunStatus } from "@/lib/courses/runStatusMove";
import { workClosesAt } from "@/lib/courses/weekWork/closes";
import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunStatus } from "@/lib/firestore/courses";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * A RUN COMPLETES BY ITSELF WHEN ITS WORK CLOSES: the end of the London day
 * N days after its last session (`workClosesAt`, N the run's own
 * `workClosesAfterDays`, 14 when it says none). Never at the end of the last
 * session: until work closes the last week's register reminder, the
 * unmarked-register card, the check-in reminder, each facilitator's My
 * programmes and people's Home all still need the run to be live, and a
 * completed run drops out of every one of them.
 *
 * WHICH RUNS. Every run whose stored status is one of the three every course
 * job treats as live (Applications open, Applications closed, Running: one
 * `in` on one field, so no declared index), not archived and not being
 * destroyed, whose live groups date a last session, and whose work has
 * closed by the tick's `now`. A run with no session dated never completes by
 * the clock. A draft, a completed run and a cancelled one are never read.
 *
 * WHAT IT WRITES. The run's status, to Completed, through the one checked
 * path the status route takes (`moveRunStatus`, in a transaction), stepping
 * through Running from either application stage, as "Mark it completed now"
 * does. Nothing else: no email, no new field. Once: a completed run no
 * longer matches the read, and two ticks at once meet the transaction, whose
 * second commit finds the status already there and writes nothing. Its
 * record is the tick's receipt (how many, in the note) and one log line per
 * run it completed, by id.
 *
 * IT SHIPS SWITCHED OFF (`enabledByDefault: false`), and while it is off the
 * tick never calls it, so it reads nothing. A programme's Settings reads the
 * same switch (`RUNS_COMPLETE_JOB` in `../registerJobs.ts`, the id and the
 * default restated, held equal to these by a test) to say whether a run completes by itself
 * or waits for an admin.
 */

/** The statuses every course job treats as a live cohort. An allowlist, so a status added later fails closed. */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

/** Live runs one pass will consider. Far above anything planned; logged when hit. */
const MAX_CANDIDATE_RUNS = 200;

/** Groups read per run, archived ones included: runs have single-figure group counts. */
const MAX_GROUPS = 100;

/** When this run's work closes, from its own groups, or null with no session dated. */
async function closesAt(db: Firestore, run: ReturnType<typeof normalizeCourseRun>): Promise<Date | null> {
  const snap = await db.collection("courseGroups").where("runId", "==", run.id).limit(MAX_GROUPS).get();
  return workClosesAt(
    run,
    snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})),
  );
}

async function run(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const snap = await db.collection("courseRuns").where("status", "in", LIVE_STATUSES).limit(MAX_CANDIDATE_RUNS).get();
  if (snap.docs.length >= MAX_CANDIDATE_RUNS) ctx.log("live runs read up to the limit", { limit: MAX_CANDIDATE_RUNS });
  const runs = snap.docs
    .filter((doc) => doc.data()?.destroying !== true)
    .map((doc) => normalizeCourseRun(doc.id, doc.data() ?? {}))
    .filter((read) => !read.archived && LIVE_STATUSES.includes(read.status))
    .sort((a, b) => a.id.localeCompare(b.id));

  let processed = 0;
  let failed = 0;
  for (let index = 0; index < runs.length; index += 1) {
    if (processed >= ctx.maxPerTick || ctx.budget.expired()) {
      return { processed, hasMore: true, note: `${runs.length - index} runs still to look at` };
    }
    const live = runs[index];
    try {
      const closes = await closesAt(db, live);
      if (!closes || ctx.now.getTime() < closes.getTime()) continue;
      const moved = await moveRunStatus(db, live.id, "completed", { throughRunning: live.status !== "running" });
      if (!moved.ok) {
        failed += 1;
        ctx.log("a run whose work closed could not be completed", { runId: live.id, error: moved.error });
        continue;
      }
      if (!moved.changed) continue;
      processed += 1;
      ctx.log("a run was completed when its work closed", { runId: live.id, from: live.status });
    } catch (err) {
      failed += 1;
      ctx.log("a run could not be looked at", { runId: live.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const done = processed === 0 ? "none due" : `${processed} ${processed === 1 ? "run" : "runs"} completed`;
  return { processed, hasMore: false, note: failed === 0 ? done : `${done}, ${failed} ${failed === 1 ? "run" : "runs"} not completed` };
}

export const runsCompleteJob: JobRegistration = {
  id: "courses-runs-complete",
  label: "Course runs: completed when work closes",
  description:
    "Moves each live course run to Completed once its work has closed, 14 days after its last session unless the run says otherwise. Its emails and reminders then stop, its groups leave each facilitator's My programmes and it leaves people's Home. Emails nobody. While it is off, a run stays live until an admin marks it completed.",
  // Runs a tick: a term has a handful, and a quiet tick completes none.
  maxPerTick: 50,
  // Nothing is skipped for being late: a run whose work has closed is
  // completed whenever the tick next reaches it.
  maxLateHours: 0,
  // This job claims no marker, so nothing reads this number; the default
  // keeps a copied value safe (`policyFor` floors it regardless).
  reclaimAfterMinutes: 20,
  // It stops emails and takes runs off people's Home: an admin arms it.
  enabledByDefault: false,
  handler: run,
};
