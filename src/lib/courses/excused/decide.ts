import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { writeExcusedInAdvance, type SessionLine } from "@/lib/courses/cantMakeIt/seat";
import { firstNameOfUser, standingUserOf } from "@/lib/courses/programmeLead";
import { displayNameOf, isAddressableId, loadMirrorMembers } from "@/lib/courses/registerAccess";
import {
  CorrectionFullError,
  CorrectionMissingError,
  CorrectionNotHeldError,
  CorrectionUnfinishedError,
  readLineCorrection,
  writeLineCorrection,
} from "@/lib/courses/registerCorrection/line";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { excusedGroupUrl, excusedPersonUrl, sendExcusedEmail, type ExcusedEmailOutcome } from "@/lib/email/excusedEmail";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { ATTENDANCE_LIMITS, SET_BY, attendanceDocId } from "@/lib/firestore/courseAttendance";
import {
  EXCUSED_LIMITS,
  excusedStatusOf,
  normalizeExcusedRequest,
  type ExcusedEvent,
  type ExcusedRegisterOutcome,
  type ExcusedRequestDoc,
  type ExcusedWeek,
} from "@/lib/firestore/courseExcusedRequests";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { COURSE_REQUESTS_COLLECTION, type CourseRequestStatus } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { excuseLineOf } from "./ask";
import { approvalPlan, parseDecision, parseReplyPress, parseWithdraw, type ApprovalPlan } from "./model";
import {
  EXCUSED_REFUSAL,
  approvedCorrectionDetail,
  approvedEmailWords,
  declinedEmailWords,
  facilitatorsEmailWords,
  replyEmailWords,
  sessionWhenWords,
  weekNotWaitingWords,
} from "./words";

/**
 * WITHDRAWING, APPROVING, DECLINING AND REPLYING TO A REQUEST TO BE EXCUSED:
 * the four routes' work, so each route is its gate's answer and nothing more.
 *
 *  - WITHDRAW: the person who asked, one week or every week still waiting.
 *    Changes nothing on a register; emails nobody.
 *  - APPROVE ONE WEEK: admins only, never the person who asked. In the SAME
 *    transaction as the decision, the register follows (`approvalPlan`):
 *    before the session the line says excused exactly as "Can't make it"
 *    writes it, set by the approval; on a register still being taken an
 *    empty or Absent line says excused; on a finished register Absent
 *    becomes Excused as a correction made by the approval (its history row,
 *    `corrected` stamp and figures, with the request's id and never the
 *    reason). A line that says they came, or already says excused, is left
 *    alone; the week is approved all the same. Emails the person, with the
 *    reply, and, while the register says excused, each of the group's
 *    facilitators with standing, without the reason.
 *  - DECLINE ONE WEEK: admins only, with a reply. Changes nothing on a
 *    register. Emails the person, with the reply.
 *  - REPLY WITHOUT DECIDING: admins only. The reply is kept on the request
 *    and emailed to the person.
 *
 * Each week is decided on its own: one request about several weeks sends
 * one email per decision.
 *
 * WHO IS TOLD WHAT A REQUEST IS. Somebody who is not an admin is refused
 * before anything is read, with one 403 whatever the id; an admin is told a
 * missing request is missing. Withdrawing is the asker's: anybody else who
 * is not an admin is told nothing either.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const fail = (status: 400 | 403 | 404 | 409, error: string): { ok: false; status: 400 | 403 | 404 | 409; error: string } => ({
  ok: false,
  status,
  error,
});

/** Thrown inside a transaction, answered outside it. */
class Refused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** A week as it is stored: every field, in the order the record keeps. */
function storedWeek(week: ExcusedWeek): Record<string, unknown> {
  return {
    sessionKey: week.sessionKey,
    weekId: week.weekId,
    weekNumber: week.weekNumber,
    occurrence: week.occurrence,
    dateKey: week.dateKey,
    asked: week.asked,
    offered: { online: week.offered.online },
    status: week.status,
    decidedByUid: week.decidedByUid,
    decidedAt: week.decidedAt,
    reply: week.reply,
    withdrawnAt: week.withdrawnAt,
    register: week.register,
  };
}

