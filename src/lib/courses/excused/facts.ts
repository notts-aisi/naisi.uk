import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { normalizeExcusedRequest, type ExcusedRequestDoc } from "@/lib/firestore/courseExcusedRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { factOf, weeksAbout } from "./model";
import type { ExcuseFact } from "./words";

/**
 * WHAT EVERYBODY WHO READS A GROUP'S REGISTER IS TOLD ABOUT REQUESTS TO BE
 * EXCUSED: for each person and each session, one of two facts, "asked to be
 * excused, waiting" or "excused", and nothing else. Never the reason, never
 * how often, never who decided, when or the reply: the answer's type has no
 * field that could carry one.
 *
 * Read by the register's GET (its facilitators, the people leading the
 * programme and admins; somebody given a session is sent "excused" for that
 * session's column alone, never "waiting") and by the group's page (the
 * programme's lead and admins). One equality on `groupId`, filtered in code
 * to this run, these people and these sessions: a term holds tens of these,
 * and no list needs a declared index.
 */

/** `sessionKey -> uid -> fact`, rows and sessions asked about only. */
export type ExcuseFacts = Record<string, Record<string, ExcuseFact>>;

/** Most requests read for one group. */
const MAX_REQUESTS = 300;

/** The group's excused requests on this run: one equality on `groupId`. */
export async function groupExcusedRequests(db: Firestore, runId: string, groupId: string): Promise<ExcusedRequestDoc[]> {
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).where("groupId", "==", groupId).limit(MAX_REQUESTS).get();
  return snap.docs
    .map((doc) => normalizeExcusedRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is ExcusedRequestDoc => each !== null && each.runId === runId && each.groupId === groupId);
}

/** The facts for these people on these sessions, from requests already read. Pure. */
export function excuseFactsFrom(
  requests: readonly ExcusedRequestDoc[],
  input: { uids: ReadonlySet<string>; sessionKeys: readonly string[] },
): ExcuseFacts {
  const out: ExcuseFacts = {};
  const subjects = new Set(requests.map((request) => request.subjectUid).filter((uid) => input.uids.has(uid)));
  for (const sessionKey of input.sessionKeys) {
    for (const uid of subjects) {
      const fact = factOf(weeksAbout(requests, uid, sessionKey));
      if (fact) (out[sessionKey] ??= {})[uid] = fact;
    }
  }
  return out;
}

/** The facts for a group's register or page: one read, then `excuseFactsFrom`. */
export async function excuseFactsForGroup(
  db: Firestore,
  input: { runId: string; groupId: string; uids: ReadonlySet<string>; sessionKeys: readonly string[] },
): Promise<ExcuseFacts> {
  if (input.uids.size === 0 || input.sessionKeys.length === 0) return {};
  const requests = await groupExcusedRequests(db, input.runId, input.groupId);
  return excuseFactsFrom(requests, input);
}
