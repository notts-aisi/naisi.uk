import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { writeTakenBack, type SessionLine } from "@/lib/courses/cantMakeIt/seat";
import { readMirrorPlan } from "@/lib/courses/attendanceMirror";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { resolveSessions } from "@/lib/courses/sessions";
import { sendVisitEmail, visitGroupUrl, visitPersonUrl, type VisitEmailOutcome } from "@/lib/email/visitEmail";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { ONLINE_SAID, attendanceDocId, normalizeCourseAttendance } from "@/lib/firestore/courseAttendance";
import { courseEnrolmentId, groupForWeek, ownGroupForWeek, type CourseEnrolmentDoc, type OneWeekVisit } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import type { SessionUser } from "@/lib/firebase/session";
import { arrangedEmailFor, planCallOff, planVisit, readVisitFacts, txReader, type VisitFacts, type VisitRecipient, type VisitRefusal } from "./plan";
import {
  arrangedWords,
  calledOffDetail,
  calledOffWords,
  changedWords,
  nowFullWords,
  tooLateToCancelWords,
  visitingDetail,
  visitsDetail,
  type VisitEmailWords,
} from "./words";

/**
 * ARRANGING, AND CALLING OFF, A ONE-WEEK VISIT: the saves behind the visit
 * route (staff) and the cancel route (the person), after each route's gate.
 *
 * Each is ONE TRANSACTION that reads the facts again (`readVisitFacts`, with
 * the transaction's reads) and asks the plan again, so what it writes is what
 * it just checked: a session can start, fill or be called off between the
 * page and the press. Staff's press sends back the count of emails its button
 * showed and whether the page showed the session is full; either differing
 * answers 409 with the facts as they now are, before anything is written.
 *
 * ARRANGED, in the same transaction: the visit on the place; the person's
 * attendance rollup rebuilt from the place as written when a register of that
 * week (theirs or the host's) is already finished, as a correction rebuilds
 * it; and one history row on EACH group (`member-visits`), with the reason
 * given, if any, which only the programme's lead and admins read
 * (`LEAD_ONLY_REASON_KINDS`). CALLED OFF: the visit taken off the place; the
 * person's own words on the host's register for that session taken off
 * while it is not finished (they said they are joining online, or can't make
 * it); the rollup rebuilt the same way; a history row on each group
 * (`member-visit-off`).
 *
 * THE EMAILS GO AFTER THE COMMIT, to exactly the people the transaction
 * counted: a failed send never fails the visit, and the answer says what
 * went. The reason is in none of them.
 */

/** What became of each email, by recipient. */
export type VisitSent = { uid: string; as: VisitRecipient["as"]; outcome: VisitEmailOutcome };

export type VisitSaveAnswer = {
  ok: true;
  weekNumber: number;
  hostGroupId: string;
  message: string;
  emails: { sent: number; suppressed: number; failed: number; each: VisitSent[] };
};

/** 409 with the facts as they now are. */
export type VisitChanged = { ok: false; status: 409; error: string; emails: number | null; overLimit: boolean | null };

class Stop extends Error {
  constructor(readonly answer: VisitRefusal | VisitChanged) {
    super("stop");
  }
}

/** The stored form of a place's visits. */
function storedVisits(visits: readonly OneWeekVisit[]): Array<Record<string, unknown>> {
  return [...visits]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((visit) => ({ weekNumber: visit.weekNumber, groupId: visit.groupId, arrangedByUid: visit.arrangedByUid, arrangedAt: visit.arrangedAt }));
}

/**
 * Whether a register of that week, of either group, is finished: then the
 * person's figures change with the visit, and are rebuilt.
 */
function weekIsFinished(facts: VisitFacts, groups: readonly CourseGroupDoc[], weekNumber: number): boolean {
  for (const group of groups) {
    for (const session of resolveSessions(facts.run, group).filter((each) => each.weekNumber === weekNumber)) {
      const id = attendanceDocId(facts.run.id, group.id, session.weekNumber, session.occurrence);
      const data = facts.registers.get(id);
      if (data && normalizeCourseAttendance(id, data).pushedAt !== null) return true;
    }
  }
  return false;
}

/** The person's rollup, rebuilt from the place as it will be written: read inside `tx`, before any write. */
async function rollupAfter(tx: Transaction, db: Firestore, run: CourseRunDoc, home: CourseGroupDoc, after: CourseEnrolmentDoc, now: Date) {
  const plan = await readMirrorPlan(tx, db, {
    runId: run.id,
    run,
    groupId: home.id,
    sessions: resolveSessions(run, home),
    members: [{ uid: after.uid, joinedWeekNumber: after.joinedWeekNumber }],
    placesAfter: new Map([[after.uid, after]]),
    now,
  });
  return plan.writes;
}