/** The history with one more entry, kept to its cap (the oldest go first, the asking stays). */
function withEvent(request: ExcusedRequestDoc, what: ExcusedEvent, byUid: string, at: Date, sessionKey: string | null) {
  const entries = [...request.history, { what, byUid, at, sessionKey }].map((entry) => ({
    what: entry.what,
    byUid: entry.byUid,
    at: entry.at,
    sessionKey: entry.sessionKey,
  }));
  while (entries.length > EXCUSED_LIMITS.history) entries.splice(1, 1);
  return entries;
}

/** The request's own fields once its weeks are as given. */
function requestFields(weeks: readonly ExcusedWeek[], now: Date): { status: CourseRequestStatus; withdrawnAt?: Date } {
  const status = excusedStatusOf(weeks);
  return status === "withdrawn" ? { status, withdrawnAt: now } : { status };
}

/** Read the request: a document of the excused kind, or nothing. */
async function readExcused(db: Firestore, requestId: string): Promise<ExcusedRequestDoc | null> {
  if (!isAddressableId(requestId) || requestId.length > 128) return null;
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  const request = snap.exists ? normalizeExcusedRequest(snap.id, snap.data() ?? {}) : null;
  return request && request.groupId && request.runId && request.subjectUid ? request : null;
}

/** Read it again inside a transaction. */
async function excusedInTransaction(tx: Transaction, db: Firestore, id: string): Promise<ExcusedRequestDoc> {
  const snap = await tx.get(db.collection(COURSE_REQUESTS_COLLECTION).doc(id));
  const request = snap.exists ? normalizeExcusedRequest(snap.id, snap.data() ?? {}) : null;
  if (!request) throw new Refused(409, EXCUSED_REFUSAL.notFound);
  return request;
}

/** The week this press names: in the request, and still waiting. */
function waitingWeek(request: ExcusedRequestDoc, sessionKey: string): ExcusedWeek {
  const week = request.weeks.find((each) => each.sessionKey === sessionKey);
  if (!week) throw new Refused(400, EXCUSED_REFUSAL.notInRequest);
  if (week.status !== "waiting") throw new Refused(409, weekNotWaitingWords(week.weekNumber, week.occurrence, week.status));
  return week;
}

/** An admin, for a request somebody else asked; anybody else learns nothing of it. */
async function forAdmin(db: Firestore, actor: SessionUser, requestId: string): Promise<Outcome<ExcusedRequestDoc>> {
  if (actor.role !== "admin") return fail(403, "Forbidden");
  const request = await readExcused(db, requestId);
  if (!request) return fail(404, EXCUSED_REFUSAL.notFound);
  if (request.askedByUid === actor.uid) return fail(403, EXCUSED_REFUSAL.ownRequest);
  return { ok: true, value: request };
}

function caught(err: unknown): { ok: false; status: 400 | 403 | 404 | 409; error: string } {
  if (err instanceof Refused) return fail(err.status, err.message);
  throw err;
}

// ---------------------------------------------------------------------------
// People, read before a transaction: names and addresses, never anything else
// ---------------------------------------------------------------------------

type Person = { uid: string; name: string; firstName: string; email: string };

async function people(db: Firestore, uids: readonly string[]): Promise<Map<string, Person & { data: Record<string, unknown> }>> {
  const wanted = [...new Set(uids)].filter((uid) => uid && isAddressableId(uid));
  const out = new Map<string, Person & { data: Record<string, unknown> }>();
  if (wanted.length === 0) return out;
  const snaps = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    out.set(snap.id, {
      uid: snap.id,
      name: displayNameOf(data),
      firstName: firstNameOfUser(data),
      email: typeof data.email === "string" ? data.email.trim() : "",
      data,
    });
  }
  return out;
}

/**
 * The group's facilitators an approval tells: each named on the group who
 * still stands behind the role and has an address, never the person the
 * request is about and never the admin pressing.
 */
