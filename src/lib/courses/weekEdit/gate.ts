import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import type { getCurrentUser } from "@/lib/firebase/session";
import {
  emptyWeekFields,
  normalizeCourse,
  normalizeCourseRun,
  normalizeCourseWeek,
  type CourseRunDoc,
  type CourseWeekDoc,
} from "@/lib/firestore/courses";
import { EDIT_REFUSAL } from "./words";

/**
 * WHO MAY EDIT A RUN'S WEEK IN PLACE, READ ITS HISTORY, HOLD ITS LOCK AND
 * TELL PEOPLE ABOUT A CHANGE: exactly whom the paste route admits. An admin,
 * or the lead of the programme that names the run while they stand as one
 * (`programmeLedBy`), decided from the forms before anything of the run is
 * read. Everybody else meets the same 403, so a run id says nothing. A
 * week's history names who edited it and when, which is for these two alone.
 *
 * Each route has refused a view-as session (for a write) and a missing
 * session first, then asks this.
 */

export type Actor = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** The week document id the plan uses: "w01" to "w60". */
export const WEEK_ID = /^w\d\d$/;

export type WeekGate =
  | { ok: true; runId: string; weekId: string; uid: string }
  | { ok: false; status: 400 | 403; error: string };

export async function weekEditGate(db: Firestore, actor: Actor, params: { runId: string; weekId: string }): Promise<WeekGate> {
  const { runId, weekId } = params;
  if (actor.role !== "admin" && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (!isAddressableId(runId)) return { ok: false, status: 400, error: "That isn’t a run." };
  if (!WEEK_ID.test(weekId)) return { ok: false, status: 400, error: "That isn’t a week of the run: weeks are w01 to w60." };
  return { ok: true, runId, weekId, uid: actor.uid };
}

/** The run and its week as the editing routes read them. */
export type EditWeek = {
  run: CourseRunDoc;
  weekNumber: number;
  /** The week's page, or an empty one for a week of the plan nobody has opened (`exists` false). */
  week: CourseWeekDoc;
  exists: boolean;
  /** The course's day-before time, for the paste's due line. */
  dayBeforeTime: string | null;
};

/**
 * The run and the week, or a 404 that says which is missing. A run being
 * destroyed is no run to edit: its weeks are on their way out, and a save
 * would put history back behind the cascade.
 */
export async function loadEditWeek(
  db: Firestore,
  runId: string,
  weekId: string,
): Promise<EditWeek | { status: 404; error: string }> {
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return { status: 404, error: "Run not found" };
  const raw = runSnap.data() ?? {};
  if (raw.destroying === true) return { status: 404, error: EDIT_REFUSAL.runGone };
  const run = normalizeCourseRun(runSnap.id, raw);
  const slot = run.weekPlan.find((entry) => entry.kind === "week" && entry.weekId === weekId);
  const planned = slot && slot.kind === "week" ? slot.weekNumber : null;
  const weekSnap = await db.collection("courseRuns").doc(runId).collection("weeks").doc(weekId).get();
  let week: CourseWeekDoc;
  if (weekSnap.exists) week = normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {});
  else if (planned !== null) week = normalizeCourseWeek(weekId, emptyWeekFields(planned));
  else return { status: 404, error: "That week isn’t in this run’s week plan." };
  const courseSnap = run.courseId ? await db.collection("courses").doc(run.courseId).get() : null;
  const course = courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}) : null;
  return {
    run,
    weekNumber: planned ?? week.weekNumber,
    week,
    exists: weekSnap.exists,
    dayBeforeTime: course?.dayBeforeDueTime ?? null,
  };
}
