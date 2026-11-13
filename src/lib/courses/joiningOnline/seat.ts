import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  ATTENDANCE_LIMITS,
  ONLINE_EMAILED,
  ONLINE_SAID,
  SET_BY,
  attendanceDocId,
  normalizeCourseAttendance,
} from "@/lib/firestore/courseAttendance";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import {
  GROUP_FIELD_LIMITS,
  campusForWeek,
  normalizeCourseGroup,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, validateSubmissionUrl, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  EMPTY_ONLINE_LINE,
  heldOnline,
  joiningOnlineState,
  type JoiningOnlineRequest,
  type JoiningOnlineState,
  type JoiningOnlineView,
  type OnlineLine,
} from "./model";
import { tellFacilitatorsJoiningOnline, type JoiningOnlineTell } from "./tell";
import { JOINING_ONLINE_REFUSAL } from "./words";

/**
 * "JOINING ONLINE" ON THE PERSON'S OWN LINE OF A REGISTER: who may say it,
 * the ticket's state on their programme page, and the one write.
 *
 * ## Who may say it
 *
 * Exactly who may say "Can't make it" (`src/lib/courses/cantMakeIt/seat.ts`,
 * the same rule written out here): somebody taking part in the group, by
 * their own learner seat on the run, active, in a live group of a run that
 * is not being destroyed, told their group (`placementIsTold`), on an account
 * that stands. The register's rows, a facilitator who holds a place in the
 * group included. Nobody can say it for anybody else: the seat is read by the
 * caller's own uid.
 *
 * ## What it writes
 *
 * On the session's register, `courseAttendance/{runId}__{groupId}__{key}`,
 * the caller's entry in `onlineSaid`: when they said it, in one write, in a
 * transaction, while `joiningOnlineState` says it is open. Taking it back
 * deletes that entry. Never a mark: `records`, the held switch, the push, the
 * notes and who marked it last are never touched, so a register made this
 * way is still a draft nobody has marked, and no job, task or reminder reads
 * it differently.
 *
 * ## Who is emailed
 *
 * The group's facilitators, once per person per session, the first time the
 * person says it (`tell.ts`): never the person, nobody when it is taken
 * back, and nothing a second time when it is said again. The same write
 * decides it, from the caller's entry in `onlineEmailed` on that register,
 * and stamps it when it tells them; taking the word back leaves the stamp.
 * The email goes after the write, outside its transaction, and the press is
 * answered the same whether it was sent or not. Nothing else is sent, then
 * or later.
 */

/** Whether this seat is one of the group's people the register shows, by the caller's own uid. */
function takesPartIn(user: SessionUser, seat: CourseEnrolmentDoc, group: CourseGroupDoc, runId: string): boolean {
  if (seat.uid !== user.uid || seat.runId !== runId) return false;
  if (seat.role !== "learner" || seat.status !== "active") return false;
  if (!seat.groupId || seat.groupId !== group.id || group.runId !== runId || group.archived) return false;
  if (!placementIsTold(seat)) return false;
  return isNamedWithStanding(user, "courseEnrolments.uid", seat.uid);
}

/** One person's line of one register, as `joiningOnlineState` asks it. */
function lineOf(data: Record<string, unknown> | undefined, id: string, uid: string): OnlineLine {
  if (!data) return EMPTY_ONLINE_LINE;
  const register = normalizeCourseAttendance(id, data);
  return {
    finished: register.pushedAt !== null,
    notHeld: !register.held,
    mark: register.records[uid] ?? null,
    toldAt: register.excusedInAdvance[uid] ?? null,
    saidAt: register.onlineSaid[uid] ?? null,
  };
}

/** Whether one session of the group is held online for everybody, from its own week. */
function sessionHeldOnline(group: CourseGroupDoc, session: ResolvedSession): boolean {
  // The week's mode is kept for the week's first session only (the override
  // maps have no occurrence dimension; `src/lib/courses/sessions.ts`).
  const mode = session.occurrence === 1 ? sessionModeForWeek(group, session.weekId) : null;
  const campus = session.occurrence === 1 ? campusForWeek(group, session.weekId) : group.campus;
  return heldOnline({ mode, campus, room: session.session.location });
}

/** Where one person stands on one session of their group, from its register. */
function stateOn(group: CourseGroupDoc, session: ResolvedSession, line: OnlineLine, now: Date): JoiningOnlineState {
  return joiningOnlineState({
    startsAt: sessionInstants(session).startsAt,
    cancelled: session.cancelled,
    online: sessionHeldOnline(group, session),
    line,
    now,
  });
}

