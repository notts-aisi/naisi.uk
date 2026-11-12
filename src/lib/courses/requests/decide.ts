import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, readNamingProgramme } from "@/lib/courses/programmeLead";
import {
  gateGroupRegister,
  isAddressableId,
  loadMirrorMembers,
  loadRegisterMembers,
  type RegisterGate,
} from "@/lib/courses/registerAccess";
import {
  CorrectionFullError,
  CorrectionMissingError,
  CorrectionNotHeldError,
  CorrectionUnfinishedError,
  namesGoneBy,
  readLineCorrection,
  writeLineCorrection,
} from "@/lib/courses/registerCorrection/line";
import {
  lineOf,
  parseAskedLine,
  parseCorrectionReason,
  sameLine,
  tidyLine,
  wordsOf,
  type RegisterLine,
} from "@/lib/courses/registerCorrection/model";
import {
  REQUEST_REFUSAL,
  askSameWords,
  lineChangedWords,
} from "@/lib/courses/registerCorrection/words";
import { resolveSessions, type ResolvedSession } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import {
  COURSE_REQUESTS_COLLECTION,
  COURSE_REQUEST_LIMITS,
  normalizeCourseRequest,
  type CourseRequestDoc,
  type CourseRequestEvent,
} from "@/lib/firestore/courseRequests";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * ASKING FOR A CORRECTION, AND DECIDING ONE: the request routes' work, so
 * each route is its gate's answer and nothing more.
 *
 *  - ASK (`askForCorrection`): a facilitator of the group with standing, for
 *    one line of a FINISHED register of a session that happened: what it
 *    should say, and why. Refused while the register is not finished (they
 *    can still change it themselves), when the line already says that, and
 *    when a request about that line is waiting already.
 *  - WITHDRAW: the person who asked, while it waits.
 *  - APPROVE: admins and the people leading the programme (the register's
 *    own gate, `leads`), never the person who asked. Applies the correction
 *    in the same transaction as the decision, with the request's reason and
 *    its id (`registerCorrection/line.ts`); refused, with the request left
 *    waiting, when the line no longer says what the request says it does.
 *  - DECLINE: the same people, with a reply to the person who asked.
 *  - TAKE IT: the same people: who is dealing with it.
 *
 * NOBODY IS EMAILED by any of them: the asker reads what became of it on the
 * register, the person on the line reads their corrected line.
 *
 * A REQUEST NAMES ITS RUN AND GROUP, and the deciding gate is asked of those,
 * so a lead decides their own programme's requests only. A request that is
 * missing, of a kind this build does not know, or about a group the caller
 * has no part in answers one 403 for everybody but an admin, who is told
 * it is missing.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string; detail?: Record<string, unknown> };

const fail = (status: number, error: string, detail?: Record<string, unknown>): { ok: false; status: number; error: string; detail?: Record<string, unknown> } => ({
  ok: false,
  status,
  error,
  ...(detail ? { detail } : {}),
});

/** Thrown inside a transaction, answered outside it. */
class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** "w03" or "w03-2", as its week and occurrence, or null. */
export function sessionKeyParts(key: string): { weekNumber: number; occurrence: number } | null {
  const match = /^w(\d{2})(?:-(\d))?$/.exec(key);
  if (!match) return null;
  const weekNumber = Number(match[1]);
  const occurrence = match[2] ? Number(match[2]) : 1;
  return weekNumber >= 1 && occurrence >= 1 ? { weekNumber, occurrence } : null;
}

async function readRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!runId || !isAddressableId(runId)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || snap.data()?.destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/** One entry of a request's history, as it is written. */
function event(what: CourseRequestEvent, byUid: string, at: Date) {
  return { what, byUid, at };
}

/** The history with one more entry, kept to its cap (the oldest go first, the asking stays). */
function withEvent(request: CourseRequestDoc, what: CourseRequestEvent, byUid: string, at: Date) {
  const entries = [...request.history, event(what, byUid, at)];
  while (entries.length > COURSE_REQUEST_LIMITS.history) entries.splice(1, 1);
  return entries;
}

// ---------------------------------------------------------------------------
// Ask
// ---------------------------------------------------------------------------

export type AskPress = {
  weekNumber: number;
  occurrence: number;
  uid: string;
  to: RegisterLine;
  reason: string;
};

const ASK_FIELDS = new Set(["weekNumber", "occurrence", "uid", "to", "reason"]);

