import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { excusedPersonUrl, sendExcusedEmail, type ExcusedEmailOutcome } from "@/lib/email/excusedEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  MEMBER_REQUEST_LIMITS,
  normalizeMoveRequest,
  storedReplies,
  withMemberEvent,
  type MoveRequestDoc,
} from "@/lib/firestore/courseMemberRequests";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { EXCUSED_REFUSAL } from "../excused/words";
import { saveMove } from "../staffMove/save";
import { personEmailWords } from "../staffMove/words";
import { Refused, caught, fail, firstNameOf, forAdmin, forAsker, groupNames, kindInTransaction, takeMemberRequest, type Outcome } from "../visitRequest/decide";
import { parseReplyBody } from "../visitRequest/model";
import { NOTHING_TO_DISMISS, WITHDRAW_REFUSAL, approvedPersonEmailParts, notWaitingWords } from "../visitRequest/words";
import { parseMoveApprove } from "./model";
import { moveRequestStandingOf, type MoveRequestStanding } from "./standing";
import { ALREADY_WITHDRAWN, moveDeclinedEmailWords, moveGoneStaffWords, moveReplyEmailWords } from "./words";
import { isAddressableId } from "@/lib/courses/registerAccess";

/**
 * DECIDING, REPLYING TO, TAKING, WITHDRAWING AND DISMISSING A REQUEST TO
 * CHANGE GROUP FOR GOOD: the routes' work, so each route is its gate's answer
 * and nothing more. The same gates as a request to go to another session
 * (`../visitRequest/decide.ts`, whose `forAdmin` and `forAsker` these ask).
 *
 *  - APPROVE: ADMINS ONLY, never the person who asked. Makes the move through
 *    the staff move's own writer (`saveMove`, through `moveFromWeek`), whose
 *    transaction reads this request again after every other check and writes
 *    its decision (with the week the move was made from) beside the move's
 *    own writes: a move is never written without its decision nor a decision
 *    without its move, and a withdraw or a second press racing it cannot both
 *    land. Everything that writer refuses is refused here in its own sentence,
 *    with nothing written: a group that filled since the ask, the week rule's
 *    refusals, the limits on a move's emails, and a week or a count of emails
 *    that changed since the page (409, with the new facts). The person's
 *    words go into NEITHER group's history: the rows are the staff move's own
 *    with no reason, so they are read only on the request's page, by admins.
 *    The person is sent the staff move's email with the approved first
 *    sentence and the reply; both groups' facilitators exactly what a staff
 *    move sends.
 *  - DECLINE: admins only, with a reply. Writes the decision, no move.
 *    Emails the person.
 *  - REPLY WITHOUT DECIDING: admins only. The request keeps waiting; the
 *    reply is kept on it and emailed to the person. More than once.
 *  - TAKE IT: admins only. Says who is dealing with it. Emails nobody.
 *  - WITHDRAW: the person who asked, while it waits. Emails nobody.
 *  - DISMISS: the person who asked, on a decline's message. Emails nobody.
 *
 * A request that went by itself (`moveRequestStandingOf`: moved since by
 * anybody, the place gone or no longer one a move takes, either group no
 * longer meeting, the run over) is decided, replied to, taken and
 * withdrawn by nobody: each is refused in one sentence, and nobody is emailed.
 */

const appUrl = (): string => process.env.NEXT_PUBLIC_APP_URL ?? "";

/** Where a move request stands now, read in `tx`: its run, the run's groups (one equality) and the person's place. */
async function standingIn(tx: Transaction, db: Firestore, request: MoveRequestDoc): Promise<{ standing: MoveRequestStanding; groups: CourseGroupDoc[] }> {
  const [runSnap, placeSnap, groupSnap] = await Promise.all([
    tx.get(db.collection("courseRuns").doc(request.runId)),
    tx.get(db.collection("courseEnrolments").doc(courseEnrolmentId(request.runId, request.subjectUid))),
    tx.get(db.collection("courseGroups").where("runId", "==", request.runId)),
  ]);
  const run = runSnap.exists ? normalizeCourseRun(runSnap.id, runSnap.data() ?? {}) : null;
  const place = placeSnap.exists ? normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {}) : null;
  const groups = groupSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === request.runId);
  return { standing: moveRequestStandingOf({ request, run, destroying: runSnap.data()?.destroying === true, groups, place }), groups };
}

