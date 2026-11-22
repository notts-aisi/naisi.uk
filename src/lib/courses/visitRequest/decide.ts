import "server-only";
import type { DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isAddressableId } from "@/lib/courses/registerAccess";
import { REQUEST_REFUSAL } from "@/lib/courses/registerCorrection/words";
import { excusedPersonUrl, sendExcusedEmail, type ExcusedEmailOutcome } from "@/lib/email/excusedEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import {
  MEMBER_REQUEST_LIMITS,
  normalizeVisitRequest,
  storedReplies,
  withMemberEvent,
  type MemberRequestBase,
  type VisitRequestDoc,
} from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { EXCUSED_REFUSAL } from "../excused/words";
import { dbReader, excusedAtHomeIn, ownSessionThatWeek, readVisitFacts } from "../visit/plan";
import { arrangeVisit, type VisitSaveAnswer } from "../visit/save";
import { personEmailWords } from "../visit/words";
import { parseApprove, parseReplyBody } from "./model";
import { visitRequestStandingRead, type VisitRequestStanding } from "./standing";
import {
  WITHDRAW_REFUSAL,
  NOTHING_TO_DISMISS,
  approvedPersonEmailParts,
  closedStaffWords,
  declinedEmailWords,
  goneStaffWords,
  notWaitingWords,
  replyEmailWords,
} from "./words";

/**
 * DECIDING, REPLYING TO, TAKING, WITHDRAWING AND DISMISSING A REQUEST TO GO TO
 * ANOTHER SESSION: the routes' work, so each route is its gate's answer and
 * nothing more.
 *
 *  - APPROVE: ADMINS ONLY, never the person who asked. Arranges the visit
 *    through the staff visit's own writer (`arrangeVisit`), whose
 *    transaction writes this request's decision with the visit, after
 *    reading the request again: a visit is never written without its
 *    decision nor a decision without its visit, and a withdraw or a second
 *    press racing it cannot both land. Everything that writer refuses is
 *    refused here in its own sentence (a session that filled since the ask
 *    is approved only with its over-the-limit warning shown; the count on
 *    the button is checked again at the press; the limits on its emails).
 *    The person is sent the staff visit's email with the approved first
 *    sentence and the reply; both groups' facilitators exactly what the staff
 *    visit sends. With "I’d join online" ticked, the same transaction puts
 *    the person's word on the host's register for that session, as their own
 *    press would, stamped as emailed, and the host's facilitators' email
 *    carries the approved lines about it; no second email goes.
 *  - DECLINE: admins only, with a reply. Writes the decision, no visit.
 *    Emails the person.
 *  - REPLY WITHOUT DECIDING: admins only. The request keeps waiting; the
 *    reply is kept on it and emailed to the person. More than once.
 *  - TAKE IT: admins only. Says who is dealing with it. Emails nobody.
 *  - WITHDRAW: the person who asked, while it waits. Emails nobody.
 *  - DISMISS: the person who asked, on a decline's message. Emails nobody.
 *
 * A request that closed by itself (nobody decided it before the earlier of
 * the two sessions started) or went with the person's place is decided,
 * replied to, taken and withdrawn by nobody: each is refused in one sentence,
 * and nobody is emailed.
 *
 * WHO IS TOLD WHAT A REQUEST IS: somebody who is not an admin is refused
 * before anything is read, with one 403 whatever the id; an admin is told a
 * missing request is missing. Withdrawing and dismissing are the asker's:
 * anybody else who is not an admin is told nothing either.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string; extra?: Record<string, unknown> };

export const fail = (status: number, error: string, extra?: Record<string, unknown>): { ok: false; status: number; error: string; extra?: Record<string, unknown> } => ({
  ok: false,
  status,
  error,
  ...(extra ? { extra } : {}),
});

export class Refused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function caught(err: unknown): { ok: false; status: number; error: string } {
  if (err instanceof Refused) return fail(err.status, err.message);
  throw err;
}

const appUrl = (): string => process.env.NEXT_PUBLIC_APP_URL ?? "";

/** A kind's own reader: a stored document as that kind, or null for any other. */
export type KindReader<T extends MemberRequestBase> = (id: string, data: Record<string, unknown>) => T | null;

async function readKind<T extends MemberRequestBase>(db: Firestore, requestId: string, reader: KindReader<T>): Promise<T | null> {
  if (!isAddressableId(requestId) || requestId.length > 128) return null;
  const snap = await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get();
  return snap.exists ? reader(snap.id, snap.data() ?? {}) : null;
}

