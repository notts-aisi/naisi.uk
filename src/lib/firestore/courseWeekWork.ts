/**
 * `courseWeekWork/{runId}__{uid}__{weekId}`: what is kept of one person's
 * week of a course beside their work: when they pressed the week's old
 * Submit, the reopens of the time when weeks locked, and which version of
 * each written answer feedback or a rating was last about. One document per
 * person per week, made the first time any of those is written.
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
 *  - `reviewedVersions`: written answer block id to the mark (`savedAt`) of
 *    the version of it that feedback or a rating was last about, written by
 *    the feedback and ratings routes (`src/lib/courses/weekWork/versions.ts`).
 *    The routes that save the answer read it in their own transaction, so the
 *    first change after a review keeps the reviewed words with no query. Kept
 *    here, on a record no browser reads, and never on the answer's own row,
 *    which its writer can read: a rating's existence never reaches them.
 *
 * WEEKS NO LONGER LOCK (the week stays open): nothing reopens a week now, and
 * `submittedAt` is written only by the old Submit route, kept for a page open
 * since before. The reopen facts already stored stay as they are and change
 * nothing. Where the week stands is never stored:
 * `src/lib/courses/weekWork/model.ts` works it out from the group's own
 * calendar, the run's close and the time.
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
  /** Written answer block id to the mark of the version feedback or a rating was last about. */
  reviewedVersions: Record<string, Date>;
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

function marks(value: unknown): Record<string, Date> {
  const out: Record<string, Date> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [id, stamp] of Object.entries(value as Raw)) {
    const at = instant(stamp);
    if (at) out[id] = at;
  }
  return out;
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
    reviewedVersions: marks(data.reviewedVersions),
    updatedAt: instant(data.updatedAt),
  };
}