/**
 * The ticket's "Joining online", for the programme page: about the group's
 * next session, the one its ticket shows, while there is still something to
 * say about it. One read, the session's register. Null for anybody who does
 * not take part in a group, once the session has started, for a session
 * online for everybody, and once a facilitator has filled in their line.
 */
export async function joiningOnlineFor(
  db: Firestore,
  input: { user: SessionUser; run: CourseRunDoc; enrolment: CourseEnrolmentDoc | null; groups: readonly CourseGroupDoc[]; now: Date },
): Promise<JoiningOnlineView | null> {
  const seat = input.enrolment;
  if (!seat?.groupId) return null;
  const group = input.groups.find((each) => each.id === seat.groupId);
  if (!group || !takesPartIn(input.user, seat, group, input.run.id)) return null;
  const next = sessionRange(resolveSessions(input.run, group), input.now).next;
  if (!next) return null;
  const id = attendanceDocId(input.run.id, group.id, next.weekNumber, next.occurrence);
  const snap = await db.collection("courseAttendance").doc(id).get();
  const state = stateOn(group, next, lineOf(snap.exists ? snap.data() : undefined, id, input.user.uid), input.now);
  if (state.kind !== "open" && state.kind !== "said" && state.kind !== "told") return null;
  const startsAt = sessionInstants(next).startsAt;
  return {
    groupId: group.id,
    sessionKey: next.sessionKey,
    day: startsAt ? londonDayLabel(startsAt) : "",
    said: state.kind === "said",
    told: state.kind === "told",
  };
}

export type JoiningOnlineOutcome =
  | { ok: true; online: boolean; hasLink: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string };

const refuse = (status: 400 | 404 | 409, error: string): JoiningOnlineOutcome => ({ ok: false, status, error });

const CLOSED: Record<Extract<JoiningOnlineState, { kind: "closed" }>["why"], string> = {
  started: JOINING_ONLINE_REFUSAL.started,
  cancelled: JOINING_ONLINE_REFUSAL.cancelled,
  undated: JOINING_ONLINE_REFUSAL.noSession,
  finished: JOINING_ONLINE_REFUSAL.finished,
  notHeld: JOINING_ONLINE_REFUSAL.notHeld,
  online: JOINING_ONLINE_REFUSAL.online,
};

/**
 * The one write. Everything it decides on is read again inside the
 * transaction that writes: the group, the run, the caller's own seat and the
 * session's register. Saying it twice, or taking back what is not there,
 * changes nothing and answers where they stand. `hasLink` is whether the
 * session has a meeting link, so the ticket says where it is; never the link.
 * Once it is written, the group's facilitators are told, when the write
 * decided to tell them.
 */
export async function recordJoiningOnline(
  db: Firestore,
  user: SessionUser,
  groupId: string,
  request: JoiningOnlineRequest,
  now: Date,
): Promise<JoiningOnlineOutcome> {
  const { outcome, tell } = await writeJoiningOnline(db, user, groupId, request, now);
  // After the write and outside its transaction. It never throws, and what
  // it sends never changes the answer.
  if (outcome.ok && tell) await tellFacilitatorsJoiningOnline(db, tell);
  return outcome;
}

/** What the transaction decides: the answer, and who to tell when this press is the first time the caller says it for the session. */
type Written = { outcome: JoiningOnlineOutcome; tell: JoiningOnlineTell | null };

/** An answer that tells nobody. */
const only = (outcome: JoiningOnlineOutcome): Written => ({ outcome, tell: null });