export async function facilitatorsToTell(
  db: Firestore,
  group: Pick<CourseGroupDoc, "facilitatorUids">,
  exclude: readonly string[],
): Promise<Person[]> {
  const found = await people(db, group.facilitatorUids);
  const out: Person[] = [];
  for (const uid of group.facilitatorUids) {
    const person = found.get(uid);
    if (!person || exclude.includes(uid) || !person.email) continue;
    if (!isNamedWithStanding(standingUserOf(uid, person.data), "courseGroups.facilitatorUids", group.facilitatorUids)) continue;
    out.push({ uid, name: person.name, firstName: person.firstName, email: person.email });
  }
  return out;
}

async function readRunAndGroup(db: Firestore, request: ExcusedRequestDoc): Promise<{ run: CourseRunDoc; group: CourseGroupDoc } | null> {
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(request.runId).get(),
    db.collection("courseGroups").doc(request.groupId).get(),
  ]);
  if (!runSnap.exists || runSnap.data()?.destroying === true || !groupSnap.exists) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  return group.runId === run.id ? { run, group } : null;
}

const appUrl = (): string => process.env.NEXT_PUBLIC_APP_URL ?? "";

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

export type WeekState = { sessionKey: string; state: CourseRequestStatus };

export async function withdrawExcused(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<{ status: CourseRequestStatus; weeks: WeekState[] }>> {
  const request = await readExcused(db, requestId);
  if (!request) return actor.role === "admin" ? fail(404, EXCUSED_REFUSAL.notFound) : fail(403, "Forbidden");
  if (request.askedByUid !== actor.uid) return actor.role === "admin" ? fail(403, EXCUSED_REFUSAL.onlyAsker) : fail(403, "Forbidden");
  const parsed = parseWithdraw(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const press = parsed.value;
  try {
    const result = await db.runTransaction(async (tx) => {
      const fresh = await excusedInTransaction(tx, db, request.id);
      const keys = press.sessionKey ? [waitingWeek(fresh, press.sessionKey).sessionKey] : fresh.weeks.filter((week) => week.status === "waiting").map((week) => week.sessionKey);
      if (keys.length === 0) throw new Refused(409, EXCUSED_REFUSAL.nothingWaiting);
      const weeks = fresh.weeks.map((week) => (keys.includes(week.sessionKey) ? { ...week, status: "withdrawn" as const, withdrawnAt: now } : week));
      let history = fresh.history;
      for (const key of keys) history = withEvent({ ...fresh, history }, "withdrawn", actor.uid, now, key);
      const fields = requestFields(weeks, now);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        "change.weeks": weeks.map(storedWeek),
        ...fields,
        history,
        updatedAt: now,
      });
      return { status: fields.status, weeks: weeks.map((week) => ({ sessionKey: week.sessionKey, state: week.status })) };
    });
    return { ok: true, value: result };
  } catch (err) {
    return caught(err);
  }
}

// ---------------------------------------------------------------------------
// Approve one week
// ---------------------------------------------------------------------------

export type ApproveAnswer = {
  status: CourseRequestStatus;
  week: { sessionKey: string; state: "approved"; register: ExcusedRegisterOutcome };
  /** History rows written: one when a finished register's Absent became Excused, else none. */
  logged: number;
  emailed: { person: ExcusedEmailOutcome | "no-address"; facilitators: number };
};