export async function kindInTransaction<T extends MemberRequestBase>(tx: Transaction, db: Firestore, id: string, reader: KindReader<T>): Promise<T> {
  const snap = await tx.get(db.collection(COURSE_REQUESTS_COLLECTION).doc(id));
  const request = snap.exists ? reader(snap.id, snap.data() ?? {}) : null;
  if (!request) throw new Refused(409, EXCUSED_REFUSAL.notFound);
  return request;
}

/** An admin, for a request somebody else asked; anybody else learns nothing of it. Every kind's deciding routes ask it. */
export async function forAdmin<T extends MemberRequestBase>(db: Firestore, actor: SessionUser, requestId: string, reader: KindReader<T>): Promise<Outcome<T>> {
  if (actor.role !== "admin") return fail(403, "Forbidden");
  const request = await readKind(db, requestId, reader);
  if (!request) return fail(404, EXCUSED_REFUSAL.notFound);
  if (request.askedByUid === actor.uid) return fail(403, EXCUSED_REFUSAL.ownRequest);
  return { ok: true, value: request };
}

/** The asker, for their own request; an admin is told it is not theirs, anybody else nothing. Every kind's withdraw and dismiss ask it. */
export async function forAsker<T extends MemberRequestBase>(db: Firestore, actor: SessionUser, requestId: string, reader: KindReader<T>): Promise<Outcome<T>> {
  const request = await readKind(db, requestId, reader);
  if (!request) return actor.role === "admin" ? fail(404, EXCUSED_REFUSAL.notFound) : fail(403, "Forbidden");
  if (request.askedByUid !== actor.uid) return actor.role === "admin" ? fail(403, WITHDRAW_REFUSAL.notYours) : fail(403, "Forbidden");
  return { ok: true, value: request };
}

/** Where a visit request stands now, read in `tx`: its run, the run's groups and the person's place. */
async function standingIn(tx: Transaction, db: Firestore, request: VisitRequestDoc, now: Date): Promise<VisitRequestStanding> {
  const [runSnap, placeSnap, groupSnap] = await Promise.all([
    tx.get(db.collection("courseRuns").doc(request.runId)),
    tx.get(db.collection("courseEnrolments").doc(courseEnrolmentId(request.runId, request.subjectUid))),
    tx.get(db.collection("courseGroups").where("runId", "==", request.runId)),
  ]);
  if (!runSnap.exists || runSnap.data()?.destroying === true) return { state: "gone" };
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === run.id);
  const place = placeSnap.exists ? normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {}) : null;
  // The host's register that week, as every reader reads it.
  return visitRequestStandingRead((ref) => tx.get(ref), db, { request, run, groups, place, now });
}

/** The person's first name, from their account: "" with none. */
export async function firstNameOf(db: Firestore, uid: string): Promise<{ firstName: string; email: string }> {
  if (!isAddressableId(uid)) return { firstName: "", email: "" };
  const snap: DocumentSnapshot = await db.collection("users").doc(uid).get();
  const data = (snap.exists ? snap.data() : {}) ?? {};
  return { firstName: firstNameOfUser(data), email: typeof data.email === "string" ? data.email.trim() : "" };
}

/** Refuses anything but a request still waiting, live: decided, withdrawn, closed by itself, or gone with the place. */
function stillWaiting(request: VisitRequestDoc, standing: VisitRequestStanding, personFirstName: string): void {
  if (request.status !== "waiting") throw new Refused(409, notWaitingWords(request.status));
  if (standing.state === "closed") throw new Refused(409, closedStaffWords(standing.lapse));
  if (standing.state === "gone") throw new Refused(409, goneStaffWords(personFirstName));
}

