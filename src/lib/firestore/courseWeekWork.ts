/**
 * `courseWeekWork/{runId}__{uid}__{weekId}`: where one person's week of a
 * course stands, as Submit and Reopen leave it. One document per person per
 * week, made the first time they submit the week.
 *
 * THE FIELDS, each written by one route:
 *  - `submittedAt`: when they last submitted the week, or null while it is
 *    not submitted (never, or reopened since). Written by Submit
 *    (`/api/courses/runs/[runId]/weeks/[weekId]/submit`), cleared by Reopen.
 *  - `firstSubmittedAt`: the first time they submitted it, stored once and
 *    never moved.
 *  - `submitCount`: how many times they have submitted it.
 *  - `reopenedAt`, `reopenedByUid`: the last time somebody running the group
 *    reopened it for them, and who
 *    (`/api/courses/runs/[runId]/weeks/[weekId]/reopen`).
 *  - `reopenCount`: how many times it has been reopened.
 *
 * Whether the week is open, submitted, locked or reopened is never stored:
 * `src/lib/courses/weekWork/model.ts` works it out from this document, the
 * group's own calendar and the time, so a session moved or cancelled moves
 * the lock with it.
 *
 * WHO READS IT: the routes and the server pages, on the Admin SDK, after
 * their own gates. `firestore.rules` refuses every browser, admins included.
 *
 * WHAT TAKES IT AWAY: deleting the person's account (by `uid`) and
 * destroying the run (by `runId`).
 *
 * Pure, with no imports, so a page in the browser can read the shape.
 */

export const COURSE_WEEK_WORK_COLLECTION = "courseWeekWork";

/**
 * The document's id. CONSTRUCT-ONLY: the parts are stored as fields, and a
 * run's id can itself hold `__`, so nothing ever splits it.
 */
export function courseWeekWorkId(runId: string, uid: string, weekId: string): string {
  return `${runId}__${uid}__${weekId}`;
}

/** The record, read. */
export type CourseWeekWorkDoc = {
  id: string;
  runId: string;
  uid: string;
  weekId: string;
  weekNumber: number;
  submittedAt: Date | null;
  firstSubmittedAt: Date | null;
  submitCount: number;
  reopenedAt: Date | null;
  reopenedByUid: string;
  reopenCount: number;
  updatedAt: Date | null;
};

type Raw = Record<string, unknown>;

function instant(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** A stored document, read. Never throws. */
export function normalizeCourseWeekWork(id: string, data: Raw): CourseWeekWorkDoc {
  return {
    id,
    runId: typeof data.runId === "string" ? data.runId : "",
    uid: typeof data.uid === "string" ? data.uid : "",
    weekId: typeof data.weekId === "string" ? data.weekId : "",
    weekNumber: count(data.weekNumber),
    submittedAt: instant(data.submittedAt),
    firstSubmittedAt: instant(data.firstSubmittedAt),
    submitCount: count(data.submitCount),
    reopenedAt: instant(data.reopenedAt),
    reopenedByUid: typeof data.reopenedByUid === "string" ? data.reopenedByUid : "",
    reopenCount: count(data.reopenCount),
    updatedAt: instant(data.updatedAt),
  };
}
