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
 * programme's, a lead the runs they lead).
 *
 * Asked only of somebody the Requests page's tree admits, by the same
 * predicate as `requireAdmissionsPage` (an admin or round author, or
 * somebody appointed on a form with the standing it needs), so Home never
 * offers a link that sends its reader back to Home, and nobody else costs a
 * read. A read that fails is 0: Home says nothing rather than something
 * wrong.
 */
export async function requestsWaitingFor(db: Firestore, user: SessionUser, now: Date): Promise<number> {
  const reaches =
    canAuthorAdmissionRound(user) || (user.admissionsReviewer === true && holdsStanding(user, "admissionRounds.reviewerUids"));
  if (!reaches) return 0;
  try {
    const loaded = await loadRequestsPage(db, user, now);
    return loaded.status === "ok" ? loaded.view.counts.waiting + loaded.view.counts.handling : 0;
  } catch (err) {
    console.warn("[dashboard] could not count the requests waiting", err);
    return 0;
  }
}

/**
 * How many requests about one run wait for somebody to decide them, as the
 * Requests list would show them to `user` (`requestShownTo`, the list's own
 * predicate): every one to an admin; to the programme's lead, none on a group
 * they facilitate or an archived group. One read by `runId`, and the groups
 * the waiting ones name, by id.
 */
export async function requestsWaitingOnRun(db: Firestore, user: SessionUser, runId: string): Promise<number> {
  try {
    const snap = await db.collection(COURSE_REQUESTS_COLLECTION).where("runId", "==", runId).limit(500).get();
    const waiting = snap.docs
      .map((doc) => normalizeCourseRequest(doc.id, doc.data() ?? {}))
      .filter((each): each is CourseRequestDoc => each !== null && each.status === "waiting" && each.runId === runId);
    const groupIds = [...new Set(waiting.map((each) => each.groupId))].filter(isAddressableId);
    const snaps = groupIds.length ? await db.getAll(...groupIds.map((id) => db.collection("courseGroups").doc(id))) : [];
    const groups = new Map<string, CourseGroupDoc>();
    for (const each of snaps) if (each.exists) groups.set(each.id, normalizeCourseGroup(each.id, each.data() ?? {}));
    return waiting.filter((each) => requestShownTo(user, groups.get(each.groupId), runId)).length;
  } catch (err) {
    console.warn("[programme] could not count the requests waiting", err);
    return 0;
  }
}
