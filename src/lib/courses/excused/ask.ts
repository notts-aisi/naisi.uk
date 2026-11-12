import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { takesPartIn } from "@/lib/courses/cantMakeIt/seat";
import { heldOnline } from "@/lib/courses/joiningOnline/model";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { workClosesAt } from "@/lib/courses/weekWork/closes";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import {
  EXCUSED_KIND,
  normalizeExcusedRequest,
  type ExcusedAsked,
  type ExcusedRequestDoc,
} from "@/lib/firestore/courseExcusedRequests";
import {
  campusForWeek,
  normalizeCourseGroup,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  askState,
  requestStandingOf,
  weeksAbout,
  NO_LINE,
  type AskPress,
  type ExcuseLine,
} from "./model";
import { EXCUSED_REFUSAL, askClosedWords } from "./words";

/**
 * ASKING TO BE EXCUSED FROM ONE WEEK OR SEVERAL: the ask route's work.
 *
 * WHO. Somebody holding a told place in the group, by their own uid
 * (`takesPartIn`, the rule "Can't make it" asks), about sessions of their
 * own group they are due at (from the week they joined). Not somebody who
 * facilitates the group, who keeps what they have today: the instant "Can't
 * make it" on their own place, which records them as excused on the spot.
 * Nobody asks for anybody else: there is no way to spell another person.
 *
 * WHICH SESSIONS, AND WHEN: `askState` for each, until the programme closes
 * (`workClosesAt`, the one moment every week of the run shuts). Every
 * session named must be open, or the whole ask is refused with the first
 * session's reason, so a request never holds a week nobody could ask about.
 *
 * WHAT IT WRITES: one `courseRequests` document of kind `excused`, in a
 * transaction that reads the group, the run, the place, each session's
 * register and the person's own requests (one equality on `subjectUid`)
 * first, so two asks at once cannot both land on the same week. NOTHING ON
 * ANY REGISTER: a waiting request never holds a register up. Nobody is
 * emailed.
 */

export type AskOutcome =
  | {
      ok: true;
      request: {
        id: string;
        askedAt: string;
        weeks: { sessionKey: string; weekNumber: number; occurrence: number; dateKey: string; asked: ExcusedAsked; state: "waiting" }[];
      };
    }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const refuse = (status: 400 | 403 | 404 | 409, error: string): AskOutcome => ({ ok: false, status, error });

/** Most groups a run holds: one equality, read for when the programme closes. */
const MAX_GROUPS = 100;
/** Most requests one person has made: a term holds a handful. */
const MAX_OWN = 200;

/** Whether one session of the group is held online for everybody, from its own week (as joining online asks). */
function sessionHeldOnline(group: CourseGroupDoc, session: ResolvedSession): boolean {
  const mode = session.occurrence === 1 ? sessionModeForWeek(group, session.weekId) : null;
  const campus = session.occurrence === 1 ? campusForWeek(group, session.weekId) : group.campus;
  return heldOnline({ mode, campus, room: session.session.location });
}

/** One person's line of one register, as `askState` asks it. */
export function excuseLineOf(data: Record<string, unknown> | undefined, id: string, uid: string): ExcuseLine & { toldAt: Date | null } {
  if (!data) return { ...NO_LINE, toldAt: null };
  const register = normalizeCourseAttendance(id, data);
  return {
    finished: register.pushedAt !== null,
    notHeld: !register.held,
    mark: register.records[uid] ?? null,
    toldAt: register.excusedInAdvance[uid] ?? null,
  };
}

/** Every excused request this person made on this run, read in `tx` (one equality on `subjectUid`). */
export async function ownRequestsIn(tx: Transaction | null, db: Firestore, uid: string, runId: string): Promise<ExcusedRequestDoc[]> {
  const query = db.collection(COURSE_REQUESTS_COLLECTION).where("subjectUid", "==", uid).limit(MAX_OWN);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs
    .map((doc) => normalizeExcusedRequest(doc.id, doc.data() ?? {}))
    .filter((each): each is ExcusedRequestDoc => each !== null && each.runId === runId && each.subjectUid === uid);
}

/** When the run closes, from its live groups: one equality on `runId`. Null with no session to date. */
export async function runClosesAt(db: Firestore, run: CourseRunDoc): Promise<Date | null> {
  const snap = await db.collection("courseGroups").where("runId", "==", run.id).limit(MAX_GROUPS).get();
  const live = snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => !group.archived);
  return workClosesAt(run, live);
}

