import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  ATTENDANCE_LIMITS,
  EXCUSED_IN_ADVANCE,
  attendanceDocId,
  normalizeCourseAttendance,
} from "@/lib/firestore/courseAttendance";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  EMPTY_LINE,
  cantMakeItState,
  type CantMakeItRequest,
  type CantMakeItState,
  type CantMakeItView,
  type RegisterLine,
} from "./model";
import { CANT_MAKE_IT_REFUSAL } from "./words";

/**
 * "CAN'T MAKE IT" ON THE PERSON'S OWN LINE OF A REGISTER: who may say it, the
 * ticket's state on their programme page, and the one write.
 *
 * ## Who may say it
 *
 * Somebody taking part in the group: their own learner seat on the run,
 * active, in a live group of a run that is not being destroyed (the page's
 * own gate turns a destroyed run away before the ticket is asked), told their
 * group (`placementIsTold`: Publish has emailed them, or they chose the group
 * themselves), on an account that stands. Exactly the people the register
 * shows its facilitators as rows, a facilitator who holds a place in the
 * group included. Nobody can say it for anybody else: the seat is read by
 * the caller's own uid.
 *
 * ## What it writes
 *
 * On the session's register, `courseAttendance/{runId}__{groupId}__{key}`,
 * the caller's line and nothing else: `records.<uid>` as `excused`, and
 * `excusedInAdvance.<uid>` as when they said so, made in one write, in a
 * transaction, while `cantMakeItState` says it is open. Taking it back
 * deletes both, and only while the line is still the one they wrote: a
 * facilitator's mark deletes `excusedInAdvance.<uid>` (the marking route),
 * so from then on the line is theirs. The register's own fields (the held
 * switch, the push, its notes, who marked it last) are never touched, so a
 * register made this way is still a draft nobody has marked: no job, task or
 * reminder reads it differently.
 *
 * Nobody is emailed, and nothing is sent later because of it.
 */

/** Whether this seat is one of the group's people the register shows, by the caller's own uid. */
function takesPartIn(user: SessionUser, seat: CourseEnrolmentDoc, group: CourseGroupDoc, runId: string): boolean {
  if (seat.uid !== user.uid || seat.runId !== runId) return false;
  if (seat.role !== "learner" || seat.status !== "active") return false;
  if (!seat.groupId || seat.groupId !== group.id || group.runId !== runId || group.archived) return false;
  if (!placementIsTold(seat)) return false;
  return isNamedWithStanding(user, "courseEnrolments.uid", seat.uid);
}

/** One person's line of one register, as `cantMakeItState` asks it. */
function lineOf(data: Record<string, unknown> | undefined, id: string, uid: string): RegisterLine {
  if (!data) return EMPTY_LINE;
  const register = normalizeCourseAttendance(id, data);
  return {
    finished: register.pushedAt !== null,
    notHeld: !register.held,
    mark: register.records[uid] ?? null,
    toldAt: register.excusedInAdvance[uid] ?? null,
  };
}

/** Where one person stands on one session of their group, from its register. */
function stateOn(session: ResolvedSession, line: RegisterLine, now: Date): CantMakeItState {
  return cantMakeItState({ startsAt: sessionInstants(session).startsAt, cancelled: session.cancelled, line, now });
}

/**
 * The ticket's "Can't make it", for the programme page: about the group's
 * next session, the one its ticket shows, while there is still something to
 * say about it. One read, the session's register. Null for anybody who does
 * not take part in a group, and once the session has started.
 */
export async function cantMakeItFor(
  db: Firestore,
  input: { user: SessionUser; run: CourseRunDoc; enrolment: CourseEnrolmentDoc | null; groups: readonly CourseGroupDoc[]; now: Date },
): Promise<CantMakeItView | null> {
  const seat = input.enrolment;
  if (!seat?.groupId) return null;
  const group = input.groups.find((each) => each.id === seat.groupId);
  if (!group || !takesPartIn(input.user, seat, group, input.run.id)) return null;
  const next = sessionRange(resolveSessions(input.run, group), input.now).next;
  if (!next) return null;
  const id = attendanceDocId(input.run.id, group.id, next.weekNumber, next.occurrence);
  const snap = await db.collection("courseAttendance").doc(id).get();
  const state = stateOn(next, lineOf(snap.exists ? snap.data() : undefined, id, input.user.uid), input.now);
  if (state.kind !== "open" && state.kind !== "told") return null;
  const startsAt = sessionInstants(next).startsAt;
  return {
    groupId: group.id,
    sessionKey: next.sessionKey,
    day: startsAt ? londonDayLabel(startsAt) : "",
    told: state.kind === "told",
  };
}