/** The stored fields of a decision. */
function decisionFields(request: VisitRequestDoc, status: "approved" | "declined", actor: SessionUser, reply: string, now: Date): Record<string, unknown> {
  return {
    status,
    decidedByUid: actor.uid,
    decidedAt: now,
    reply,
    history: withMemberEvent(request.history, status, actor.uid, now),
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------

export type VisitApproveAnswer = Omit<VisitSaveAnswer, "ok"> & { status: "approved" };

export async function approveVisitRequest(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<VisitApproveAnswer>> {
  const found = await forAdmin(db, actor, requestId, normalizeVisitRequest);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseApprove(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const press = parsed.value;
  const [decider, person] = await Promise.all([firstNameOf(db, actor.uid), firstNameOf(db, request.subjectUid)]);
  // Decided, withdrawn, closed by itself or gone: said in this request's own
  // sentence before the visit's checks are asked (and asked again inside the save).
  try {
    await db.runTransaction(async (tx) => stillWaiting(request, await standingIn(tx, db, request, now), person.firstName));
  } catch (err) {
    return caught(err);
  }
  const ref = db.collection(COURSE_REQUESTS_COLLECTION).doc(request.id);
  const saved = await arrangeVisit(db, {
    runId: request.runId,
    uid: request.subjectUid,
    weekNumber: request.change.weekNumber,
    hostGroupId: request.change.hostGroupId,
    emailCount: press.emailCount,
    overLimit: press.overLimit,
    // Nothing of the person's own words goes into either group's history.
    reason: "",
    actor,
    now,
    approves: {
      requestId: request.id,
      inTransaction: async (tx) => {
        try {
          const fresh = await kindInTransaction(tx, db, request.id, normalizeVisitRequest);
          stillWaiting(fresh, await standingIn(tx, db, fresh, now), person.firstName);
          return { ok: true, write: () => tx.update(ref, decisionFields(fresh, "approved", actor, press.reply, now)) };
        } catch (err) {
          if (err instanceof Refused) return { ok: false, status: err.status, error: err.message };
          throw err;
        }
      },
      personWords: (facts) => personEmailWords(facts, approvedPersonEmailParts(decider.firstName, press.reply)),
      // "I’d join online" ticked: their word on the host's register, in this transaction, and the host's email says it.
      online: request.change.online,
    },
  });
  if (!saved.ok) {
    // A 409 from the visit's own check carries the count and the full flag as they now are.
    const extra: Record<string, unknown> = {};
    if ("emails" in saved) extra.emails = saved.emails;
    if ("overLimit" in saved) extra.overLimit = saved.overLimit;
    return fail(saved.status, saved.error, Object.keys(extra).length ? extra : undefined);
  }
  return { ok: true, value: { weekNumber: saved.weekNumber, hostGroupId: saved.hostGroupId, message: saved.message, emails: saved.emails, status: "approved" } };
}

// ---------------------------------------------------------------------------
// Decline
// ---------------------------------------------------------------------------

export type VisitDeclineAnswer = { status: "declined"; emailed: { person: ExcusedEmailOutcome | "no-address" } };

export async function declineVisitRequest(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<VisitDeclineAnswer>> {
  const found = await forAdmin(db, actor, requestId, normalizeVisitRequest);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseReplyBody(body, "decline");
  if (!parsed.ok) return fail(400, parsed.error);
  const { reply } = parsed.value;
  const person = await firstNameOf(db, request.subjectUid);
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, request.id, normalizeVisitRequest);
      stillWaiting(fresh, await standingIn(tx, db, fresh, now), person.firstName);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), decisionFields(fresh, "declined", actor, reply, now));
    });
  } catch (err) {
    return caught(err);
  }

  // The email says where they are that week: with their own group as usual,
  // unless an excusal stands for that session. Read after the decision; a
  // read that fails says the plainest form.
  let excusedAtHome = false;
  let own: { dateKey: string; startTimeLocal: string } | null = null;
  let homeName = "";
  let hostName = "";
  const read = await readVisitFacts(dbReader(db), db, request.runId, request.subjectUid, [request.change.weekNumber], now).catch(() => null);
  if (read?.ok) {
    const home = read.facts.groups.find((group) => group.id === request.groupId) ?? null;
    homeName = home?.name ?? "";
    hostName = read.facts.groups.find((group) => group.id === request.change.hostGroupId)?.name ?? "";
    const session = ownSessionThatWeek(read.facts.run, home, request.change.weekNumber);
    own = session ? { dateKey: session.dateKey, startTimeLocal: session.session.startTimeLocal } : null;
    excusedAtHome = excusedAtHomeIn(read.facts, request.change.weekNumber);
  } else {
    const names = await groupNames(db, [request.groupId, request.change.hostGroupId]);
    homeName = names.get(request.groupId) ?? "";
    hostName = names.get(request.change.hostGroupId) ?? "";
  }
  const decider = await firstNameOf(db, actor.uid);
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: request.runId,
      audience: "person",
      link: excusedPersonUrl(appUrl(), request.runId),
      words: declinedEmailWords({
        weekNumber: request.change.weekNumber,
        hostName,
        homeName,
        deciderFirstName: decider.firstName,
        reply,
        own,
        excusedAtHome,
      }),
    });
  }
  return { ok: true, value: { status: "declined", emailed: { person: personOutcome } } };
}

export async function groupNames(db: Firestore, ids: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)].filter(isAddressableId);
  const snaps = wanted.length ? await db.getAll(...wanted.map((id) => db.collection("courseGroups").doc(id))) : [];
  return new Map(snaps.filter((snap) => snap.exists).map((snap) => [snap.id, normalizeCourseGroup(snap.id, snap.data() ?? {}).name]));
}

