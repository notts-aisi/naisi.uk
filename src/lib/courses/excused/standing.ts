import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { normalizeExcusedRequest, type ExcusedRequestDoc } from "@/lib/firestore/courseExcusedRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { weeksAbout } from "./model";

/**
 * WHERE A PERSON'S OWN REQUESTS TO BE EXCUSED STAND ON A SESSION, for the
 * doors that excuse somebody on their own word (a tick under "Most weeks, not
 * all", and the old instant "Can't make it"): a session with a request
 * WAITING is an admin's to decide, and one whose request was DECLINED stays
 * declined. Neither door may excuse them from it.
 *
 * One equality on `subjectUid`, read in the caller's transaction before it
 * writes anything, filtered in code to this run.
 */

/** A request about one session that keeps the person's own word off it, or null. */
export type ExcuseHold = "waiting" | "declined" | null;

/** Most of a person's own requests read: a term holds a handful. */
const MAX_OWN = 50;

/** Where a person's requests stand on one session: one waiting, else one declined (and none approved), else nothing. Pure. */
export function excuseHoldOf(requests: readonly ExcusedRequestDoc[], uid: string, sessionKey: string): ExcuseHold {
  const weeks = weeksAbout(requests, uid, sessionKey);
  if (weeks.some((each) => each.week.status === "waiting")) return "waiting";
  if (weeks.some((each) => each.week.status === "approved")) return null;
  return weeks.some((each) => each.week.status === "declined") ? "declined" : null;
}

/** The person's own requests on this run, read in `tx`, as a question per session. */
export async function excuseHoldsIn(
  tx: Transaction,
  db: Firestore,
  uid: string,
  runId: string,
): Promise<(sessionKey: string) => ExcuseHold> {
  const snap = await tx.get(db.collection(COURSE_REQUESTS_COLLECTION).where("subjectUid", "==", uid).limit(MAX_OWN));
  const requests = snap.docs
    .map((doc) => normalizeExcusedRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is ExcusedRequestDoc => each !== null && each.runId === runId && each.subjectUid === uid);
  return (sessionKey) => excuseHoldOf(requests, uid, sessionKey);
}
