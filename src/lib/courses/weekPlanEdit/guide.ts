import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { courseGuideWeekNumbers } from "@/lib/courses/facilitatorGuide/store";

/**
 * WHICH WEEK NUMBERS THE COURSE'S FACILITATOR GUIDE HOLDS SOMETHING FOR, for
 * the week plan's check (`judgeChange` in `./facts.ts`): by slot alone,
 * nothing a document says. Its own file, handed to the writer by the route,
 * so the module that writes a run's weeks (`./write.ts`) never reaches the
 * guide's store (`tests/course-facilitator-guide-guard.test.mjs`).
 */

/** How the writer is handed the guide's week numbers, read in its transaction. */
export type GuideWeeksReader = (courseId: string, tx?: Transaction) => Promise<ReadonlySet<number>>;

/** The guide's week numbers for a course; none for a run tied to no course. */
export async function guideWeeksOf(db: Firestore, courseId: string, tx?: Transaction): Promise<Set<number>> {
  return courseId ? courseGuideWeekNumbers(db, courseId, tx) : new Set<number>();
}
