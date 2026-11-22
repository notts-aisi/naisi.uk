import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";

/**
 * HAS ANYBODY STARTED THIS RUN? Any `courseProgress` or
 * `courseExerciseResponses` row carrying its id: a tick, a rating, a
 * comment, a written answer, a reflection or a fill-in box, on any week.
 * The meaning the copy from a saved template has always refused a replace
 * on (`apply-template`), now shared with the copy from another run.
 *
 * Two count queries on `runId`, served by its automatic index, so nobody's
 * row is read. `tx` given, both are the transaction's, which holds what they
 * match until it commits: a tick racing the copy is either counted or lands
 * on the new weeks.
 */
export async function runStarted(db: Firestore, runId: string, tx?: Transaction): Promise<boolean> {
  const progress = db.collection("courseProgress").where("runId", "==", runId).count();
  const responses = db.collection("courseExerciseResponses").where("runId", "==", runId).count();
  const [progressAgg, responseAgg] = await Promise.all([
    tx ? tx.get(progress) : progress.get(),
    tx ? tx.get(responses) : responses.get(),
  ]);
  return progressAgg.data().count > 0 || responseAgg.data().count > 0;
}
