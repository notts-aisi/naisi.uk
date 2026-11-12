import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { normalizeExcusedRequest, type ExcusedRequestDoc } from "@/lib/firestore/courseExcusedRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { runClosesAt } from "./ask";

/**
 * THE PRIVACY POLICY'S PROMISE ABOUT A REASON TO BE EXCUSED (version 17, "How
 * long we keep it"): "A reason you give when you ask to be excused from a
 * session: until your programme closes. After that we keep only that you
 * were excused."
 *
 * WHAT IT DELETES. Once a run has closed (`workClosesAt`, the one moment
 * every week of the run shuts, asked through `runClosesAt`), the `reason` of
 * every excused request of that run: decided, withdrawn, and one still
 * waiting too, because the promise has no exception. Everything else stays:
 * the weeks, what was decided, by whom, when and the reply, and what
 * approving did to the register. `reasonHeld` goes to false and
 * `reasonGoneAt` says when.
 *
 * HOW IT FINDS THEM. One equality, `reasonHeld == true`: only requests still
 * holding a reason, so a quiet tick reads the open term's handful and a term
 * long closed reads nothing. Then each of their runs once, and that run's
 * groups once (one equality on `runId`).
 *
 * SAFE TWICE. A request whose reason is gone no longer matches the read, so a
 * second run finds nothing. A run with no close moment (no session to date)
 * is left alone, as is a run that is gone.
 *
 * It returns counts, and its caller logs counts: never a reason.
 */

/** Most requests one pass reads: a term holds tens of these. */
const MAX_PER_PASS = 500;

export type ReasonsOff = { deleted: number; runsClosed: number; runsOpen: number };

export async function deleteClosedReasons(db: Firestore, now: Date): Promise<ReasonsOff> {
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).where("reasonHeld", "==", true).limit(MAX_PER_PASS).get();
  const byRun = new Map<string, ExcusedRequestDoc[]>();
  for (const doc of snap.docs) {
    const request = normalizeExcusedRequest(doc.id, doc.data() ?? {});
    if (!request || !request.runId) continue;
    byRun.set(request.runId, [...(byRun.get(request.runId) ?? []), request]);
  }
  const done: ReasonsOff = { deleted: 0, runsClosed: 0, runsOpen: 0 };
  for (const [runId, requests] of byRun) {
    if (runId.includes("/")) continue;
    const runSnap = await db.collection("courseRuns").doc(runId).get();
    if (!runSnap.exists) continue;
    const closesAt = await runClosesAt(db, normalizeCourseRun(runSnap.id, runSnap.data() ?? {}));
    if (!closesAt || now.getTime() < closesAt.getTime()) {
      done.runsOpen += 1;
      continue;
    }
    done.runsClosed += 1;
    for (const request of requests) {
      await db.collection(COURSE_REQUESTS_COLLECTION).doc(request.id).update({
        reason: FieldValue.delete(),
        reasonHeld: false,
        reasonGoneAt: now,
      });
      done.deleted += 1;
    }
  }
  return done;
}