async function sendAll(
  recipients: readonly VisitRecipient[],
  input: { actorUid: string; runId: string; hostGroupId: string; homeGroupId: string; wordsFor: (recipient: VisitRecipient) => VisitEmailWords; greet: (recipient: VisitRecipient) => boolean },
): Promise<VisitSaveAnswer["emails"]> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const each: VisitSent[] = [];
  for (const recipient of recipients) {
    const outcome = await sendVisitEmail({
      to: recipient.email,
      name: input.greet(recipient) ? recipient.firstName : "",
      actorUid: input.actorUid,
      runId: input.runId,
      link:
        recipient.as === "person"
          ? visitPersonUrl(appUrl, input.runId)
          : visitGroupUrl(appUrl, input.runId, recipient.as === "host" ? input.hostGroupId : input.homeGroupId),
      words: input.wordsFor(recipient),
    });
    each.push({ uid: recipient.uid, as: recipient.as, outcome });
  }
  const tally = (outcome: VisitEmailOutcome) => each.filter((sent) => sent.outcome === outcome).length;
  return { sent: tally("sent"), suppressed: tally("suppressed"), failed: tally("failed"), each };
}

// ---------------------------------------------------------------------------
// Arranging one
// ---------------------------------------------------------------------------

export type ArrangeInput = {
  runId: string;
  uid: string;
  weekNumber: number;
  hostGroupId: string;
  /** The count of emails the button showed. */
  emailCount: number;
  /** Whether the page showed the session is full this week (its warning). */
  overLimit: boolean;
  reason: string;
  actor: SessionUser;
  now: Date;
};

