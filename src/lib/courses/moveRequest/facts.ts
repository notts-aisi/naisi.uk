import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { campusLabel } from "@/lib/courses/campus";
import { MAX_OWN } from "@/lib/courses/excused/ask";
import { firstNameOfUser, readNamingProgramme } from "@/lib/courses/programmeLead";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  normalizeMoveRequest,
  normalizeVisitRequest,
  type MoveRequestDoc,
  type VisitRequestDoc,
} from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { moveWeekFor, placeTakesMove, readNotHeld, runMoveRefusal } from "../staffMove/plan";
import type { Reader } from "../visit/plan";
import { visitRequestStandingRead, type VisitRequestStanding } from "../visitRequest/standing";
import { moveStandingsOf, type MoveRequestStanding } from "./standing";
import { groupChoiceDetailWords, groupChoiceTitleWords } from "./words";

/**
 * WHAT A PERSON'S OWN REQUEST TO CHANGE GROUP FOR GOOD IS ASKED FROM: their
 * place on the run, the run's groups, and their own requests of the two kinds
 * that change where they go, each with where it stands now. Read the same way
 * for the card, the form's page and the ask's transaction (`reader`: the
 * database, or the transaction), so the three can never disagree.
 *
 * WHO CAN ASK AT ALL is who the staff move could move (`placeTakesMove` and
 * `runMoveRefusal`, the staff move's own predicates): an active learner's
 * place in a group that still meets, told by Publish, of somebody who
 * facilitates no group of the run that still meets, on a run that takes a
 * move, with more than one live group and no incubator. Anybody else is
 * answered `none`, whatever the reason: no answer says a run exists.
 *
 * WHICH GROUPS ARE OFFERED ("Groups with a place", `groupsWithAPlace`): every
 * other group of the run that still meets, by the staff move's own count of
 * places (its capacity less its people now; no limit, no number), the full
 * ones left out, in the order of their usual meeting, Monday first. The week
 * is never asked: it is the staff move's rule at the approval's press.
 */

export type ChangeFacts = {
  run: CourseRunDoc;
  destroying: boolean;
  /** Every group of the run, archived ones included. */
  groups: CourseGroupDoc[];
  place: CourseEnrolmentDoc;
  /** The group they are in now. */
  from: CourseGroupDoc;
  /** The facilitators' first names, by uid, when asked for; empty otherwise. */
  firstNames: Map<string, string>;
  visitRequests: VisitRequestDoc[];
  moveRequests: MoveRequestDoc[];
  visitStandings: Map<string, VisitRequestStanding>;
  moveStandings: Map<string, MoveRequestStanding>;
  /**
   * The staff move's week rule can give a week at all: false when their
   * group has no session with a time, or none still to come, so no move
   * could ever be approved and nothing is offered.
   */
  movable: boolean;
};

/** One group offered, as the form draws it. `why` is the line under it, filled by the form's page (`changeGroupPageFor`); null here. */
export type ChangeGroupChoice = { groupId: string; name: string; words: string; detail: string; why: string | null };

