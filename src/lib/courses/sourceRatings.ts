import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeCourseWeek } from "@/lib/firestore/courses";
import { RETRO_PROGRESS_LIMIT, aggregateRetrospective, type RetroProgressRow } from "@/lib/firestore/courseTemplates";

/**
 * THE SOURCES PEOPLE RATED ON A RUN'S WEEK PAGES, as totals, for the
 * programme lead's Surveys tab (board sv-programme, "Sources people rated").
 *
 * The count is the retrospective's own (`aggregateRetrospective`), so the
 * two can never disagree, and so is its floor: a source's average is shown
 * only once `RETRO_ANONYMITY_FLOOR` people have rated it. A source with fewer
 * ratings is left out here, since there is no average to rank it by.
 *
 * WHAT IS READ: the run's weeks, and its progress rows through the same
 * projection the retrospective reads (`itemId`, `rating`, `completed`), so no
 * uid, note or comment is ever read. What leaves is each source's week, title,
 * average and how many rated it: never a person.
 *
 * Who may ask is the caller's business: the page asks the programme's gate
 * (`loadProgrammeRun`) first. Every query is one equality on `runId`, so none
 * needs a declared index.
 */

export type RatedSource = {
  weekNumber: number;
  title: string;
  /** Out of 5, as the retrospective rounds it. */
  average: number;
  ratings: number;
};

export type SourceRatings = {
  /** Every source with an average, highest first. */
  rated: RatedSource[];
  /** True when the run has more progress rows than one read takes. */
  truncated: boolean;
};

export async function readSourceRatings(db: Firestore, runId: string): Promise<SourceRatings> {
  if (!runId || runId.includes("/")) return { rated: [], truncated: false };
  const [weekSnap, progressSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).collection("weeks").get(),
    // The retrospective's projection: nothing on a row names its person.
    db.collection("courseProgress").where("runId", "==", runId).select("itemId", "rating", "completed").limit(RETRO_PROGRESS_LIMIT).get(),
  ]);
  const weeks = weekSnap.docs.map((doc) => normalizeCourseWeek(doc.id, doc.data() ?? {}));
  const progress: RetroProgressRow[] = progressSnap.docs.map((doc) => {
    const raw = doc.data() ?? {};
    return {
      itemId: typeof raw.itemId === "string" ? raw.itemId : "",
      rating: typeof raw.rating === "number" ? raw.rating : null,
      completed: raw.completed === true,
    };
  });
  const rated = aggregateRetrospective({ weeks, progress, notes: [], enrolledCount: 0 })
    .flatMap((row) => (row.avgRating === null ? [] : [{ weekNumber: row.weekNumber, title: row.title, average: row.avgRating, ratings: row.ratingCount }]))
    .sort((a, b) => b.average - a.average || b.ratings - a.ratings || a.weekNumber - b.weekNumber || a.title.localeCompare(b.title, "en-GB"));
  return { rated, truncated: progressSnap.size >= RETRO_PROGRESS_LIMIT };
}