/** What an ask asks for, checked before anything is read. */
export function parseAsk(raw: unknown): { ok: true; value: AskPress } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: REQUEST_REFUSAL.body };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!ASK_FIELDS.has(key)) return { ok: false, error: REQUEST_REFUSAL.body };
  const weekNumber = body.weekNumber;
  if (typeof weekNumber !== "number" || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 60) {
    return { ok: false, error: REQUEST_REFUSAL.week };
  }
  const occurrence = body.occurrence === undefined || body.occurrence === null ? 1 : body.occurrence;
  if (typeof occurrence !== "number" || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > 4) {
    return { ok: false, error: REQUEST_REFUSAL.week };
  }
  if (typeof body.uid !== "string" || !isAddressableId(body.uid) || body.uid.length > 128) return { ok: false, error: REQUEST_REFUSAL.person };
  const line = parseAskedLine(body.to);
  if (!line) return { ok: false, error: REQUEST_REFUSAL.to };
  const reason = parseCorrectionReason(body.reason, {
    preview: false,
    missing: REQUEST_REFUSAL.reason,
    empty: REQUEST_REFUSAL.reason,
    text: REQUEST_REFUSAL.reasonText,
    line: REQUEST_REFUSAL.reasonLine,
    link: REQUEST_REFUSAL.reasonLink,
  });
  if (!reason.ok) return { ok: false, error: reason.error };
  return { ok: true, value: { weekNumber, occurrence, uid: body.uid, to: line, reason: reason.value } };
}

/** What an ask answers. */
export type AskAnswer = { id: string; state: "waiting"; from: string; to: string; askedAt: string };

