import "server-only";
import type { Firestore } from "firebase-admin/firestore";

/**
 * WHICH WEEK OF A RUN IS PITCHING WEEK, read on its own so that a page which
 * only needs to know (the Groups tab's views, the run home) reads one query
 * and imports nothing else of pitching week.
 *
 * The run's pitching week is the lowest-numbered week document ticked as one
 * (`CourseWeekDoc.pitching`, set in the week editor). Week N is the document
 * `weekDocId(N)`, the one every member surface reads for week N.
 */

export type PitchingWeek = {
  weekNumber: number;
  /** `weekDocId(weekNumber)`, the document every member surface reads. */
  weekId: string;
  published: boolean;
};

/** "w01" to "w60". */
const WEEK_ID = /^w(\d{2})$/;

/** The run's pitching week: the lowest-numbered week document ticked as one, or null. */
export async function readPitchingWeek(db: Firestore, runId: string): Promise<PitchingWeek | null> {
  // One equality on one field of the run's own weeks, so no declared index.
  const snap = await db.collection("courseRuns").doc(runId).collection("weeks").where("pitching", "==", true).get();
  let found: PitchingWeek | null = null;
  for (const doc of snap.docs) {
    const match = WEEK_ID.exec(doc.id);
    const data = doc.data() ?? {};
    if (!match || data.pitching !== true) continue;
    const weekNumber = Number(match[1]);
    if (weekNumber < 1 || weekNumber > 60) continue;
    if (!found || weekNumber < found.weekNumber) {
      found = { weekNumber, weekId: doc.id, published: data.published === true };
    }
  }
  return found;
}