export type CantMakeItOutcome =
  | { ok: true; told: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

const refuse = (status: 400 | 404 | 409, error: string): CantMakeItOutcome => ({ ok: false, status, error });

const CLOSED: Record<Extract<CantMakeItState, { kind: "closed" }>["why"], string> = {
  started: CANT_MAKE_IT_REFUSAL.started,
  cancelled: CANT_MAKE_IT_REFUSAL.cancelled,
  undated: CANT_MAKE_IT_REFUSAL.noSession,
  finished: CANT_MAKE_IT_REFUSAL.finished,
  notHeld: CANT_MAKE_IT_REFUSAL.notHeld,
};

/**
 * The one write. Everything it decides on is read again inside the
 * transaction that writes: the run, the caller's own seat, their group and
 * the session's register. Saying it twice, or taking back what is not there,
 * changes nothing and answers where they stand.
 */
export async function recordCantMakeIt(
  db: Firestore,
  user: SessionUser,
  groupId: string,
  request: CantMakeItRequest,
  now: Date,
): Promise<CantMakeItOutcome> {
  const groupRef = db.collection("courseGroups").doc(groupId);
  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    // A group that is not there is answered as one that is not theirs, so
    // probing ids says nothing about which groups exist.
    if (!groupSnap.exists) return refuse(404, CANT_MAKE_IT_REFUSAL.notYours);
    const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (!group.runId || group.runId.includes("/")) return refuse(404, CANT_MAKE_IT_REFUSAL.notYours);
    const [runSnap, seatSnap] = await Promise.all([
      tx.get(db.collection("courseRuns").doc(group.runId)),
      tx.get(db.collection("courseEnrolments").doc(courseEnrolmentId(group.runId, user.uid))),
    ]);
    // A run being destroyed is gone already for everybody it served.
    if (!runSnap.exists || runSnap.data()?.destroying === true || !seatSnap.exists) return refuse(404, CANT_MAKE_IT_REFUSAL.notYours);
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
    if (!takesPartIn(user, seat, group, run.id)) return refuse(404, CANT_MAKE_IT_REFUSAL.notYours);

    // The session is one this group holds, by the group's own calendar.
    const session = resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey);
    if (!session) return refuse(400, CANT_MAKE_IT_REFUSAL.noSession);
    const ref = db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence));
    const registerSnap = await tx.get(ref);
    const data = registerSnap.exists ? (registerSnap.data() ?? {}) : undefined;
    const state = stateOn(session, lineOf(data, ref.id, user.uid), now);
    if (state.kind === "closed") return refuse(409, CLOSED[state.why]);

    if (request.cantMakeIt) {
      if (state.kind === "told") return { ok: true, told: true };
      if (state.kind === "marked") return refuse(409, CANT_MAKE_IT_REFUSAL.marked);
      // The register's cap is a property of its whole map, as the marking route counts it.
      const records = (data?.records ?? {}) as Record<string, unknown>;
      if (Object.keys(records).length + 1 > ATTENDANCE_LIMITS.maxRecords) return refuse(409, CANT_MAKE_IT_REFUSAL.full);
      const { startsAt } = sessionInstants(session);
      // `set` with `merge`: it makes the register when this is the session's
      // first line, and otherwise merges this one key into each map, so
      // nobody else's line is ever written. The parts of the id live as
      // fields, as the marking route writes them.
      tx.set(
        ref,
        {
          runId: run.id,
          groupId: group.id,
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          records: { [user.uid]: "excused" },
          [EXCUSED_IN_ADVANCE]: { [user.uid]: FieldValue.serverTimestamp() },
          ...(startsAt ? { sessionAt: startsAt } : {}),
        },
        { merge: true },
      );
      return { ok: true, told: true };
    }

    // Taking it back: only their own word, while it still stands.
    if (state.kind === "open") return { ok: true, told: false };
    if (state.kind === "marked") return refuse(409, CANT_MAKE_IT_REFUSAL.marked);
    tx.set(
      ref,
      { records: { [user.uid]: FieldValue.delete() }, [EXCUSED_IN_ADVANCE]: { [user.uid]: FieldValue.delete() } },
      { merge: true },
    );
    return { ok: true, told: false };
  });
}