/** Refuses anything but a request still waiting: decided, withdrawn, or gone by itself. */
function stillWaiting(request: MoveRequestDoc, standing: MoveRequestStanding, personFirstName: string, groups: readonly CourseGroupDoc[]): void {
  if (request.status !== "waiting") throw new Refused(409, notWaitingWords(request.status));
  if (standing.state === "gone") {
    const groupName = standing.why === "group" ? groups.find((group) => group.id === standing.groupId)?.name : undefined;
    throw new Refused(409, moveGoneStaffWords({ why: standing.why, groupName }, personFirstName));
  }
}

/** The stored fields of a decision. */
function decisionFields(request: MoveRequestDoc, status: "approved" | "declined", actor: SessionUser, reply: string, now: Date): Record<string, unknown> {
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

export type MoveApproveAnswer = {
  status: "approved";
  toGroupId: string;
  fromGroupId: string;
  weekNumber: number;
  message: string;
  emails: { sent: number; suppressed: number; failed: number };
};

export async function approveMoveRequest(db: Firestore, actor: SessionUser, requestId: string, body: unknown, now: Date): Promise<Outcome<MoveApproveAnswer>> {
  const found = await forAdmin(db, actor, requestId, normalizeMoveRequest);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseMoveApprove(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const press = parsed.value;
  const [decider, person] = await Promise.all([firstNameOf(db, actor.uid), firstNameOf(db, request.subjectUid)]);
  // Decided, withdrawn or gone by itself: said in this request's own sentence
  // before the move's checks are asked (and asked again inside its transaction).
  try {
    await db.runTransaction(async (tx) => {
      const { standing, groups } = await standingIn(tx, db, request);
      stillWaiting(request, standing, person.firstName, groups);
    });
  } catch (err) {
    return caught(err);
  }
  const ref = db.collection(COURSE_REQUESTS_COLLECTION).doc(request.id);
  const saved = await saveMove(db, {
    runId: request.runId,
    uid: request.subjectUid,
    toGroupId: request.change.toGroupId,
    weekNumber: press.weekNumber,
    emailCount: press.emailCount,
    // Nothing of the person's own words goes into either group's history.
    reason: "",
    actor,
    now,
    approves: {
      requestId: request.id,
      inTransaction: async (tx, seen, weekNumber) => {
        try {
          const fresh = await kindInTransaction(tx, db, request.id, normalizeMoveRequest);
          // The run and the place as the move's own transaction read them.
          const standing = moveRequestStandingOf({ request: fresh, run: seen.run, destroying: seen.destroying, groups: seen.groups, place: seen.place });
          stillWaiting(fresh, standing, person.firstName, seen.groups);
          return {
            ok: true,
            write: () => tx.update(ref, { ...decisionFields(fresh, "approved", actor, press.reply, now), "change.fromWeek": weekNumber }),
          };
        } catch (err) {
          if (err instanceof Refused) return { ok: false, status: err.status, error: err.message };
          throw err;
        }
      },
      personWords: (facts) => personEmailWords(facts, approvedPersonEmailParts(decider.firstName, press.reply)),
    },
  });
  if (!saved.ok) {
    // A 409 from the move's own check carries the week and the count as they now are.
    const extra: Record<string, unknown> = {};
    if ("weekNumber" in saved) extra.weekNumber = saved.weekNumber;
    if ("emails" in saved) extra.emails = saved.emails;
    return fail(saved.status, saved.error, Object.keys(extra).length ? extra : undefined);
  }
  return {
    ok: true,
    value: {
      status: "approved",
      toGroupId: saved.toGroupId,
      fromGroupId: saved.fromGroupId,
      weekNumber: saved.weekNumber,
      message: saved.message,
      emails: { sent: saved.emails.sent, suppressed: saved.emails.suppressed, failed: saved.emails.failed },
    },
  };
}

// ---------------------------------------------------------------------------
// Decline
// ---------------------------------------------------------------------------

export type MoveDeclineAnswer = { status: "declined"; emailed: { person: ExcusedEmailOutcome | "no-address" } };

export async function declineMoveRequest(db: Firestore, actor: SessionUser, requestId: string, body: unknown, now: Date): Promise<Outcome<MoveDeclineAnswer>> {
  const found = await forAdmin(db, actor, requestId, normalizeMoveRequest);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseReplyBody(body, "decline");
  if (!parsed.ok) return fail(400, parsed.error);
  const { reply } = parsed.value;
  const person = await firstNameOf(db, request.subjectUid);
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, request.id, normalizeMoveRequest);
      const { standing, groups } = await standingIn(tx, db, fresh);
      stillWaiting(fresh, standing, person.firstName, groups);
      tx.update(db.collection(COURSE_REQUESTS_COLLECTION).doc(fresh.id), decisionFields(fresh, "declined", actor, reply, now));
    });
  } catch (err) {
    return caught(err);
  }
  const [decider, names] = await Promise.all([firstNameOf(db, actor.uid), groupNames(db, [request.groupId, request.change.toGroupId])]);
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: request.runId,
      audience: "person",
      link: excusedPersonUrl(appUrl(), request.runId),
      words: moveDeclinedEmailWords({
        toName: names.get(request.change.toGroupId) ?? "",
        fromName: names.get(request.groupId) ?? "",
        deciderFirstName: decider.firstName,
        reply,
      }),
    });
  }
  return { ok: true, value: { status: "declined", emailed: { person: personOutcome } } };
}