async function writeJoiningOnline(
  db: Firestore,
  user: SessionUser,
  groupId: string,
  request: JoiningOnlineRequest,
  now: Date,
): Promise<Written> {
  const groupRef = db.collection("courseGroups").doc(groupId);
  return db.runTransaction(async (tx): Promise<Written> => {
    const groupSnap = await tx.get(groupRef);
    // A group that is not there is answered as one that is not theirs, so
    // probing ids says nothing about which groups exist.
    if (!groupSnap.exists) return only(refuse(404, JOINING_ONLINE_REFUSAL.notYours));
    const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (!group.runId || group.runId.includes("/")) return only(refuse(404, JOINING_ONLINE_REFUSAL.notYours));
    const [runSnap, seatSnap] = await Promise.all([
      tx.get(db.collection("courseRuns").doc(group.runId)),
      tx.get(db.collection("courseEnrolments").doc(courseEnrolmentId(group.runId, user.uid))),
    ]);
    // A run being destroyed is gone already for everybody it served.
    if (!runSnap.exists || runSnap.data()?.destroying === true || !seatSnap.exists) {
      return only(refuse(404, JOINING_ONLINE_REFUSAL.notYours));
    }
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
    if (!takesPartIn(user, seat, group, run.id)) return only(refuse(404, JOINING_ONLINE_REFUSAL.notYours));

    // The session is one this group holds, by the group's own calendar.
    const session = resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey);
    if (!session) return only(refuse(400, JOINING_ONLINE_REFUSAL.noSession));
    const ref = db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence));
    const registerSnap = await tx.get(ref);
    const data = registerSnap.exists ? (registerSnap.data() ?? {}) : undefined;
    const state = stateOn(group, session, lineOf(data, ref.id, user.uid), now);
    if (state.kind === "closed") return only(refuse(409, CLOSED[state.why]));
    if (state.kind === "told") return only(refuse(409, JOINING_ONLINE_REFUSAL.told));
    if (state.kind === "marked") return only(refuse(409, JOINING_ONLINE_REFUSAL.marked));
    // Whether the ticket can say the link is on it: asked, with the check
    // the ticket makes before it draws one, and never handed back.
    const link = session.session.meetingUrl;
    const hasLink = Boolean(link) && validateSubmissionUrl(link ?? "", GROUP_FIELD_LIMITS.meetingUrl) === null;

    if (request.online) {
      if (state.kind === "said") return only({ ok: true, online: true, hasLink });
      // Capped as the register's marks are: a map of every row's word.
      const said = (data?.[ONLINE_SAID] ?? {}) as Record<string, unknown>;
      if (Object.keys(said).length + 1 > ATTENDANCE_LIMITS.maxRecords) return only(refuse(409, JOINING_ONLINE_REFUSAL.full));
      const { startsAt } = sessionInstants(session);
      // The group's facilitators are emailed the first time this person says
      // it for this session, and never again: a stamp nobody takes away, so
      // taking the word back and saying it again tells nobody twice. Capped
      // as the word is, so a register can never be made to hold more stamps
      // than rows.
      const emailed = (data?.[ONLINE_EMAILED] ?? {}) as Record<string, unknown>;
      const tells = !Object.hasOwn(emailed, user.uid) && Object.keys(emailed).length < ATTENDANCE_LIMITS.maxRecords;
      // `set` with `merge`: it makes the register when this is the session's
      // first line, and otherwise merges this one key into the map, so
      // nobody else's word is ever written. The parts of the id live as
      // fields, as the marking route writes them.
      tx.set(
        ref,
        {
          runId: run.id,
          groupId: group.id,
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          [ONLINE_SAID]: { [user.uid]: FieldValue.serverTimestamp() },
          // Their line says who set it: their own word, before the session.
          [SET_BY]: { [user.uid]: { byUid: user.uid, at: FieldValue.serverTimestamp(), how: "self" } },
          ...(tells ? { [ONLINE_EMAILED]: { [user.uid]: FieldValue.serverTimestamp() } } : {}),
          ...(startsAt ? { sessionAt: startsAt } : {}),
        },
        { merge: true },
      );
      const tell: JoiningOnlineTell | null = tells
        ? {
            runId: run.id,
            group: { id: group.id, name: group.name, facilitatorUids: group.facilitatorUids },
            uid: user.uid,
            weekNumber: session.weekNumber,
            occurrence: session.occurrence,
            dateKey: session.dateKey,
            startTimeLocal: session.session.startTimeLocal,
            hasLink,
          }
        : null;
      return { outcome: { ok: true, online: true, hasLink }, tell };
    }

    // Taking it back: only their own word.
    if (state.kind === "open") return only({ ok: true, online: false, hasLink });
    // The line is empty again, so it says nobody set it.
    if (Object.hasOwn((data?.[SET_BY] ?? {}) as Record<string, unknown>, user.uid)) {
      tx.set(ref, { [ONLINE_SAID]: { [user.uid]: FieldValue.delete() }, [SET_BY]: { [user.uid]: FieldValue.delete() } }, { merge: true });
      return only({ ok: true, online: false, hasLink });
    }
    tx.set(ref, { [ONLINE_SAID]: { [user.uid]: FieldValue.delete() } }, { merge: true });
    return only({ ok: true, online: false, hasLink });
  });
}
