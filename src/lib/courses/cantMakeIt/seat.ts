import "server-only";
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { londonDayLabel } from "@/lib/courses/londonLabels";
import { resolveSessions, sessionInstants, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  ATTENDANCE_LIMITS,
  EXCUSED_IN_ADVANCE,
  SET_BY,
  attendanceDocId,
  normalizeCourseAttendance,
} from "@/lib/firestore/courseAttendance";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  orderedSessionKeys,
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
import { excuseHoldsIn } from "@/lib/courses/excused/standing";
import { CANT_MAKE_IT_REFUSAL } from "./words";

/**
 * "CAN'T MAKE IT" ON THE PERSON'S OWN LINE OF A REGISTER: who may say it, the
 * ticket's state on their programme page, the one write, and the parts of it
 * that every other way of telling us in advance shares.
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
 * One more field moves, on their own seat: when they have answered "Can you
 * make this time most weeks?" with "Most weeks, not all" about this group,
 * the answer lists the sessions they can't make, and the ticket keeps that
 * list in step with the register (`keepListInStep`). No other answer changes.
 *
 * ## The parts every word in advance shares
 *
 * `readSessionLines`, `writeExcusedInAdvance` and `writeTakenBack` are the
 * ONE way a line of a register is written on somebody's word in advance. The
 * ticket uses them for one session; the card's "Most weeks, not all"
 * (`src/lib/courses/timeAnswer/seat.ts`) for each session the person ticks
 * or unticks; and staff's "They meant some weeks"
 * (`src/lib/courses/timeAnswer/someWeeks.ts`) for each session the person
 * named in their own words. Each caller decides who and which sessions, and
 * reads every line before it writes any.
 *
 * Nobody is emailed, and nothing is sent later because of it.
 */

/**
 * Whether this seat is one of the group's people the register shows, by the
 * caller's own uid. Asking to be excused from a week asks the same
 * (`src/lib/courses/excused/ask.ts`).
 */
export function takesPartIn(user: SessionUser, seat: CourseEnrolmentDoc, group: CourseGroupDoc, runId: string): boolean {
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

/** One session of a group with its register as read, and where one person stands on it. */
export type SessionLine = {
  session: ResolvedSession;
  ref: DocumentReference;
  /** The register as stored, or undefined while the session has none. */
  data: Record<string, unknown> | undefined;
  state: CantMakeItState;
};

/** The register of one session of a group: the address every word in advance writes to. */
function registerRef(db: Firestore, run: CourseRunDoc, group: CourseGroupDoc, session: ResolvedSession): DocumentReference {
  return db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence));
}

/** A register as read, as a line: what `readSessionLines` and the ticket's loader both make of a snapshot. */
function lineFrom(session: ResolvedSession, ref: DocumentReference, snap: DocumentSnapshot, uid: string, now: Date): SessionLine {
  const data = snap.exists ? (snap.data() ?? {}) : undefined;
  return { session, ref, data, state: stateOn(session, lineOf(data, ref.id, uid), now) };
}

/**
 * The registers of these sessions of the group, read inside `tx` (before it
 * writes anything), and where `uid` stands on each. Reads only.
 */
export async function readSessionLines(
  tx: Transaction,
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; uid: string; sessions: readonly ResolvedSession[]; now: Date },
): Promise<SessionLine[]> {
  const refs = input.sessions.map((session) => registerRef(db, input.run, input.group, session));
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
  return input.sessions.map((session, at) => lineFrom(session, refs[at], snaps[at], input.uid, input.now));
}

/**
 * The same registers read outside a transaction, for a page that only draws
 * where somebody stands (the card's list of sessions, the board's "They
 * meant some weeks"): one `getAll`, and nothing written.
 */
export async function readSessionLinesNow(
  db: Firestore,
  input: { run: CourseRunDoc; group: CourseGroupDoc; uid: string; sessions: readonly ResolvedSession[]; now: Date },
): Promise<SessionLine[]> {
  if (input.sessions.length === 0) return [];
  const refs = input.sessions.map((session) => registerRef(db, input.run, input.group, session));
  const snaps = await db.getAll(...refs);
  return input.sessions.map((session, at) => lineFrom(session, refs[at], snaps[at], input.uid, input.now));
}

/**
 * The group's sessions still to come that somebody may still say something
 * about, soonest first: those whose state is open (nothing on their line
 * yet) or told (excused on their word). A session started, called off, with
 * no day, finished, not held, or filled in by a facilitator is left out.
 */
