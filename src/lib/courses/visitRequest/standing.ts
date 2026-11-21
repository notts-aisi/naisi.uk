import "server-only";
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { resolveSessions, type ResolvedSession } from "@/lib/courses/sessions";
import { ownGroupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeVisitRequest, type VisitRequestDoc } from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { cancelDeadline, ownSessionThatWeek } from "../visit/deadline";

/**
 * WHERE A REQUEST TO GO TO ANOTHER SESSION STANDS NOW, worked out at read
 * time from the run as it is, never stored: nothing runs when a clock passes.
 * Every reader asks this one function (the card, "Your requests", the
 * Requests page and its counts, one request's page, and every route), so they
 * can never say different things.
 *
 * A stored `waiting` request is:
 *  - GONE when the person no longer holds an active learner's place whose
 *    group that week is the one they asked from (taken off the run, left, or
 *    moved for good from that week or before), or that group no longer meets.
 *    Quietly closed: off every list, nobody emailed, no write.
 *  - CLOSED BY ITSELF once the earlier of the two sessions that week has
 *    started (their own group's, a session called off being none, and the
 *    host's), the moment a visit could no longer be cancelled
 *    (`cancelDeadline`, the visit's own rule): nobody decided it in time.
 *    Nobody is emailed; their list says so.
 *  - WAITING otherwise, and it CAN'T GO AHEAD while the host's session that
 *    week is called off, marked as not held, missing, or its group no longer
 *    meets: the person is told and offered Withdraw.
 *
 * A request that has left `waiting` is what it says.
 */

/** Most requests one person has made on one run: a term holds a handful. */
const MAX_OWN = 200;

/**
 * This person's visit requests on this run, newest first: two equalities
 * (`subjectUid`, `runId`), served by merging the automatic single-field
 * indexes, so no declared index. Read through the visit kind's own
 * normaliser, held to a real run and to the person, so no other kind (a
 * request to be excused, a correction, or one that belongs to no run) is ever
 * counted or listed here.
 */
export async function ownVisitRequestsIn(tx: Transaction | null, db: Firestore, uid: string, runId: string): Promise<VisitRequestDoc[]> {
  if (!runId) return [];
  const query = db.collection(COURSE_REQUESTS_COLLECTION).where("subjectUid", "==", uid).where("runId", "==", runId).limit(MAX_OWN);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs
    .map((doc) => normalizeVisitRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is VisitRequestDoc => each !== null && each.runId === runId && each.subjectUid === uid)
    .sort((a, b) => (b.askedAt?.getTime() ?? 0) - (a.askedAt?.getTime() ?? 0));
}

/** A session's date and start, as the sentences read them. */
export type SessionWhen = { dateKey: string; startTimeLocal: string };

export type VisitRequestStanding =
  | {
      state: "waiting";
      home: CourseGroupDoc;
      host: CourseGroupDoc | null;
      /** The host's session that week as it is now; null with none. */
      hostSession: ResolvedSession | null;
      ownSession: ResolvedSession | null;
      /** The host's session that week is not happening: it can't go ahead. */
      cantGoAhead: boolean;
    }
  | { state: "closed"; lapse: SessionWhen | null }
  | { state: "gone" }
  | { state: "approved" | "declined" | "withdrawn" };

/** When a session starts, as a sentence names it. */
function whenOf(session: ResolvedSession): SessionWhen {
  return { dateKey: session.dateKey, startTimeLocal: session.session.startTimeLocal };
}

export function visitRequestStandingOf(input: {
  request: Pick<VisitRequestDoc, "status" | "groupId" | "runId" | "subjectUid" | "change">;
  run: CourseRunDoc;
  /** Every group of the run, archived ones included. */
  groups: readonly CourseGroupDoc[];
  /** The person's place on the run, or null with none. */
  place: Pick<CourseEnrolmentDoc, "uid" | "runId" | "role" | "status" | "groupId" | "groupsByWeek"> | null;
  /**
   * Whether the host's register that week says the session did not happen.
   * Every reader passes it, read by `hostRegisterIdOf` (`visitRequestStandingRead`
   * reads it for a caller that has not).
   */
  hostNotHeld: boolean;
  now: Date;
}): VisitRequestStanding {
  const { request, run, place, now } = input;
  if (request.status !== "waiting") return { state: request.status };
  const weekNumber = request.change.weekNumber;
  if (
    !place ||
    place.runId !== run.id ||
    place.uid !== request.subjectUid ||
    place.role !== "learner" ||
    place.status !== "active" ||
    !place.groupId ||
    ownGroupForWeek(place, weekNumber) !== request.groupId
  ) {
    return { state: "gone" };
  }
  const home = input.groups.find((group) => group.id === request.groupId && !group.archived) ?? null;
  if (!home) return { state: "gone" };
  const host = input.groups.find((group) => group.id === request.change.hostGroupId) ?? null;
  const hostSession = host
    ? (resolveSessions(run, host).find((each) => each.weekNumber === weekNumber && each.occurrence === 1 && each.dateKey !== "") ?? null)
    : null;
  const ownSession = ownSessionThatWeek(run, home, weekNumber);
  const hostHappening = host !== null && !host.archived && hostSession !== null && !hostSession.cancelled && input.hostNotHeld !== true;
  // The visit's own rule: until the earlier of the two sessions starts. A
  // host session that is not happening is no session to go by.
  const deadline = cancelDeadline({ host: host ?? home, hostSession: hostHappening ? hostSession : null, home, ownSession });
  if (deadline.until === null) return { state: "closed", lapse: null };
  if (now.getTime() >= deadline.until.getTime()) return { state: "closed", lapse: deadline.first ? whenOf(deadline.first.session) : null };
  return { state: "waiting", home, host, hostSession, ownSession, cantGoAhead: !hostHappening };
}

/**
 * THE HOST'S REGISTER THAT WEEK, the one fact every reader hands
 * `visitRequestStandingOf` beside the run: its document id (the host's
 * session of the request's week, the week's first), or null when the host has
 * no such session. Every reader reads that document, or has it already, and
 * asks `notHeldIn` of it, so a session marked as not having happened reads
 * the same on the card, the routes and the staff pages.
 */
export function hostRegisterIdOf(run: CourseRunDoc, groups: readonly CourseGroupDoc[], request: Pick<VisitRequestDoc, "change">): string | null {
  const host = groups.find((group) => group.id === request.change.hostGroupId);
  if (!host) return null;
  const session = resolveSessions(run, host).find((each) => each.weekNumber === request.change.weekNumber && each.occurrence === 1);
  return session ? attendanceDocId(run.id, host.id, session.weekNumber, session.occurrence) : null;
}

/** Whether a register, as stored, says its session did not happen. */
export function notHeldIn(id: string, data: Record<string, unknown> | undefined): boolean {
  return data ? !normalizeCourseAttendance(id, data).held : false;
}

/** Where a request stands, reading the host's register through `get` (the database, or a transaction). */
export async function visitRequestStandingRead(
  get: (ref: DocumentReference) => Promise<DocumentSnapshot>,
  db: Firestore,
  input: Omit<Parameters<typeof visitRequestStandingOf>[0], "hostNotHeld">,
): Promise<VisitRequestStanding> {
  const id = input.request.status === "waiting" ? hostRegisterIdOf(input.run, input.groups, input.request) : null;
  const snap = id ? await get(db.collection("courseAttendance").doc(id)) : null;
  return visitRequestStandingOf({ ...input, hostNotHeld: id && snap?.exists ? notHeldIn(id, snap.data()) : false });
}