export async function arrangeVisit(db: Firestore, input: ArrangeInput): Promise<VisitSaveAnswer | VisitRefusal | VisitChanged> {
  let counted: VisitRecipient[] = [];
  let plan: Extract<ReturnType<typeof planVisit>, { ok: true }>["plan"] | null = null;
  let firstName = "";
  try {
    await db.runTransaction(async (tx) => {
      const read = await readVisitFacts(txReader(tx), db, input.runId, input.uid, [input.weekNumber], input.now);
      if (!read.ok) throw new Stop(read);
      const { facts } = read;
      const planned = planVisit(facts, input.weekNumber, input.hostGroupId, input.actor.uid, input.now);
      if (!planned.ok) throw new Stop(planned);
      if (planned.plan.emails !== input.emailCount) {
        throw new Stop({ ok: false, status: 409, error: changedWords(planned.plan.emails), emails: planned.plan.emails, overLimit: planned.plan.overLimit !== null });
      }
      if (planned.plan.overLimit !== null && !input.overLimit) {
        throw new Stop({ ok: false, status: 409, error: nowFullWords(planned.plan.hostName), emails: planned.plan.emails, overLimit: true });
      }
      const visit: OneWeekVisit = { weekNumber: input.weekNumber, groupId: planned.plan.hostGroupId, arrangedByUid: input.actor.uid, arrangedAt: input.now };
      const visits = [...(facts.place.visits ?? []), visit];
      const after: CourseEnrolmentDoc = { ...facts.place, visits };
      // The week's session's group as written (the host), and the group they
      // belong to that week (their own): the two registers of that week.
      const host = facts.groups.find((group) => group.id === groupForWeek(after, input.weekNumber)) as CourseGroupDoc;
      const home = facts.groups.find((group) => group.id === ownGroupForWeek(after, input.weekNumber)) as CourseGroupDoc;
      const rollup = weekIsFinished(facts, [host, home], input.weekNumber) ? await rollupAfter(tx, db, facts.run, home, after, input.now) : [];

      // Writes, after every read.
      tx.update(db.collection("courseEnrolments").doc(courseEnrolmentId(input.runId, input.uid)), {
        visits: storedVisits(visits),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const actor = { uid: input.actor.uid, displayName: input.actor.displayName ?? "" };
      const reason = input.reason.replace(/\s+/g, " ").trim();
      const shared = { run: facts.run, actor, weekId: weekDocId(input.weekNumber), reason: reason || null, emailed: planned.plan.emails, subjectUid: input.uid };
      tx.create(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({ ...shared, kind: "member-visits", group: home, detail: visitsDetail(facts.person.name, host.name, input.weekNumber, reason), after: { groupId: host.id, group: host.name.trim() } }),
      );
      tx.create(
        db.collection(COURSE_AUDIT_COLLECTION).doc(),
        groupHistoryRow({ ...shared, kind: "member-visits", group: host, detail: visitingDetail(facts.person.name, host.name, input.weekNumber, reason), before: { groupId: home.id, group: home.name.trim() } }),
      );
      for (const write of rollup) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
      counted = planned.plan.recipients;
      plan = planned.plan;
      firstName = facts.person.firstName;
    });
  } catch (err) {
    if (err instanceof Stop) return err.answer;
    throw err;
  }
  const done = plan as unknown as Extract<ReturnType<typeof planVisit>, { ok: true }>["plan"];
  const emails = await sendAll(counted, {
    actorUid: input.actor.uid,
    runId: input.runId,
    hostGroupId: done.hostGroupId,
    homeGroupId: done.homeGroupId,
    wordsFor: (recipient) => arrangedEmailFor(done, recipient),
    greet: () => true,
  });
  return {
    ok: true,
    weekNumber: input.weekNumber,
    hostGroupId: done.hostGroupId,
    message: arrangedWords({ firstName, hostName: done.hostName, weekNumber: input.weekNumber, sent: emails.sent, failed: emails.failed }),
    emails,
  };
}

// ---------------------------------------------------------------------------
// Calling one off
// ---------------------------------------------------------------------------

export type CallOffInput = {
  runId: string;
  uid: string;
  weekNumber: number;
  /** Staff pressed (the person is emailed too); otherwise the person themselves. */
  byStaff: boolean;
  /** Staff's press: the count of emails the button showed. Null for the person's own. */
  emailCount: number | null;
  actor: SessionUser;
  now: Date;
};

export async function callOffVisit(db: Firestore, input: CallOffInput): Promise<VisitSaveAnswer | VisitRefusal | VisitChanged> {
  let counted: VisitRecipient[] = [];
  let planned: Extract<ReturnType<typeof planCallOff>, { ok: true }>["plan"] | null = null;
  let firstName = "";
  try {
    await db.runTransaction(async (tx) => {
      const read = await readVisitFacts(txReader(tx), db, input.runId, input.uid, [input.weekNumber], input.now);
      if (!read.ok) throw new Stop(read);
      const { facts } = read;
      const outcome = planCallOff(facts, input.weekNumber, input.byStaff, input.actor.uid, input.now);
      if (!outcome.ok) throw new Stop(outcome);
      const plan = outcome.plan;
      if (plan.until && input.now.getTime() >= plan.until.getTime()) {
        throw new Stop({ ok: false, status: 409, error: tooLateToCancelWords(plan.host.name), kind: "too-late" });
      }
      if (input.emailCount !== null && plan.emails !== input.emailCount) {
        throw new Stop({ ok: false, status: 409, error: changedWords(plan.emails), emails: plan.emails, overLimit: null });
      }
      const visits = (facts.place.visits ?? []).filter((visit) => visit.weekNumber !== input.weekNumber);
      const after: CourseEnrolmentDoc = { ...facts.place, ...(visits.length ? { visits } : {}) };
      if (!visits.length) delete after.visits;
      const rollup = weekIsFinished(facts, [plan.host, plan.home], input.weekNumber) ? await rollupAfter(tx, db, facts.run, plan.home, after, input.now) : [];

      // Writes, after every read.
      tx.update(db.collection("courseEnrolments").doc(courseEnrolmentId(input.runId, input.uid)), {
        visits: visits.length ? storedVisits(visits) : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Their own words on the host's register for that session, while it is
      // not finished: that they are joining online, and that they can't make
      // it (taken back by the one writer of such a line, which never touches
      // a line an approval wrote).
      if (plan.hostSession) {
        const id = attendanceDocId(input.runId, plan.host.id, plan.hostSession.weekNumber, plan.hostSession.occurrence);
        const data = facts.registers.get(id);
        if (data) {
          const register = normalizeCourseAttendance(id, data);
          const ref = db.collection("courseAttendance").doc(id);
          if (register.pushedAt === null) {
            if (Object.hasOwn(register.onlineSaid, input.uid)) {
              tx.set(ref, { [ONLINE_SAID]: { [input.uid]: FieldValue.delete() } }, { merge: true });
            }
            if (Object.hasOwn(register.excusedInAdvance, input.uid)) {
              writeTakenBack(tx, { session: plan.hostSession, ref, data, state: { kind: "told" } } as unknown as SessionLine, input.uid);
            }
          }
        }
      }
      const actor = { uid: input.actor.uid, displayName: input.actor.displayName ?? "" };
      const shared = { run: facts.run, actor, weekId: weekDocId(input.weekNumber), emailed: plan.emails, subjectUid: input.uid };
      const detail = calledOffDetail(facts.person.name, plan.host.name, input.weekNumber);
      tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), groupHistoryRow({ ...shared, kind: "member-visit-off", group: plan.home, detail }));
      tx.create(db.collection(COURSE_AUDIT_COLLECTION).doc(), groupHistoryRow({ ...shared, kind: "member-visit-off", group: plan.host, detail }));
      for (const write of rollup) tx.set(write.ref, { attendance: write.rollup }, { merge: true });
      counted = plan.recipients;
      planned = plan;
      firstName = facts.person.firstName;
    });
  } catch (err) {
    if (err instanceof Stop) return err.answer;
    throw err;
  }
  const done = planned as unknown as Extract<ReturnType<typeof planCallOff>, { ok: true }>["plan"];
  const emails = await sendAll(counted, {
    actorUid: input.actor.uid,
    runId: input.runId,
    hostGroupId: done.host.id,
    homeGroupId: done.home.id,
    wordsFor: done.emailFor,
    // The approved called-off email to the facilitators has no greeting.
    greet: (recipient) => recipient.as === "person",
  });
  return {
    ok: true,
    weekNumber: input.weekNumber,
    hostGroupId: done.host.id,
    message: calledOffWords({ firstName, hostName: done.host.name, weekNumber: input.weekNumber, sent: emails.sent, failed: emails.failed }),
    emails,
  };
}