export async function approveExcusedWeek(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<ApproveAnswer>> {
  const found = await forAdmin(db, actor, requestId);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseDecision(body, { replyNeeded: false });
  if (!parsed.ok) return fail(400, parsed.error);
  const press = parsed.value;
  try {
    waitingWeek(request, press.sessionKey);
  } catch (err) {
    return caught(err);
  }
  const both = await readRunAndGroup(db, request);
  if (!both) return fail(409, EXCUSED_REFUSAL.gone);
  const { run } = both;

  // Names and addresses, read before the transaction: never the reason.
  const [named, facilitators, mirrorMembers] = await Promise.all([
    people(db, [request.subjectUid, actor.uid]),
    facilitatorsToTell(db, both.group, [request.subjectUid, actor.uid]),
    loadMirrorMembers(db, run.id, request.groupId),
  ]);
  const person = named.get(request.subjectUid) ?? null;
  const deciderFirstName = named.get(actor.uid)?.firstName ?? "";

  type Done = { plan: ApprovalPlan; session: ResolvedSession | null; group: CourseGroupDoc; logged: number; status: CourseRequestStatus; outcome: ExcusedRegisterOutcome };
  let done: Done;
  try {
    done = await db.runTransaction(async (tx): Promise<Done> => {
      const fresh = await excusedInTransaction(tx, db, request.id);
      const week = waitingWeek(fresh, press.sessionKey);
      // The session, from the group as it is in this transaction.
      const groupSnap = await tx.get(db.collection("courseGroups").doc(fresh.groupId));
      if (!groupSnap.exists) throw new Refused(409, EXCUSED_REFUSAL.gone);
      const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
      const sessions = resolveSessions(run, group);
      const session = sessions.find((each) => each.sessionKey === week.sessionKey) ?? null;
      const registerRef = db
        .collection("courseAttendance")
        .doc(attendanceDocId(run.id, group.id, week.weekNumber, week.occurrence));
      const registerSnap = await tx.get(registerRef);
      const data = registerSnap.exists ? (registerSnap.data() ?? {}) : undefined;
      const line = excuseLineOf(data, registerRef.id, fresh.subjectUid);
      const { startsAt } = session ? sessionInstants(session) : { startsAt: null };
      let plan = approvalPlan({ startsAt, cancelled: !session || session.cancelled, line, now });
      // A register as full as a register may be takes no new line.
      const keys = Object.keys((data?.records ?? {}) as Record<string, unknown>);
      if (
        (plan.write === "in-advance" || plan.write === "draft") &&
        !keys.includes(fresh.subjectUid) &&
        keys.length + 1 > ATTENDANCE_LIMITS.maxRecords
      ) {
        plan = { write: "keep", outcome: "kept", say: plan.say, tellsFacilitators: false, kept: "full" };
      }

      // Every read before any write: a finished register's correction reads
      // the register again and everybody's figures here.
      const correction =
        plan.write === "correct" && session
          ? await readLineCorrection(tx, db, {
              run,
              groupId: group.id,
              session,
              sessions,
              mirrorMembers,
              wanted: new Map([[fresh.subjectUid, { mark: "excused" as const, online: undefined }]]),
              now,
            })
          : null;

      const emailedFirstNames = [
        ...(person?.email ? [person.firstName] : []),
        ...(plan.tellsFacilitators ? facilitators.map((each) => each.firstName) : []),
      ];
      let logged = 0;
      if (plan.write === "in-advance" && session) {
        const sessionLine: SessionLine = { session, ref: registerRef, data, state: { kind: "open" } };
        writeExcusedInAdvance(tx, sessionLine, {
          run,
          group,
          uid: fresh.subjectUid,
          // When they told us: when they asked.
          told: fresh.askedAt ?? now,
          approvedBy: { byUid: actor.uid, at: now },
        });
      } else if (plan.write === "draft") {
        // A register still being taken: the line says excused, set by the
        // approval. Its facilitators' own entry still wins afterwards. The
        // line said nothing, or Absent, so it keeps no place in the room or
        // online to clear.
        tx.set(
          registerRef,
          {
            runId: run.id,
            groupId: group.id,
            weekNumber: week.weekNumber,
            occurrence: week.occurrence,
            records: { [fresh.subjectUid]: "excused" },
            [SET_BY]: { [fresh.subjectUid]: { byUid: actor.uid, at: now, how: "approval" } },
          },
          { merge: true },
        );
      } else if (correction && session) {
        logged = writeLineCorrection(tx, db, correction, {
          run,
          group,
          session,
          actor,
          reason: "",
          names: new Map([[fresh.subjectUid, person?.name || "NAISI member"]]),
          asked: null,
          notes: null,
          now,
          approval: {
            requestId: fresh.id,
            detail: () =>
              approvedCorrectionDetail({
                deciderFirstName,
                personName: person?.name ?? "",
                weekNumber: week.weekNumber,
                occurrence: week.occurrence,
                emailedFirstNames,
              }),
            emailed: emailedFirstNames.length,
          },
        });
      }

      const outcome: ExcusedRegisterOutcome = plan.write === "correct" && logged === 0 ? "kept" : plan.outcome;
      const weeks = fresh.weeks.map((each) =>
        each.sessionKey === week.sessionKey
          ? { ...each, status: "approved" as const, decidedByUid: actor.uid, decidedAt: now, reply: press.reply, register: outcome }
          : each,
      );
      const fields = requestFields(weeks, now);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        "change.weeks": weeks.map(storedWeek),
        ...fields,
        decidedByUid: actor.uid,
        decidedAt: now,
        ...(press.reply ? { reply: press.reply } : {}),
        history: withEvent(fresh, "approved", actor.uid, now, week.sessionKey),
        updatedAt: now,
      });
      return { plan, session, group, logged, status: fields.status, outcome };
    });
  } catch (err) {
    if (
      err instanceof CorrectionMissingError ||
      err instanceof CorrectionUnfinishedError ||
      err instanceof CorrectionNotHeldError ||
      err instanceof CorrectionFullError
    ) {
      return fail(409, EXCUSED_REFUSAL.changed);
    }
    return caught(err);
  }

  const week = request.weeks.find((each) => each.sessionKey === press.sessionKey) as ExcusedWeek;
  // The register says excused once it is done: the facilitators are told so.
  const tells = done.plan.tellsFacilitators;

  // The emails, after the decision is written: one to the person, with the
  // reply; one to each facilitator while the register says excused, never
  // the reason. A failed email never reads as a failed decision.
  const dateKey = done.session?.dateKey ?? week.dateKey;
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person?.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: run.id,
      audience: "person",
      link: excusedPersonUrl(appUrl(), run.id),
      words: approvedEmailWords({
        weekNumber: week.weekNumber,
        occurrence: week.occurrence,
        groupName: done.group.name,
        when: sessionWhenWords(dateKey, done.session?.session.startTimeLocal ?? ""),
        deciderFirstName,
        reply: press.reply,
        outcome: done.plan.say,
        facilitatorFirstNames: tells ? facilitators.map((each) => each.firstName) : [],
      }),
    });
  }
  let facilitatorsEmailed = 0;
  if (tells) {
    for (const facilitator of facilitators) {
      const sent = await sendExcusedEmail({
        to: facilitator.email,
        name: facilitator.firstName,
        actorUid: actor.uid,
        runId: run.id,
        audience: "facilitator",
        link: excusedGroupUrl(appUrl(), run.id, done.group.id),
        words: facilitatorsEmailWords({
          personName: person?.name ?? "",
          personFirstName: person?.firstName ?? "",
          weekNumber: week.weekNumber,
          occurrence: week.occurrence,
          day: dayWords(dateKey),
          already: done.plan.say !== "before",
        }),
      });
      if (sent === "sent") facilitatorsEmailed += 1;
    }
  }
  return {
    ok: true,
    value: {
      status: done.status,
      week: { sessionKey: press.sessionKey, state: "approved", register: done.outcome },
      logged: done.logged,
      emailed: { person: personOutcome, facilitators: facilitatorsEmailed },
    },
  };
}

