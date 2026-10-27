import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * The day groups go out, as the run stores it, by the run's address: what
 * the programme's head shows. Null for a run with no day,
 * a run that is not there, and one being destroyed.
 */
export async function readGroupsGoOut(db: Firestore, runId: string): Promise<string | null> {
  if (!runId || runId.includes("/")) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  if (data.destroying === true) return null;
  return normalizeCourseRun(snap.id, data).groupsGoOutOn;
}