export function stillToCome(lines: readonly SessionLine[]): SessionLine[] {
  return lines
    .filter((line) => line.state.kind === "open" || line.state.kind === "told")
    .sort((a, b) => (sessionInstants(a.session).startsAt?.getTime() ?? 0) - (sessionInstants(b.session).startsAt?.getTime() ?? 0));
}

/** "Tue 17 Nov": the day a session is on, as the ticket names it, or "" with none. */
export function sessionDay(session: ResolvedSession): string {
  const { startsAt } = sessionInstants(session);
  return startsAt ? londonDayLabel(startsAt) : "";
}

/** Room for one more line: the register's cap is a property of its whole map, as the marking route counts it. */
export function registerHasRoom(line: SessionLine): boolean {
  const records = (line.data?.records ?? {}) as Record<string, unknown>;
  return Object.keys(records).length + 1 <= ATTENDANCE_LIMITS.maxRecords;
}

/**
 * THE ONE WRITE OF A WORD IN ADVANCE: `uid` excused on this session's
 * register, with when they said so, and nothing else of the register. Only
 * on a line whose state is `open` and whose register has room
 * (`registerHasRoom`), which the caller has asked.
 *
 * `set` with `merge`: it makes the register when this is the session's first
 * line, and otherwise merges this one key into each map, so nobody else's
 * line is ever written. The parts of the id live as fields, as the marking
 * route writes them.
 *
 * AN APPROVED REQUEST TO BE EXCUSED, before its session, is written by this
 * same write (`src/lib/courses/excused/decide.ts`), so the register reads
 * exactly as "Can't make it" leaves it, and code that knows nothing of
 * requests reads it the same. Only who set the line differs: `setBy` names
 * the admin who approved it, `how: "approval"`, beside the person's own word
 * (`told`, when they asked).
 */
export function writeExcusedInAdvance(
  tx: Transaction,
  line: SessionLine,
  input: {
    run: CourseRunDoc;
    group: CourseGroupDoc;
    uid: string;
    told: Date | FieldValue;
    /** Set by an approval, not by the person's own word: who approved it, and when. */
    approvedBy?: { byUid: string; at: Date };
  },
): void {
  const { uid, told } = input;
  const setter = input.approvedBy
    ? { byUid: input.approvedBy.byUid, at: input.approvedBy.at, how: "approval" }
    : { byUid: uid, at: told, how: "self" };
  const { startsAt } = sessionInstants(line.session);
  tx.set(
    line.ref,
    {
      runId: input.run.id,
      groupId: input.group.id,
      weekNumber: line.session.weekNumber,
      occurrence: line.session.occurrence,
      records: { [uid]: "excused" },
      [EXCUSED_IN_ADVANCE]: { [uid]: told },
      // The line says who set it: the person's own word, before the session,
      // or the admin who approved their request to be excused.
      [SET_BY]: { [uid]: setter },
      ...(startsAt ? { sessionAt: startsAt } : {}),
    },
    { merge: true },
  );
}

/**
 * Whether an approval wrote `uid`'s line: an admin approved their request to
 * be excused from this session (`setBy.<uid>.how` is `approval`). Such a line
 * is not the person's own word, so nothing that takes a word back touches it:
 * not an old page's "I can make it after all", not unticking "Most weeks, not
 * all", not a new regular time. Only somebody correcting the register changes
 * it, and a facilitator's own mark on the day wins over it, as over any line.
 */
export function setByApproval(line: Pick<SessionLine, "data">, uid: string): boolean {
  const stamps = (line.data?.[SET_BY] ?? {}) as Record<string, unknown>;
  const stamp = Object.hasOwn(stamps, uid) ? stamps[uid] : null;
  return Boolean(stamp && typeof stamp === "object" && (stamp as { how?: unknown }).how === "approval");
}

/**
 * Taking a word in advance back: both keys of `uid`'s line, only on a line
 * whose state is `told`, and the stamp saying who set it, when it has one:
 * the line is empty again.
 *
 * A line an approval wrote is left as it is (`setByApproval`), whoever calls:
 * the answer is whether anything was taken back.
 */
export function writeTakenBack(tx: Transaction, line: SessionLine, uid: string): boolean {
  if (setByApproval(line, uid)) return false;
  const stamped = Object.hasOwn((line.data?.[SET_BY] ?? {}) as Record<string, unknown>, uid);
  tx.set(
    line.ref,
    {
      records: { [uid]: FieldValue.delete() },
      [EXCUSED_IN_ADVANCE]: { [uid]: FieldValue.delete() },
      ...(stamped ? { [SET_BY]: { [uid]: FieldValue.delete() } } : {}),
    },
    { merge: true },
  );
  return true;
}