// ---------------------------------------------------------------------------
// Decline one week
// ---------------------------------------------------------------------------

export type DeclineAnswer = {
  status: CourseRequestStatus;
  week: { sessionKey: string; state: "declined" };
  emailed: { person: ExcusedEmailOutcome | "no-address" };
};

export async function declineExcusedWeek(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<DeclineAnswer>> {
  const found = await forAdmin(db, actor, requestId);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseDecision(body, { replyNeeded: true });
  if (!parsed.ok) return fail(400, parsed.error);
  const press = parsed.value;
  let status: CourseRequestStatus = "waiting";
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await excusedInTransaction(tx, db, request.id);
      const week = waitingWeek(fresh, press.sessionKey);
      const weeks = fresh.weeks.map((each) =>
        each.sessionKey === week.sessionKey
          ? { ...each, status: "declined" as const, decidedByUid: actor.uid, decidedAt: now, reply: press.reply }
          : each,
      );
      const fields = requestFields(weeks, now);
      status = fields.status;
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        "change.weeks": weeks.map(storedWeek),
        ...fields,
        decidedByUid: actor.uid,
        decidedAt: now,
        reply: press.reply,
        history: withEvent(fresh, "declined", actor.uid, now, week.sessionKey),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }

  // The email says where the session stands now: still to come, met and
  // finished as Absent, or met and still being taken. Read after the
  // decision; a read that fails says the plainest of the three.
  const week = request.weeks.find((each) => each.sessionKey === press.sessionKey) as ExcusedWeek;
  const both = await readRunAndGroup(db, request).catch(() => null);
  const session = both ? (resolveSessions(both.run, both.group).find((each) => each.sessionKey === week.sessionKey) ?? null) : null;
  const startsAt = session ? sessionInstants(session).startsAt : null;
  let where: "before" | "absent" | "after" = "after";
  if (startsAt && startsAt.getTime() > now.getTime()) where = "before";
  else if (both) {
    const ref = db.collection("courseAttendance").doc(attendanceDocId(both.run.id, both.group.id, week.weekNumber, week.occurrence));
    const snap = await ref.get().catch(() => null);
    const line = excuseLineOf(snap?.exists ? snap.data() : undefined, ref.id, request.subjectUid);
    if (line.finished && line.mark === "absent") where = "absent";
  }
  const named = await people(db, [request.subjectUid, actor.uid]);
  const person = named.get(request.subjectUid);
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person?.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: request.runId,
      audience: "person",
      link: excusedPersonUrl(appUrl(), request.runId),
      words: declinedEmailWords({
        weekNumber: week.weekNumber,
        occurrence: week.occurrence,
        day: dayWords(session?.dateKey ?? week.dateKey),
        deciderFirstName: named.get(actor.uid)?.firstName ?? "",
        reply: press.reply,
        session: where,
      }),
    });
  }
  return { ok: true, value: { status, week: { sessionKey: press.sessionKey, state: "declined" }, emailed: { person: personOutcome } } };
}

