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
 * READ BY PERSON AND RUN, and only the requests that still bear on a week:
 * `subjectUid`, `runId` and `status` in waiting, approved or declined, three
 * equalities, which Firestore serves by merging the automatic single-field
 * indexes, so no declared index is needed (tests/firestore-indexes.test.mjs
 * holds that). A request whose every week was withdrawn bears on nothing and
 * is never read; the rest each need a waiting week (one per session at most)
 * or an admin's decision, so one person's on one run never come near the
 * limit, however often they ask and withdraw. Read in the caller's
 * transaction before it writes anything.
 */

/** A request about one session that keeps the person's own word off it, or null. */
export type ExcuseHold = "waiting" | "declined" | null;

/**
 * Most requests read that still bear on a week, for one person on one run:
 * each is a waiting week (one per session at most) or an admin's decision.
 */
const MAX_BEARING = 200;

/** The statuses of a request that still bears on a week. A withdrawn one bears on none. */
const BEARING = ["waiting", "approved", "declined"];

/** One person's requests on one run that still bear on a week, read in `tx` (or outside one). */
export async function standingRequestsIn(tx: Transaction | null, db: Firestore, uid: string, runId: string): Promise<ExcusedRequestDoc[]> {
  const query = db
    .collection(COURSE_REQUESTS_COLLECTION)
    .where("subjectUid", "==", uid)
    .where("runId", "==", runId)
    .where("status", "in", BEARING)
    .limit(MAX_BEARING);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs
    .map((doc) => normalizeExcusedRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is ExcusedRequestDoc => each !== null && each.runId === runId && each.subjectUid === uid);
}

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
  const requests = await standingRequestsIn(tx, db, uid, runId);
  return (sessionKey) => excuseHoldOf(requests, uid, sessionKey);
}
