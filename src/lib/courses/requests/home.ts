import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { holdsStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { COURSE_REQUESTS_COLLECTION, normalizeCourseRequest, type CourseRequestDoc } from "@/lib/firestore/courseRequests";
import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { normalizeVisitRequest, type VisitRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { liveWaitingVisitRequests } from "@/lib/courses/visitRequest/page";
import { normalizeMoveRequest, type MoveRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { liveWaitingMoveRequests } from "@/lib/courses/moveRequest/page";
import { openByKind } from "./kinds";
import { loadRequestsPage, requestShownTo } from "./load";

/**
 * HOW MANY REQUESTS WAIT FOR THIS PERSON, for Home's line that leads to the
 * Requests page: those waiting with nobody on them and those being handled,
 * as the Requests page counts them (`loadRequestsPage`: an admin every
 * programme's, requests to be excused among them, and the lead of a
 * programme the runs it names, never a request to be excused; a run's track
 * lead by that alone, none), with how many of them are requests to be
 * excused, so Home's words say what is waiting.
 *
 * Asked only of somebody the Requests page's tree admits, by the same
 * predicate as `requireAdmissionsPage` (an admin or round author, or
 * somebody appointed on a form with the standing it needs), so Home never
 * offers a link that sends its reader back to Home, and nobody else costs a
 * read. A read that fails is 0: Home says nothing rather than something
 * wrong.
 */
export async function requestsWaitingFor(db: Firestore, user: SessionUser, now: Date): Promise<RequestsWaiting> {
  const reaches =
    canAuthorAdmissionRound(user) || (user.admissionsReviewer === true && holdsStanding(user, "admissionRounds.reviewerUids"));
  if (!reaches) return NO_REQUESTS_WAITING;
  try {
    const loaded = await loadRequestsPage(db, user, now);
    if (loaded.status !== "ok") return NO_REQUESTS_WAITING;
    // Requests to be excused reach an admin's list alone (the loader sends a
    // lead none), so this is 0 for everybody else.
    // Each kind counted by itself (`openByKind`), never one worked out from the others.
    return { count: loaded.view.counts.waiting + loaded.view.counts.handling, ...openByKind(loaded.view.rows) };
  } catch (err) {
    console.warn("[dashboard] could not count the requests waiting", err);
    return NO_REQUESTS_WAITING;
  }
}

/**
 * How many requests wait for somebody, and how many of each kind, each
 * counted by itself: register corrections, requests to be excused, to go to
 * another session and to change group, and messages to the team (those four
 * an admin's alone), and access asks to the team, an admin's alone too, which
 * Home's line counts as messages to the team, so it never says "access
 * needs". A kind with no count here is in `count` and in no line of Home's
 * words until it brings its own.
 */
export type RequestsWaiting = { count: number; corrections: number; excused: number; visits: number; moves: number; messages: number; access: number };

export const NO_REQUESTS_WAITING: RequestsWaiting = { count: 0, corrections: 0, excused: 0, visits: 0, moves: 0, messages: 0, access: 0 };

/**
 * How many requests about one run wait for somebody to decide them, as the
 * Requests list would show them to `user` (`requestShownTo`, the list's own
 * predicate): every one to an admin; to the programme's lead, none on a group
 * they facilitate or an archived group; to anybody else, a run's track lead
 * among them, none. Requests to be excused are decided by
 * admins only, so they are counted only when the caller says the reader is an
 * admin (`excused: true`). One read by `runId`, and the groups the waiting
 * ones name, by id.
 */
export async function requestsWaitingOnRun(
  db: Firestore,
  user: SessionUser,
  runId: string,
  opts: { excused?: boolean } = {},
): Promise<number> {
  try {
    const snap = await db.collection(COURSE_REQUESTS_COLLECTION).where("runId", "==", runId).limit(500).get();
    const waiting = snap.docs
      .map((doc) => normalizeCourseRequest(doc.id, doc.data() ?? {}))
      .filter((each): each is CourseRequestDoc => each !== null && each.status === "waiting" && each.runId === runId);
    const groupIds = [...new Set(waiting.map((each) => each.groupId))].filter(isAddressableId);
    const snaps = groupIds.length ? await db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id))) : [];
    const groups = new Map<string, CourseGroupDoc>();
    for (const each of snaps) if (each.exists) groups.set(each.id, normalizeCourseGroup(each.id, each.data() ?? {}));
    // A request to be excused is no correction (the reader above leaves it out): counted apart, for an admin.
    const excused =
      opts.excused === true
        ? snap.docs.filter((doc) => {
            const data = doc.data() ?? {};
            return data.kind === "excused" && data.status === "waiting" && data.runId === runId;
          }).length
        : 0;
    // Requests to go to another session, still waiting for a decision, live
    // (not closed by itself, not gone with the place): counted for an admin alone, as those to be excused are.
    const visits =
      opts.excused === true
        ? (
            await liveWaitingVisitRequests(
              db,
              snap.docs.map((doc) => normalizeVisitRequest(doc.id, doc.data() ?? {})).filter((each): each is VisitRequestDoc => each !== null && each.runId === runId),
              new Date(),
            )
          ).length
        : 0;
    // Requests to change group, still waiting, live (not gone by themselves): an admin's alone, likewise.
    const moves =
      opts.excused === true
        ? (
            await liveWaitingMoveRequests(
              db,
              snap.docs.map((doc) => normalizeMoveRequest(doc.id, doc.data() ?? {})).filter((each): each is MoveRequestDoc => each !== null && each.runId === runId),
            )
          ).length
        : 0;
    // The lead of the programme that names the run, with their standing on this request: a track lead decides none.
    const leadsRun = user.role === "admin" || (await programmeLedBy(db, user, runId)) !== null;
    return waiting.filter((each) => requestShownTo(user, groups.get(each.groupId), runId, leadsRun)).length + excused + visits + moves;
  } catch (err) {
    console.warn("[programme] could not count the requests waiting", err);
    return 0;
  }
}