// ---------------------------------------------------------------------------
// Reply without deciding
// ---------------------------------------------------------------------------

export type ReplyAnswer = { status: CourseRequestStatus; replied: true; emailed: { person: ExcusedEmailOutcome | "no-address" } };

export async function replyToExcused(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<ReplyAnswer>> {
  const found = await forAdmin(db, actor, requestId);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseReplyPress(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const { reply } = parsed.value;
  let fresh: ExcusedRequestDoc = request;
  try {
    await db.runTransaction(async (tx) => {
      fresh = await excusedInTransaction(tx, db, request.id);
      if (fresh.replies.length >= EXCUSED_LIMITS.replies) throw new Refused(409, EXCUSED_REFUSAL.tooManyReplies);
      const replies = [...fresh.replies, { text: reply, byUid: actor.uid, at: now }];
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        "change.replies": replies.map((each) => ({ text: each.text, byUid: each.byUid, at: each.at })),
        reply,
        history: withEvent(fresh, "replied", actor.uid, now, null),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  const named = await people(db, [request.subjectUid, actor.uid]);
  const person = named.get(request.subjectUid);
  const waiting = fresh.weeks.filter((week) => week.status === "waiting");
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person?.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: request.runId,
      audience: "person",
      link: excusedPersonUrl(appUrl(), request.runId),
      words: replyEmailWords({
        weekNumbers: (waiting.length > 0 ? waiting : fresh.weeks).map((week) => week.weekNumber),
        deciderFirstName: named.get(actor.uid)?.firstName ?? "",
        reply,
        waiting: waiting.length > 0,
      }),
    });
  }
  return { ok: true, value: { status: fresh.status, replied: true, emailed: { person: personOutcome } } };
}