export async function askForCorrection(
  db: Firestore,
  actor: SessionUser,
  input: { gated: Extract<RegisterGate, { ok: true }>; press: AskPress; now: Date },
): Promise<Outcome<AskAnswer>> {
  const { gated, press, now } = input;
  const run = await readRun(db, gated.runId);
  if (!run) return fail(404, "Run not found");
  const session = resolveSessions(run, gated.group).find(
    (each) => each.weekNumber === press.weekNumber && each.occurrence === press.occurrence,
  );
  if (!session) return fail(400, `Week ${press.weekNumber} isn't a taught session of this group's schedule.`);
  if (session.cancelled) return fail(409, REQUEST_REFUSAL.notHeld);
  const [{ members }, naming] = await Promise.all([
    loadRegisterMembers(db, run.id, gated.group.id, { isAdmin: gated.isAdmin, role: actor.role }),
    readNamingProgramme(db, run.id),
  ]);
  const row = members.find((member) => member.uid === press.uid);
  if (!row || row.joinedWeekNumber > session.weekNumber) return fail(400, "Somebody in that request isn't on this register.");

  const registerRef = db.collection("courseAttendance").doc(attendanceDocId(run.id, gated.group.id, session.weekNumber, session.occurrence));
  const requestRef = db.collection(COURSE_REQUESTS_COLLECTION).doc();
  const to = tidyLine(press.to);
  let from: RegisterLine = { mark: null, online: false };
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(registerRef);
      if (!snap.exists) throw new Refused(409, REQUEST_REFUSAL.notFinished);
      const register = normalizeCourseAttendance(snap.id, snap.data() ?? {});
      if (!register.pushedAt) throw new Refused(409, REQUEST_REFUSAL.notFinished);
      if (!register.held) throw new Refused(409, REQUEST_REFUSAL.notHeld);
      from = lineOf(register, press.uid);
      if (sameLine(from, to)) throw new Refused(409, askSameWords(wordsOf(to)));
      // One request waiting for a line at a time: the group's requests, one
      // equality, read in the transaction so two asks at once cannot both land.
      const others = await tx.get(db.collection(COURSE_REQUESTS_COLLECTION).where("groupId", "==", gated.group.id));
      const waiting = others.docs
        .map((doc) => normalizeCourseRequest(doc.id, doc.data() ?? {}))
        .some(
          (each) =>
            each !== null &&
            each.status === "waiting" &&
            each.runId === run.id &&
            each.sessionKey === session.sessionKey &&
            each.subjectUid === press.uid,
        );
      if (waiting) throw new Refused(409, REQUEST_REFUSAL.waiting);
      tx.create(requestRef, {
        kind: "register-correction",
        runId: run.id,
        groupId: gated.group.id,
        roundId: naming?.roundId ?? null,
        programmeId: naming?.programmeId ?? null,
        sessionKey: session.sessionKey,
        weekId: session.weekId,
        subjectUid: press.uid,
        askedByUid: actor.uid,
        askedAt: now,
        change: { from, to },
        reason: press.reason,
        status: "waiting",
        handlingUid: null,
        handlingAt: null,
        decidedByUid: null,
        decidedAt: null,
        withdrawnAt: null,
        reply: "",
        history: [event("asked", actor.uid, now)],
        updatedAt: now,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return fail(err.status, err.message);
    throw err;
  }
  return { ok: true, value: { id: requestRef.id, state: "waiting", from: wordsOf(from), to: wordsOf(to), askedAt: now.toISOString() } };
}

// ---------------------------------------------------------------------------
// The deciding gate, and the four presses on a request
// ---------------------------------------------------------------------------

/** A request, and how the caller stands on its group's register. */
type Found = { request: CourseRequestDoc; gated: Extract<RegisterGate, { ok: true }> | null };

/**
 * The request and the caller's standing on its group. Missing, of a kind
 * this build does not know, or on a group the caller has no part in: one
 * 403 for everybody but an admin, who is told it is missing.
 */
async function findRequest(db: Firestore, actor: SessionUser, requestId: string): Promise<Outcome<Found>> {
  const missing = actor.role === "admin" ? fail(404, REQUEST_REFUSAL.notFound) : fail(403, "Forbidden");
  if (!isAddressableId(requestId) || requestId.length > 128) return missing;
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const request = snap.exists ? normalizeCourseRequest(snap.id, snap.data() ?? {}) : null;
  if (!request || !request.groupId || !request.runId) return missing;
  const gated = await gateGroupRegister(request.groupId, actor, db);
  return { ok: true, value: { request, gated: gated.ok && gated.runId === request.runId ? gated : null } };
}

/** Somebody who decides this request: an admin, or somebody leading its programme. Never the person who asked. */
async function findForDecision(db: Firestore, actor: SessionUser, requestId: string): Promise<Outcome<Found & { gated: Extract<RegisterGate, { ok: true }> }>> {
  const found = await findRequest(db, actor, requestId);
  if (!found.ok) return found;
  const { request, gated } = found.value;
  if (!gated || (!gated.isAdmin && !gated.leads)) {
    return actor.role === "admin" ? fail(404, REQUEST_REFUSAL.notFound) : fail(403, "Forbidden");
  }
  if (request.askedByUid === actor.uid) return fail(403, REQUEST_REFUSAL.ownRequest);
  return { ok: true, value: { request, gated } };
}

/** The refusal for a request that is no longer waiting. */
function notWaiting(request: CourseRequestDoc): { status: number; error: string } {
  return { status: 409, error: request.status === "withdrawn" ? REQUEST_REFUSAL.withdrawn : REQUEST_REFUSAL.decided };
}

/** Read the request again inside a transaction: it must still be waiting. */
async function waitingInTransaction(tx: FirebaseFirestore.Transaction, db: Firestore, id: string): Promise<CourseRequestDoc> {
  const snap = await tx.get(db.collection(COURSE_REQUESTS_COLLECTION).doc(id));
  const request = snap.exists ? normalizeCourseRequest(snap.id, snap.data() ?? {}) : null;
  if (!request) throw new Refused(409, REQUEST_REFUSAL.decided);
  if (request.status !== "waiting") {
    const why = notWaiting(request);
    throw new Refused(why.status, why.error);
  }
  return request;
}

/** Withdraw: the person who asked, while it waits. */
export async function withdrawRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ status: "withdrawn" }>> {
  const found = await findRequest(db, actor, requestId);
  if (!found.ok) return found;
  const { request, gated } = found.value;
  if (request.askedByUid !== actor.uid) {
    // Somebody who reads the group's register is told who withdraws; anybody else is told nothing.
    return gated || actor.role === "admin" ? fail(403, REQUEST_REFUSAL.notYours) : fail(403, "Forbidden");
  }
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await waitingInTransaction(tx, db, request.id);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(request.id), {
        status: "withdrawn",
        withdrawnAt: now,
        history: withEvent(fresh, "withdrawn", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return fail(err.status, err.message);
    throw err;
  }
  return { ok: true, value: { status: "withdrawn" } };
}

/** Take it: says who is dealing with it. */
export async function takeRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ handlingUid: string }>> {
  const found = await findForDecision(db, actor, requestId);
  if (!found.ok) return found;
  const { request } = found.value;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await waitingInTransaction(tx, db, request.id);
      if (fresh.handlingUid === actor.uid) throw new Refused(409, REQUEST_REFUSAL.alreadyYours);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(request.id), {
        handlingUid: actor.uid,
        handlingAt: now,
        history: withEvent(fresh, "taken", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return fail(err.status, err.message);
    throw err;
  }
  return { ok: true, value: { handlingUid: actor.uid } };
}

/** Parse a decline's reply: needed, one line, no link. */
export function parseReply(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!body) return { ok: false, error: REQUEST_REFUSAL.body };
  for (const key of Object.keys(body)) if (key !== "reply") return { ok: false, error: REQUEST_REFUSAL.body };
  return parseCorrectionReason(body.reply, {
    preview: false,
    missing: REQUEST_REFUSAL.reply,
    empty: REQUEST_REFUSAL.reply,
    text: REQUEST_REFUSAL.replyText,
    line: "The reply must be one line.",
    link: REQUEST_REFUSAL.replyLink,
    max: COURSE_REQUEST_LIMITS.reply,
    what: "reply",
  });
}

