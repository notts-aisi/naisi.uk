import "server-only";
import type { Firestore, Query, Transaction } from "firebase-admin/firestore";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, normalizeCourseWeek, type CourseRunDoc, type CourseWeekDoc } from "@/lib/firestore/courses";

/**
 * IS A RUN'S WEEK IN USE, SO THAT IT STAYS PUBLISHED?
 *
 * The rule, the owner's: a week stays published once anybody has ticked or
 * written in it, or its session has passed. The site records no opening of
 * a page and does not start to, so what is asked is what is stored:
 *
 *  - WORK. Any `courseProgress` row of this run and week (a tick, a rating,
 *    a comment or a note on one of its sources or checklist items), or any
 *    `courseExerciseResponses` row of this run and week (a written answer, a
 *    reflection, a fill-in box). A progress row stores the number its week id
 *    names ("w03" is 3), never the plan's label, which is what the tick route
 *    and the exercise routes write; a response row stores the week id itself.
 *    Both are count queries on equality filters, so neither reads anybody's
 *    row and neither needs a declared index.
 *  - A SESSION THAT HAS PASSED. Any group of the run that is not archived
 *    whose session for this week, on its own calendar, has ended.
 *
 * That is the whole rule. Week 1 open early to everybody holding a place
 * (`src/lib/courses/weekOne/door.ts`) answers it as any other week: with
 * nobody having ticked or written in it and no session of it passed, it may
 * be taken back.
 *
 * `tx` given, every read is the transaction's, so the unpublish route's check
 * and its write are one unit: a tick that lands first is counted, and one
 * that lands after the commit is on a week nobody can open. Without it, the
 * older week page asks the same question to say so before the press.
 */

export type WeekInUse = "work" | "met";

export type WeekInUseFacts = {
  run: CourseRunDoc;
  week: CourseWeekDoc;
  /** The week's number as its run's plan says it, for the sentence. */
  weekNumber: number;
  inUse: WeekInUse | null;
};

/** The number a week document id names: "w03" is 3. Null for anything else. */
export function weekIdNumber(weekId: string): number | null {
  const match = /^w(\d\d)$/.exec(weekId);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 60 ? n : null;
}

/** Bound on the groups read: the run gate's own. */
const MAX_GROUPS = 50;

/**
 * The run, the week and whether the week is in use. Null when the run or the
 * week is not there (or the run is being destroyed).
 */
export async function readWeekInUse(
  db: Firestore,
  args: { runId: string; weekId: string; now: Date },
  tx?: Transaction,
): Promise<WeekInUseFacts | null> {
  const { runId, weekId, now } = args;
  const idNumber = weekIdNumber(weekId);
  if (idNumber === null) return null;
  const runRef = db.collection("courseRuns").doc(runId);
  const weekRef = runRef.collection("weeks").doc(weekId);
  const progress = db.collection("courseProgress").where("runId", "==", runId).where("weekNumber", "==", idNumber).count();
  const responses = db.collection("courseExerciseResponses").where("runId", "==", runId).where("weekId", "==", weekId).count();
  const groups: Query = db.collection("courseGroups").where("runId", "==", runId).limit(MAX_GROUPS);

  const [runSnap, weekSnap, progressAgg, responseAgg, groupSnap] = await Promise.all([
    tx ? tx.get(runRef) : runRef.get(),
    tx ? tx.get(weekRef) : weekRef.get(),
    tx ? tx.get(progress) : progress.get(),
    tx ? tx.get(responses) : responses.get(),
    tx ? tx.get(groups) : groups.get(),
  ]);
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true || !weekSnap.exists) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const week = normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {});
  const slot = run.weekPlan.find((entry) => entry.kind === "week" && entry.weekId === weekId);
  const weekNumber = slot && slot.kind === "week" ? slot.weekNumber : idNumber;

  let inUse: WeekInUse | null = null;
  if (progressAgg.data().count > 0 || responseAgg.data().count > 0) inUse = "work";
  if (inUse === null) {
    const met = groupSnap.docs
      .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
      .filter((group) => !group.archived)
      .some((group) =>
        resolveSessions(run, group).some((session) => {
          if (session.weekId !== weekId) return false;
          const { endsAt } = sessionInstants(session);
          return endsAt !== null && endsAt.getTime() <= now.getTime();
        }),
      );
    if (met) inUse = "met";
  }
  return { run, week, weekNumber, inUse };
}
