import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeMoveRequest, type MoveRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { placeTakesMove, runMoveRefusal } from "../staffMove/plan";

/**
 * WHERE A REQUEST TO CHANGE GROUP FOR GOOD STANDS NOW, worked out at read
 * time from the run and the person's place as they are, never stored. Every
 * reader asks this one function (the card, "Your requests", the Requests
 * page and its counts, one request's page, and every route), so they can
 * never say different things.
 *
 * A stored `waiting` request is GONE, quietly closed (off every list, nobody
 * emailed, no write), in every state in which no move could ever approve it:
 *  - `over`: the run no longer takes a move (over, archived, or being
 *    destroyed);
 *  - `place`: the person no longer holds an active learner's place on the
 *    run (taken off, or left), or holds one the staff move would not move
 *    (`placeTakesMove`: a seat Publish has not told, or they now facilitate
 *    a group of the run that still meets);
 *  - `moved`: their place has been moved since they asked (its group, or
 *    its record of groups by week, reads otherwise: a staff move, a move on
 *    the allocation board, or the move its own approval made);
 *  - `group`: the group they asked from, or the group they asked for, no
 *    longer meets (archived, or gone), named by `groupId`.
 *  - WAITING otherwise. A move has no session to wait for: the week it would
 *    be made from is the staff move's own rule at the press.
 *
 * A request that has left `waiting` is what it says.
 */

/** Most requests one person has made on one run: a term holds a handful. */
const MAX_OWN = 200;

/**
 * The place's record of groups by week as one string, the form a request
 * keeps of it when it is asked (`change.recordAsked`): "" for a place that
 * has never been moved.
 */
export function placeRecordKey(place: Pick<CourseEnrolmentDoc, "groupsByWeek">): string {
  const record = place.groupsByWeek ?? [];
  return record.length === 0 ? "" : record.map((entry) => `${entry.groupId}@${entry.fromWeek}`).join(",");
}

export type MoveRequestStanding =
  | { state: "waiting" }
  | { state: "gone"; why: "over" | "place" | "moved" }
  | { state: "gone"; why: "group"; groupId: string }
  | { state: "approved" | "declined" | "withdrawn" };

export function moveRequestStandingOf(input: {
  request: Pick<MoveRequestDoc, "status" | "groupId" | "runId" | "subjectUid" | "change">;
  run: Pick<CourseRunDoc, "id" | "status" | "archived"> | null;
  /** The run carries the destroy marker. */
  destroying: boolean;
  /** Every group of the run, archived ones included. */
  groups: readonly Pick<CourseGroupDoc, "id" | "runId" | "archived" | "facilitatorUids">[];
  /** The person's place on the run, or null with none. */
  place: Pick<CourseEnrolmentDoc, "uid" | "runId" | "role" | "status" | "groupId" | "groupsByWeek" | "selfEnrolled" | "allocatedEmailAt"> | null;
}): MoveRequestStanding {
  const { request, run, place } = input;
  if (request.status !== "waiting") return { state: request.status };
  if (!run || run.id !== request.runId || runMoveRefusal(run, input.destroying) !== null) return { state: "gone", why: "over" };
  if (!place || place.runId !== run.id || place.uid !== request.subjectUid || place.role !== "learner" || place.status !== "active" || !place.groupId) {
    return { state: "gone", why: "place" };
  }
  if (place.groupId !== request.groupId || placeRecordKey(place) !== request.change.recordAsked) return { state: "gone", why: "moved" };
  const groups = input.groups.filter((group) => group.runId === run.id);
  for (const id of [request.groupId, request.change.toGroupId]) {
    const group = groups.find((each) => each.id === id);
    if (!group || group.archived) return { state: "gone", why: "group", groupId: id };
  }
  if (!placeTakesMove(place, groups.filter((group) => !group.archived))) return { state: "gone", why: "place" };
  return { state: "waiting" };
}

/**
 * This person's move requests on this run, newest first: two equalities
 * (`subjectUid`, `runId`), served by merging the automatic single-field
 * indexes, so no declared index. Read through the move kind's own normaliser,
 * so no other kind is ever counted or listed here.
 */
export async function ownMoveRequestsIn(tx: Transaction | null, db: Firestore, uid: string, runId: string): Promise<MoveRequestDoc[]> {
  if (!runId) return [];
  const query = db.collection(COURSE_REQUESTS_COLLECTION).where("subjectUid", "==", uid).where("runId", "==", runId).limit(MAX_OWN);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs
    .map((doc) => normalizeMoveRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is MoveRequestDoc => each !== null && each.runId === runId && each.subjectUid === uid)
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
}

/** Each of these move requests, by id, as it stands now on these facts. */
export function moveStandingsOf(facts: {
  run: CourseRunDoc;
  destroying: boolean;
  groups: readonly CourseGroupDoc[];
  place: CourseEnrolmentDoc | null;
  moveRequests: readonly MoveRequestDoc[];
}): Map<string, MoveRequestStanding> {
  const out = new Map<string, MoveRequestStanding>();
  for (const request of facts.moveRequests) {
    out.set(request.id, moveRequestStandingOf({ request, run: facts.run, destroying: facts.destroying, groups: facts.groups, place: facts.place }));
  }
  return out;
}