export async function askToBeExcused(
  db: Firestore,
  user: SessionUser,
  groupId: string,
  press: AskPress,
  now: Date,
): Promise<AskOutcome> {
  const groupRef = db.collection("courseGroups").doc(groupId);
  // When the programme closes is days from any session, read before the
  // transaction; everything a week is decided on is read inside it.
  const before = await groupRef.get();
  if (!before.exists) return refuse(404, EXCUSED_REFUSAL.notYours);
  const runIdBefore = normalizeCourseGroup(before.id, before.data() ?? {}).runId;
  if (!runIdBefore || runIdBefore.includes("/")) return refuse(404, EXCUSED_REFUSAL.notYours);
  const runBefore = await db.collection("courseRuns").doc(runIdBefore).get();
  if (!runBefore.exists || runBefore.data()?.destroying === true) return refuse(404, EXCUSED_REFUSAL.notYours);
  const [closesAt, naming] = await Promise.all([
    runClosesAt(db, normalizeCourseRun(runBefore.id, runBefore.data() ?? {})),
    readNamingProgramme(db, runIdBefore),
  ]);

  const requestRef = db.collection(COURSE_REQUESTS_COLLECTION).doc();
  return db.runTransaction(async (tx): Promise<AskOutcome> => {
    const groupSnap = await tx.get(groupRef);
    // A group that is not there is answered as one that is not theirs, so
    // probing ids says nothing about which groups exist.
    if (!groupSnap.exists) return refuse(404, EXCUSED_REFUSAL.notYours);
    const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
    if (!group.runId || group.runId !== runIdBefore) return refuse(404, EXCUSED_REFUSAL.notYours);
    const [runSnap, seatSnap] = await Promise.all([
      tx.get(db.collection("courseRuns").doc(group.runId)),
      tx.get(db.collection("courseEnrolments").doc(courseEnrolmentId(group.runId, user.uid))),
    ]);
    if (!runSnap.exists || runSnap.data()?.destroying === true || !seatSnap.exists) return refuse(404, EXCUSED_REFUSAL.notYours);
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
    // Their own place, told them by Publish and held to the live bar, here as
    // `takesPartIn` holds it.
    if (!takesPartIn(user, seat, group, run.id) || !placementIsTold(seat) || !isNamedWithStanding(user, "courseEnrolments.uid", seat.uid)) {
      return refuse(404, EXCUSED_REFUSAL.notYours);
    }
    // Somebody who facilitates the group keeps today's "Can't make it".
    if (group.facilitatorUids.includes(user.uid)) return refuse(403, EXCUSED_REFUSAL.facilitates);
    if (closesAt && now.getTime() >= closesAt.getTime()) return refuse(409, EXCUSED_REFUSAL.closed);

    // The sessions, by the group's own calendar as it is in this transaction.
    const all = resolveSessions(run, group);
    const sessions: ResolvedSession[] = [];
    for (const key of press.sessionKeys) {
      const session = all.find((each) => each.sessionKey === key);
      const parts = /^w(\d{2})(?:-(\d))?$/.exec(key);
      const weekNumber = parts ? Number(parts[1]) : 0;
      if (!session || session.weekNumber < seat.joinedWeekNumber) {
        return refuse(400, askClosedWords("not-yours", session?.weekNumber ?? weekNumber, session?.occurrence ?? 1));
      }
      sessions.push(session);
    }
    sessions.sort((a, b) => a.weekNumber - b.weekNumber || a.occurrence - b.occurrence);

    const registerRefs = sessions.map((session) =>
      db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence)),
    );
    const [registerSnaps, own] = await Promise.all([
      Promise.all(registerRefs.map((ref) => tx.get(ref))),
      ownRequestsIn(tx, db, user.uid, run.id),
    ]);

    const weeks: Record<string, unknown>[] = [];
    const answer: Extract<AskOutcome, { ok: true }>["request"]["weeks"] = [];
    for (const [at, session] of sessions.entries()) {
      const snap = registerSnaps[at];
      const line = excuseLineOf(snap.exists ? snap.data() : undefined, snap.id, user.uid);
      const { startsAt } = sessionInstants(session);
      const state = askState({
        startsAt,
        cancelled: session.cancelled,
        line,
        standing: requestStandingOf(weeksAbout(own, user.uid, session.sessionKey)),
        now,
      });
      if (!state.open) return refuse(409, askClosedWords(state.why, session.weekNumber, session.occurrence));
      // Joining online was open to them for this session: the flow offers it
      // first, where the session is in a room and has not started.
      const online = state.when === "before" && !sessionHeldOnline(group, session) && line.mark === null;
      weeks.push({
        sessionKey: session.sessionKey,
        weekId: session.weekId,
        weekNumber: session.weekNumber,
        occurrence: session.occurrence,
        dateKey: session.dateKey,
        asked: state.when,
        offered: { online },
        status: "waiting",
        decidedByUid: null,
        decidedAt: null,
        reply: "",
        withdrawnAt: null,
        register: null,
      });
      answer.push({
        sessionKey: session.sessionKey,
        weekNumber: session.weekNumber,
        occurrence: session.occurrence,
        dateKey: session.dateKey,
        asked: state.when,
        state: "waiting",
      });
    }

    const first = sessions[0];
    tx.create(requestRef, {
      kind: EXCUSED_KIND,
      runId: run.id,
      groupId: group.id,
      roundId: naming?.roundId ?? null,
      programmeId: naming?.programmeId ?? null,
      sessionKey: first.sessionKey,
      weekId: first.weekId,
      subjectUid: user.uid,
      askedByUid: user.uid,
      askedAt: now,
      change: { weeks, replies: [] },
      reason: press.reason,
      // Kept until the programme closes: the job that deletes it reads this.
      reasonHeld: true,
      status: "waiting",
      handlingUid: null,
      handlingAt: null,
      decidedByUid: null,
      decidedAt: null,
      withdrawnAt: null,
      reply: "",
      history: [{ what: "asked", byUid: user.uid, at: now, sessionKey: null }],
      updatedAt: now,
    });
    return { ok: true, request: { id: requestRef.id, askedAt: now.toISOString(), weeks: answer } };
  });
}