export async function readChangeFacts(
  reader: Reader,
  db: Firestore,
  runId: string,
  uid: string,
  now: Date,
  opts: { names: boolean },
): Promise<{ ok: true; facts: ChangeFacts } | { ok: false }> {
  const none = { ok: false } as const;
  if (!runId || runId.includes("/") || !uid || uid.includes("/")) return none;
  const [[runSnap, placeSnap], groupSnap, requestSnap] = await Promise.all([
    reader.getAll([db.collection("courseRuns").doc(runId), db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid))]),
    reader.query(db.collection("courseGroups").where("runId", "==", runId)),
    reader.query(db.collection(COURSE_REQUESTS_COLLECTION).where("subjectUid", "==", uid).where("runId", "==", runId).limit(MAX_OWN)),
  ]);
  const place = placeSnap?.exists ? normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {}) : null;
  if (!place || place.runId !== runId || place.uid !== uid || !runSnap?.exists) return none;
  // A seat Publish has not told them about takes no part: nothing is offered and an ask is refused.
  if (!placementIsTold(place)) return none;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const destroying = (runSnap.data() ?? {}).destroying === true;
  if (runMoveRefusal(run, destroying) !== null) return none;
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === run.id);
  const live = groups.filter((group) => !group.archived);
  if (live.length < 2 || !placeTakesMove(place, live)) return none;
  const from = live.find((group) => group.id === place.groupId) ?? null;
  if (!from) return none;
  const naming = await readNamingProgramme(db, run.id);
  if (naming?.kind === "incubator") return none;

  const get = async (ref: DocumentReference): Promise<DocumentSnapshot> => (await reader.getAll([ref]))[0];
  const visitRequests = requestSnap.docs
    .map((doc) => normalizeVisitRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is VisitRequestDoc => each !== null && each.runId === run.id && each.subjectUid === uid);
  const moveRequests = requestSnap.docs
    .map((doc) => normalizeMoveRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is MoveRequestDoc => each !== null && each.runId === run.id && each.subjectUid === uid)
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
  // A visit request's standing reads its host's register that week, as every reader of that kind reads it.
  const visitStandings = new Map<string, VisitRequestStanding>();
  for (const request of visitRequests) {
    visitStandings.set(request.id, await visitRequestStandingRead(get, db, { request, run, groups, place, now }));
  }
  const moveStandings = moveStandingsOf({ run, destroying, groups, place, moveRequests });

  // The staff move's week rule, against any other live group: its two
  // refusals that are about their own group alone say no move could be made.
  const other = live.find((group) => group.id !== from.id) ?? null;
  const notHeld = await readNotHeld((refs) => reader.getAll(refs), db, run, place, groups, now);
  const week = other ? moveWeekFor(run, place, groups, other, now, notHeld) : null;
  const movable = week !== null && (week.ok || (week.refusal.kind !== "old-has-none-set" && week.refusal.kind !== "old-has-none-left"));

  const firstNames = new Map<string, string>();
  if (opts.names) {
    const uids = [...new Set(live.filter((group) => group.id !== from.id).flatMap((group) => group.facilitatorUids))].filter((each) => each && !each.includes("/") && each !== uid);
    const snaps = await reader.getAll(uids.map((each) => db.collection("users").doc(each)));
    for (const snap of snaps) if (snap.exists) firstNames.set(snap.id, firstNameOfUser(snap.data() ?? {}));
  }
  return { ok: true, facts: { run, destroying, groups, place, from, firstNames, visitRequests, moveRequests, visitStandings, moveStandings, movable } };
}

/** The staff move's own count of places in a group now: its capacity less its people; null with no limit. */
export function placesLeftNow(group: Pick<CourseGroupDoc, "capacity" | "memberCount">): number | null {
  return group.capacity === null ? null : group.capacity - group.memberCount;
}

/** Every other group that still meets, with whether it is full now (the staff move's own `targetOf` rule). */
function otherLiveGroups(facts: Pick<ChangeFacts, "groups" | "from">): Array<{ group: CourseGroupDoc; full: boolean }> {
  return facts.groups
    .filter((group) => !group.archived && group.id !== facts.from.id)
    .sort(compareGroupsByMeeting)
    .map((group) => {
      const left = placesLeftNow(group);
      return { group, full: left !== null && left <= 0 };
    });
}

/** "Groups with a place": the groups the form offers, full ones left out. */
export function groupsWithAPlace(facts: Pick<ChangeFacts, "groups" | "from" | "firstNames">): ChangeGroupChoice[] {
  return otherLiveGroups(facts)
    .filter((each) => !each.full)
    .map(({ group }) => ({
      groupId: group.id,
      name: group.name.trim() || "Untitled group",
      words: groupChoiceTitleWords(group.name, group.session),
      detail: groupChoiceDetailWords({
        campus: campusLabel(group.campus),
        room: group.session.location ?? "",
        facilitatorFirstNames: group.facilitatorUids.map((each) => facts.firstNames.get(each) ?? "").filter(Boolean),
        placesLeft: placesLeftNow(group),
      }),
      why: null,
    }));
}

/** What an ask for `toGroupId` would meet now: offered, full, or not offered at all. */
export function choiceStateOf(facts: Pick<ChangeFacts, "groups" | "from">, toGroupId: string): "offered" | "full" | "not-offered" {
  const found = otherLiveGroups(facts).find((each) => each.group.id === toGroupId);
  if (!found) return "not-offered";
  return found.full ? "full" : "offered";
}