// ---------------------------------------------------------------------------
// Reply without deciding
// ---------------------------------------------------------------------------

export type VisitReplyAnswer = { status: "waiting"; replied: true; emailed: { person: ExcusedEmailOutcome | "no-address" } };

export async function replyToVisitRequest(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  body: unknown,
  now: Date,
): Promise<Outcome<VisitReplyAnswer>> {
  const found = await forAdmin(db, actor, requestId, normalizeVisitRequest);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseReplyBody(body, "reply");
  if (!parsed.ok) return fail(400, parsed.error);
  const { reply } = parsed.value;
  const person = await firstNameOf(db, request.subjectUid);
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, request.id, normalizeVisitRequest);
      stillWaiting(fresh, await standingIn(tx, db, fresh, now), person.firstName);
      if (fresh.replies.length >= MEMBER_REQUEST_LIMITS.replies) throw new Refused(409, EXCUSED_REFUSAL.tooManyReplies);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        "change.replies": storedReplies([...fresh.replies, { text: reply, byUid: actor.uid, at: now }]),
        reply,
        history: withMemberEvent(fresh.history, "replied", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  const [decider, names] = await Promise.all([firstNameOf(db, actor.uid), groupNames(db, [request.change.hostGroupId])]);
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: request.runId,
      audience: "person",
      link: excusedPersonUrl(appUrl(), request.runId),
      words: replyEmailWords({ weekNumber: request.change.weekNumber, hostName: names.get(request.change.hostGroupId) ?? "", deciderFirstName: decider.firstName, reply }),
    });
  }
  return { ok: true, value: { status: "waiting", replied: true, emailed: { person: personOutcome } } };
}

// ---------------------------------------------------------------------------
// Take it
// ---------------------------------------------------------------------------

/**
 * TAKE IT, over any kind's own reader: an admin says they are dealing with a
 * request still waiting. A later kind passes its own reader and its own
 * check of whether it still waits. Emails nobody.
 */
export async function takeMemberRequest<T extends MemberRequestBase>(
  db: Firestore,
  actor: SessionUser,
  requestId: string,
  now: Date,
  kind: { reader: KindReader<T>; stillWaiting: (tx: Transaction, request: T) => Promise<void> },
): Promise<Outcome<{ handlingUid: string }>> {
  const found = await forAdmin(db, actor, requestId, kind.reader);
  if (!found.ok) return found;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, found.value.id, kind.reader);
      await kind.stillWaiting(tx, fresh);
      if (fresh.handlingUid === actor.uid) throw new Refused(409, REQUEST_REFUSAL.alreadyYours);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        handlingUid: actor.uid,
        handlingAt: now,
        history: withMemberEvent(fresh.history, "taken", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  return { ok: true, value: { handlingUid: actor.uid } };
}

export async function takeVisitRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ handlingUid: string }>> {
  return takeMemberRequest(db, actor, requestId, now, {
    reader: normalizeVisitRequest,
    stillWaiting: async (tx, request) => {
      const person = await firstNameOf(db, request.subjectUid);
      stillWaiting(request, await standingIn(tx, db, request, now), person.firstName);
    },
  });
}

// ---------------------------------------------------------------------------
// Withdraw, and dismiss
// ---------------------------------------------------------------------------

export async function withdrawVisitRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ status: "withdrawn" }>> {
  const found = await forAsker(db, actor, requestId, normalizeVisitRequest);
  if (!found.ok) return found;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, found.value.id, normalizeVisitRequest);
      if (fresh.status !== "waiting") throw new Refused(409, WITHDRAW_REFUSAL.decided);
      const standing = await standingIn(tx, db, fresh, now);
      if (standing.state !== "waiting") throw new Refused(409, WITHDRAW_REFUSAL.closed);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        status: "withdrawn",
        withdrawnAt: now,
        history: withMemberEvent(fresh.history, "withdrawn", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  return { ok: true, value: { status: "withdrawn" } };
}

export async function dismissVisitRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ dismissed: true }>> {
  const found = await forAsker(db, actor, requestId, normalizeVisitRequest);
  if (!found.ok) return found;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, found.value.id, normalizeVisitRequest);
      if (fresh.status !== "declined" || fresh.dismissedAt) throw new Refused(409, NOTHING_TO_DISMISS);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), {
        dismissedAt: now,
        history: withMemberEvent(fresh.history, "dismissed", actor.uid, now),
        updatedAt: now,
      });
    });
  } catch (err) {
    return caught(err);
  }
  return { ok: true, value: { dismissed: true } };
}
