import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { holdsStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { COURSE_REQUESTS_COLLECTION, normalizeCourseRequest, type CourseRequestDoc } from "@/lib/firestore/courseRequests";
import { canAuthorAdmissionRound } from "@/lib/firestore/users";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { loadRequestsPage, requestShownTo } from "./load";

/**
 * HOW MANY REQUESTS WAIT FOR THIS PERSON, for Home's line that leads to the
 * Requests page: those waiting with nobody on them and those being handled,
 * as the Requests page counts them (`loadRequestsPage`: an admin every
 * programme's, requests to be excused among them, and a lead the runs they
 * lead, never a request to be excused), with how many of them are requests
 * to be excused, so Home's words say what is waiting.
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
    const excused = loaded.view.rows.filter((row) => row.kind === "excused" && row.state === "waiting").length;
    return { count: loaded.view.counts.waiting + loaded.view.counts.handling, excused };
  } catch (err) {
    console.warn("[dashboard] could not count the requests waiting", err);
    return NO_REQUESTS_WAITING;
  }
}

/** How many requests wait for somebody, and how many of them are requests to be excused (an admin's alone). */
export type RequestsWaiting = { count: number; excused: number };

export const NO_REQUESTS_WAITING: RequestsWaiting = { count: 0, excused: 0 };

/**
 * How many requests about one run wait for somebody to decide them, as the
 * Requests list would show them to `user` (`requestShownTo`, the list's own
 * predicate): every one to an admin; to the programme's lead, none on a group
 * they facilitate or an archived group. Requests to be excused are decided by
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
    return waiting.filter((each) => requestShownTo(user, groups.get(each.groupId), runId)).length + excused;
  } catch (err) {
    console.warn("[programme] could not count the requests waiting", err);
    return 0;
  }
}