/**
 * A "Most weeks, not all" answer about the group the seat is in lists the
 * sessions its person can't make, and the ticket keeps the list in step: a
 * session is listed while its register records them excused on their word.
 * Nothing else of the answer changes, and an answer of another kind, or
 * about another group, is left as it is.
 */
function keepListInStep(
  tx: Transaction,
  seatRef: DocumentReference,
  seat: CourseEnrolmentDoc,
  sessionKey: string,
  told: boolean,
): void {
  const answer = seat.timeAnswer;
  if (!answer || answer.kind !== "mostWeeks" || answer.forGroupId !== seat.groupId) return;
  if (answer.sessionKeys.includes(sessionKey) === told) return;
  const sessionKeys = told
    ? orderedSessionKeys([...answer.sessionKeys, sessionKey])
    : answer.sessionKeys.filter((key) => key !== sessionKey);
  tx.update(seatRef, { "timeAnswer.sessionKeys": sessionKeys, updatedAt: FieldValue.serverTimestamp() });
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
  return {
    groupId: group.id,
    sessionKey: next.sessionKey,
    day: sessionDay(next),
    told: state.kind === "told",
  };
}

export type CantMakeItOutcome =
  | { ok: true; told: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const refuse = (status: 400 | 403 | 404 | 409, error: string): CantMakeItOutcome => ({ ok: false, status, error });

const CLOSED: Record<Extract<CantMakeItState, { kind: "closed" }>["why"], string> = {
  started: CANT_MAKE_IT_REFUSAL.started,
  cancelled: CANT_MAKE_IT_REFUSAL.cancelled,
  undated: CANT_MAKE_IT_REFUSAL.noSession,
  finished: CANT_MAKE_IT_REFUSAL.finished,
  notHeld: CANT_MAKE_IT_REFUSAL.notHeld,
};

/**
 * Why one of the person's own sessions has nothing more to say about it, in
 * the ticket's words, for every press of their own that names a session
 * (the ticket, and the card's "Most weeks, not all").
 */
export function closedWords(state: Extract<CantMakeItState, { kind: "closed" }>): string {
  return CLOSED[state.why];
}

/**
 * The one press. Everything it decides on is read again inside the
 * transaction that writes: the run, the caller's own seat, their group and
 * the session's register. Saying it twice, or taking back what is not there,
 * changes nothing on the register and answers where they stand.
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
    // Saying it on the spot is a facilitator's only, on their own place in a
    // group they facilitate: anybody else taking part asks to be excused, and
    // an admin decides. Taking a line they wrote back stays open to everybody,
    // so nobody is left with a word they gave before requests.
    if (request.cantMakeIt && !group.facilitatorUids.includes(user.uid)) return refuse(403, CANT_MAKE_IT_REFUSAL.askInstead);

    // The session is one this group holds, by the group's own calendar.
    const session = resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey);
    if (!session) return refuse(400, CANT_MAKE_IT_REFUSAL.noSession);
    const [line] = await readSessionLines(tx, db, { run, group, uid: user.uid, sessions: [session], now });
    const state = line.state;
    if (state.kind === "closed") return refuse(409, CLOSED[state.why]);

    if (request.cantMakeIt) {
      if (state.kind === "marked") return refuse(409, CANT_MAKE_IT_REFUSAL.marked);
      // A request to be excused from it, waiting or declined, is not undone
      // on the person's own word.
      if (state.kind === "open") {
        const hold = (await excuseHoldsIn(tx, db, user.uid, run.id))(session.sessionKey);
        if (hold) return refuse(409, hold === "waiting" ? CANT_MAKE_IT_REFUSAL.askedWaiting : CANT_MAKE_IT_REFUSAL.askedDeclined);
      }
      if (state.kind === "open") {
        if (!registerHasRoom(line)) return refuse(409, CANT_MAKE_IT_REFUSAL.full);
        writeExcusedInAdvance(tx, line, { run, group, uid: user.uid, told: FieldValue.serverTimestamp() });
      }
      keepListInStep(tx, seatSnap.ref, seat, session.sessionKey, true);
      return { ok: true, told: true };
    }

    // Taking it back: only their own word, while it still stands. A line an
    // approval wrote is not their word: an old page still offering "I can
    // make it after all" is told they are excused, and that coming is enough.
    if (state.kind === "marked") return refuse(409, CANT_MAKE_IT_REFUSAL.marked);
    if (state.kind === "told" && setByApproval(line, user.uid)) return refuse(409, CANT_MAKE_IT_REFUSAL.approved);
    if (state.kind === "told") writeTakenBack(tx, line, user.uid);
    keepListInStep(tx, seatSnap.ref, seat, session.sessionKey, false);
    return { ok: true, told: false };
  });
}
