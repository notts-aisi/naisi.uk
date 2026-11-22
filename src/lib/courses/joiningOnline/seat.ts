import "server-only";
import { FieldValue, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { nextSessionByWeek } from "@/lib/courses/cantMakeIt/seat";
import { everInGroup, inGroupForWeek } from "@/lib/courses/groupsByWeek";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
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
 * caller's own uid. A session's group is the group they were in for its week
 * (`groupForWeek`), as for "Can't make it": somebody whose place records a
 * move says it on their old group's register for the weeks before it, and
 * that group's facilitators are the ones told.
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

/**
 * Whether this seat is one of the group's people the register shows, by the
 * caller's own uid: for ONE SESSION, the group they were in for its week
 * (`groupForWeek`); with `weekNumber` null, whether any week of theirs was
 * spent in the group, which a press asks before it knows which session it
 * names. With no record of groups by week, the group they are in now for
 * every week.
 */
function takesPartIn(
  user: SessionUser,
  seat: CourseEnrolmentDoc,
  group: CourseGroupDoc,
  runId: string,
  weekNumber: number | null,
): boolean {
  if (seat.uid !== user.uid || seat.runId !== runId) return false;
  if (seat.role !== "learner" || seat.status !== "active") return false;
  if (!seat.groupId || group.runId !== runId || group.archived) return false;
  if (weekNumber === null ? !everInGroup(seat, group.id) : !inGroupForWeek(seat, group.id, weekNumber)) return false;
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
  const own = input.groups.find((each) => each.id === seat.groupId);
  if (!own || !takesPartIn(input.user, seat, own, input.run.id, null)) return null;
  // Their next session, from the group they are in for its week.
  const found = nextSessionByWeek(input.run, seat, own, input.groups, input.now);
  if (!found) return null;
  const { group, session: next } = found;
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

/** Whether a session has a meeting link the ticket would draw: asked, with the check the ticket makes before it draws one, and never handed back. */
function sessionHasLink(session: ResolvedSession): boolean {
  const link = session.session.meetingUrl;
  return Boolean(link) && validateSubmissionUrl(link ?? "", GROUP_FIELD_LIMITS.meetingUrl) === null;
}

/**
 * SAYING "JOINING ONLINE" ON ONE REGISTER, decided: the one rule and the one
 * write of a person's word, asked by their own press (below) and by an
 * admin's approval of their request to go to another group's session with
 * "I’d join online" ticked (`src/lib/courses/visitRequest/decide.ts`, inside
 * the visit's own transaction), so the word is written one way whoever's
 * press it rides on.
 *
 * Decided from the register as read in the caller's transaction (`data`,
 * undefined for none yet): refused while `joiningOnlineState` says it cannot
 * be said (`state` says why, `error` in the person's own words), and when the
 * register already holds as many words as it holds rows; nothing to write
 * when it is said already (`write` null); otherwise `write`, to call with the
 * transaction's other writes, after every read. `tells` is whether this is
 * the first time the person says it for the session, which the write stamps
 * (`onlineEmailed`): the press then emails the group's facilitators, and an
 * approval says it in the email the visit sends them instead, so the press's
 * email never also goes. `hasLink` is whether the session has a meeting link;
 * never the link.
 */
export type SayingOnline =
  | {
      ok: true;
      hasLink: boolean;
      tells: boolean;
      write: ((tx: Transaction, ref: DocumentReference, runId: string) => void) | null;
      /**
       * Said already, and never stamped as emailed: the stamp alone, for a
       * caller whose own email says it (an approval). The press never writes
       * it: it sends nothing for a word said already.
       */
      stampOnly: ((tx: Transaction, ref: DocumentReference) => void) | null;
    }
  | { ok: false; error: string; state: JoiningOnlineState | { kind: "full" } };

export function sayingOnlineOn(input: {
  group: CourseGroupDoc;
  session: ResolvedSession;
  data: Record<string, unknown> | undefined;
  registerId: string;
  uid: string;
  now: Date;
}): SayingOnline {
  const { group, session, data, uid } = input;
  const state = stateOn(group, session, lineOf(data, input.registerId, uid), input.now);
  if (state.kind === "closed") return { ok: false, error: CLOSED[state.why], state };
  if (state.kind === "told") return { ok: false, error: JOINING_ONLINE_REFUSAL.told, state };
  if (state.kind === "marked") return { ok: false, error: JOINING_ONLINE_REFUSAL.marked, state };
  const hasLink = sessionHasLink(session);
  // The group's facilitators are emailed the first time this person says
  // it for this session, and not again while they are due at it: a stamp
  // taking the word back keeps, so taking it back and saying it again tells
  // nobody twice. It goes only with the person's place at the session (a
  // visit that ends, `onlineWordGone` in `./gone.ts`). Capped as the word is, so a register
  // can never be made to hold more stamps than rows.
  const emailed = (data?.[ONLINE_EMAILED] ?? {}) as Record<string, unknown>;
  const tells = !Object.hasOwn(emailed, uid) && Object.keys(emailed).length < ATTENDANCE_LIMITS.maxRecords;
  if (state.kind === "said") {
    return {
      ok: true,
      hasLink,
      tells: false,
      write: null,
      stampOnly: tells ? (tx, ref) => tx.set(ref, { [ONLINE_EMAILED]: { [uid]: FieldValue.serverTimestamp() } }, { merge: true }) : null,
    };
  }
  // Capped as the register's marks are: a map of every row's word.
  const said = (data?.[ONLINE_SAID] ?? {}) as Record<string, unknown>;
  if (Object.keys(said).length + 1 > ATTENDANCE_LIMITS.maxRecords) return { ok: false, error: JOINING_ONLINE_REFUSAL.full, state: { kind: "full" } };
  const { startsAt } = sessionInstants(session);
  return {
    ok: true,
    hasLink,
    tells,
    stampOnly: null,
    write: (tx, ref, runId) => {
      // `set` with `merge`: it makes the register when this is the session's
      // first line, and otherwise merges this one key into the map, so
      // nobody else's word is ever written. The parts of the id live as
      // fields, as the marking route writes them.
      tx.set(
        ref,
        {
          runId,
          groupId: group.id,
          weekNumber: session.weekNumber,
          occurrence: session.occurrence,
          [ONLINE_SAID]: { [uid]: FieldValue.serverTimestamp() },
          // Their line says who set it: their own word, before the session,
          // whoever's press it rode on.
          [SET_BY]: { [uid]: { byUid: uid, at: FieldValue.serverTimestamp(), how: "self" } },
          ...(tells ? { [ONLINE_EMAILED]: { [uid]: FieldValue.serverTimestamp() } } : {}),
          ...(startsAt ? { sessionAt: startsAt } : {}),
        },
        { merge: true },
      );
    },
  };
}

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
    // A week of theirs was spent in this group: asked before the session is
    // known, so the refusals come in the order they always have.
    if (!takesPartIn(user, seat, group, run.id, null)) return only(refuse(404, JOINING_ONLINE_REFUSAL.notYours));

    // The session is one this group holds, by the group's own calendar, in a
    // week they are in this group: its register is the one their word is on,
    // and its facilitators are the ones told.
    const session = resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey);
    if (!session) return only(refuse(400, JOINING_ONLINE_REFUSAL.noSession));
    if (!takesPartIn(user, seat, group, run.id, session.weekNumber)) return only(refuse(404, JOINING_ONLINE_REFUSAL.notYours));
    const ref = db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence));
    const registerSnap = await tx.get(ref);
    const data = registerSnap.exists ? (registerSnap.data() ?? {}) : undefined;
    if (request.online) {
      const said = sayingOnlineOn({ group, session, data, registerId: ref.id, uid: user.uid, now });
      if (!said.ok) return only(refuse(409, said.error));
      // Already said: nothing written, nobody told again.
      if (!said.write) return only({ ok: true, online: true, hasLink: said.hasLink });
      said.write(tx, ref, run.id);
      const tell: JoiningOnlineTell | null = said.tells
        ? {
            runId: run.id,
            group: { id: group.id, name: group.name, facilitatorUids: group.facilitatorUids },
            uid: user.uid,
            weekNumber: session.weekNumber,
            occurrence: session.occurrence,
            dateKey: session.dateKey,
            startTimeLocal: session.session.startTimeLocal,
            hasLink: said.hasLink,
          }
        : null;
      return { outcome: { ok: true, online: true, hasLink: said.hasLink }, tell };
    }

    const state = stateOn(group, session, lineOf(data, ref.id, user.uid), now);
    if (state.kind === "closed") return only(refuse(409, CLOSED[state.why]));
    if (state.kind === "told") return only(refuse(409, JOINING_ONLINE_REFUSAL.told));
    if (state.kind === "marked") return only(refuse(409, JOINING_ONLINE_REFUSAL.marked));
    const hasLink = sessionHasLink(session);

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
