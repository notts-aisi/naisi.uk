import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * WHERE "COPY WEEKS FROM THE COURSE" CAN COPY FROM (board pr-weeks), for the
 * programme's lead and admins on the Weeks tab.
 *
 * A course holds no weeks of its own: weeks live on its runs, and a saved
 * template is applied in the run's editor (an admin's or an approver's). So
 * the weeks a run can copy are another run's of the same course, through the
 * copy route every run editor already uses (`POST .../runs/[runId]/clone-weeks`,
 * which admits the programme's lead). That route copies only weeks this run
 * does not have yet, ids and all, unless asked to overwrite, which this tab
 * never asks.
 *
 * Reads: the course's runs (one equality on `courseId`) and the ids of each
 * one's weeks, no content. No query needs a declared index.
 */

export type CopySource = {
  runId: string;
  /** "Autumn 2025", with its academic year when it has one: "Autumn 2025 (2025/26)". */
  label: string;
  /** How many week documents it holds. */
  weeks: number;
};

/** The most runs a course is read for: far more than a course has had, and a bounded read. */
const MAX_RUNS = 40;

/** The course's other runs that hold weeks, newest start first. */
export async function loadCopySources(db: Firestore, courseId: string, runId: string): Promise<CopySource[]> {
  if (!courseId) return [];
  const snap = await db.collection("courseRuns").where("courseId", "==", courseId).get();
  const runs = snap.docs
    .filter((doc) => doc.id !== runId && (doc.data() ?? {}).destroying !== true)
    .map((doc) => normalizeCourseRun(doc.id, doc.data() ?? {}))
    .filter((run) => run.courseId === courseId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id))
    .slice(0, MAX_RUNS);
  const counted = await Promise.all(
    runs.map(async (run) => {
      // Ids only: whether there is something to copy, never what it says.
      const weeks = await db.collection("courseRuns").doc(run.id).collection("weeks").select().get();
      const label = run.label.trim() || run.courseTitle.trim() || "A run with no name";
      return {
        runId: run.id,
        label: run.academicYear.trim() ? `${label} (${run.academicYear.trim()})` : label,
        weeks: weeks.docs.length,
      };
    }),
  );
  return counted.filter((source) => source.weeks > 0);
}