// ---------------------------------------------------------------------------
// Reply without deciding
// ---------------------------------------------------------------------------

export type MoveReplyAnswer = { status: "waiting"; replied: true; emailed: { person: ExcusedEmailOutcome | "no-address" } };

export async function replyToMoveRequest(db: Firestore, actor: SessionUser, requestId: string, body: unknown, now: Date): Promise<Outcome<MoveReplyAnswer>> {
  const found = await forAdmin(db, actor, requestId, normalizeMoveRequest);
  if (!found.ok) return found;
  const request = found.value;
  const parsed = parseReplyBody(body, "reply");
  if (!parsed.ok) return fail(400, parsed.error);
  const { reply } = parsed.value;
  const person = await firstNameOf(db, request.subjectUid);
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, request.id, normalizeMoveRequest);
      const { standing, groups } = await standingIn(tx, db, fresh);
      stillWaiting(fresh, standing, person.firstName, groups);
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
  const [decider, names] = await Promise.all([firstNameOf(db, actor.uid), groupNames(db, [request.change.toGroupId])]);
  let personOutcome: ExcusedEmailOutcome | "no-address" = "no-address";
  if (person.email) {
    personOutcome = await sendExcusedEmail({
      to: person.email,
      name: person.firstName,
      actorUid: actor.uid,
      runId: request.runId,
      audience: "person",
      link: excusedPersonUrl(appUrl(), request.runId),
      words: moveReplyEmailWords({ toName: names.get(request.change.toGroupId) ?? "", deciderFirstName: decider.firstName, reply }),
    });
  }
  return { ok: true, value: { status: "waiting", replied: true, emailed: { person: personOutcome } } };
}

// ---------------------------------------------------------------------------
// Take it, withdraw, dismiss
// ---------------------------------------------------------------------------

export async function takeMoveRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ handlingUid: string }>> {
  // The person's first name, for a refusal's sentence, read once before the transaction (an admin's call alone reads it).
  let personFirstName = "";
  if (actor.role === "admin") {
    const snap = isAddressableId(requestId) && requestId.length <= 128 ? await db.collection(COURSE_REQUESTS_COLLECTION).doc(requestId).get() : null;
    const request = snap?.exists ? normalizeMoveRequest(snap.id, snap.data() ?? {}) : null;
    if (request) personFirstName = (await firstNameOf(db, request.subjectUid)).firstName;
  }
  return takeMemberRequest(db, actor, requestId, now, {
    reader: normalizeMoveRequest,
    stillWaiting: async (tx, request) => {
      const { standing, groups } = await standingIn(tx, db, request);
      stillWaiting(request, standing, personFirstName, groups);
    },
  });
}

export async function withdrawMoveRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ status: "withdrawn" }>> {
  const found = await forAsker(db, actor, requestId, normalizeMoveRequest);
  if (!found.ok) return found;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, found.value.id, normalizeMoveRequest);
      if (fresh.status === "withdrawn") throw new Refused(409, ALREADY_WITHDRAWN);
      if (fresh.status !== "waiting") throw new Refused(409, WITHDRAW_REFUSAL.decided);
      const { standing } = await standingIn(tx, db, fresh);
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

export async function dismissMoveRequest(db: Firestore, actor: SessionUser, requestId: string, now: Date): Promise<Outcome<{ dismissed: true }>> {
  const found = await forAsker(db, actor, requestId, normalizeMoveRequest);
  if (!found.ok) return found;
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await kindInTransaction(tx, db, found.value.id, normalizeMoveRequest);
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