/** Decline, with a reply to the person who asked: the gate first, then the reply. */
export async function declineRequest(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<{ status: "declined" }>> {
  const found = await findForDecision(db, actor, requestId);
  if (!found.ok) return found;
  const { request } = found.value;
  const parsed = parseReply(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const reply = parsed.value;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await waitingInTransaction(tx, db, request.id);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(request.id), {
        status: "declined",
        decidedByUid: actor.uid,
        decidedAt: now,
        reply,
        history: withEvent(fresh, "declined", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return fail(err.status, err.message);
    throw err;
  }
  return { ok: true, value: { status: "declined" } };
}

/** The session a request is about, among the group's sessions now. */
function sessionOfRequest(run: CourseRunDoc, group: CourseGroupDoc, request: CourseRequestDoc): ResolvedSession | null {
  return resolveSessions(run, group).find((each) => each.sessionKey === request.sessionKey) ?? null;
}

/**
 * Approve: correct the line as asked, in the same transaction as the
 * decision, with the request's reason and its id. Refused, with the request
 * left waiting, when the line no longer says what the request says it did.
 */
export async function approveRequest(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  now: Date,
): Promise<Outcome<{ status: "approved"; logged: number }>> {
  const found = await findForDecision(db, actor, requestId);
  if (!found.ok) return found;
  const { request, gated } = found.value;
  if (request.status !== "waiting") {
    const why = notWaiting(request);
    return fail(why.status, why.error);
  }
  const run = await readRun(db, request.runId);
  if (!run) return fail(409, REQUEST_REFUSAL.gone);
  const group = gated.group;
  const session = sessionOfRequest(run, group, request);
  if (!session || session.cancelled) return fail(409, REQUEST_REFUSAL.gone);
  const { members } = await loadRegisterMembers(db, run.id, group.id, { isAdmin: gated.isAdmin, role: actor.role });
  const row = members.find((member) => member.uid === request.subjectUid);
  if (!row || row.joinedWeekNumber > session.weekNumber) return fail(409, REQUEST_REFUSAL.gone);

  const [mirrorMembers, names, askerSnap] = await Promise.all([
    loadMirrorMembers(db, run.id, group.id),
    namesGoneBy(db, [request.subjectUid]),
    db.collection("users").doc(request.askedByUid).get(),
  ]);
  const askerFirstName = askerSnap.exists ? firstNameOfUser(askerSnap.data() ?? {}) : "";
  const sessions = resolveSessions(run, group);
  const to = tidyLine(request.change.to);
  let logged = 0;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await waitingInTransaction(tx, db, request.id);
      const plan = await readLineCorrection(tx, db, {
        run,
        groupId: group.id,
        session,
        sessions,
        mirrorMembers,
        wanted: new Map([[fresh.subjectUid, { mark: to.mark, online: to.online }]]),
        now,
      });
      // The line must still say what the request says it did: otherwise the
      // approval would correct something nobody asked about.
      const nowSays = lineOf(plan.register, fresh.subjectUid);
      if (!sameLine(nowSays, fresh.change.from)) throw new Refused(409, lineChangedWords(wordsOf(nowSays)));
      logged = writeLineCorrection(tx, db, plan, {
        run,
        group,
        session,
        actor,
        reason: fresh.reason,
        names,
        asked: { requestId: fresh.id, firstName: askerFirstName, at: fresh.askedAt ?? now },
        notes: null,
        now,
      });
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        status: "approved",
        decidedByUid: actor.uid,
        decidedAt: now,
        history: withEvent(fresh, "approved", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    if (err instanceof Refused) return fail(err.status, err.message);
    if (
      err instanceof CorrectionMissingError ||
      err instanceof CorrectionUnfinishedError ||
      err instanceof CorrectionNotHeldError ||
      err instanceof CorrectionFullError
    ) {
      return fail(409, REQUEST_REFUSAL.gone);
    }
    throw err;
  }
  return { ok: true, value: { status: "approved", logged } };
}
