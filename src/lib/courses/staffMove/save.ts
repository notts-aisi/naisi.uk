import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { moveFromWeek, type MoveFromWeekRead } from "@/lib/courses/moveFromWeek";
import { moveGroupUrl, movePersonUrl, sendMoveEmail, type MoveEmailOutcome } from "@/lib/email/moveEmail";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { weekDocId } from "@/lib/firestore/courses";
import { accountsIn, emailFor, moveRecipients, moveWeekFor, planMove, readMoveFacts, runMoveRefusal, type MovePlan, type MoveRecipient, type MoveRefusal } from "./plan";
import { MOVE_REFUSAL, changedWords, moveReasonForm, movedInDetail, movedOutDetail, movedWords } from "./words";

/**
 * THE SAVE OF A MOVE TO ANOTHER GROUP FOR GOOD, MADE MID-TERM: the route's
 * press (`POST .../programmes/[programmeId]/people/[uid]/move`), after its
 * gate.
 *
 * The press carries the week the page stated and the count of emails its
 * button showed. Both are worked out again INSIDE the move's transaction
 * (`moveFromWeek`, with what that transaction read: the run, its groups, the
 * place and the accounts of everybody it would email), and either differing
 * answers 409 with the new facts, before anything is written: a session can
 * start between the preview and the press.
 *
 * In the same transaction (`moveFromWeek`'s staff move): the group and the
 * record of groups by week, both groups' counts, the group they join as the
 * group they were told about (`toldGroupId`), Publish's markers for this move
 * forgotten, and one history row on EACH group (`member-moved`), with the
 * reason given, if any, which only the programme's lead and admins read.
 * `allocatedEmailAt` is left exactly as it is: it is the instant Late is
 * measured from. `timeAnswer` is left as it is too, as a move on the
 * allocation board leaves a told seat's: it is about the group it was given
 * about (`forGroupId`), and is shown only while they are in that group.
 *
 * THE THREE EMAILS GO AFTER THE COMMIT, to exactly the people the
 * transaction counted: a failed send never fails the move, and the answer
 * says what went. The reason is in none of them.
 */

export type MoveSaveInput = {
  runId: string;
  uid: string;
  toGroupId: string;
  /** The week the page stated. */
  weekNumber: number;
  /** The count of emails the button showed. */
  emailCount: number;
  reason: string;
  actor: SessionUser;
  now: Date;
};

/** What became of each email, by recipient. */
export type MoveSent = { uid: string; as: MoveRecipient["as"]; outcome: MoveEmailOutcome };

export type MoveSaveAnswer = {
  ok: true;
  toGroupId: string;
  fromGroupId: string;
  weekNumber: number;
  message: string;
  /** What each email did: sent, held back by the do-not-email list, or failed. */
  emails: { sent: number; suppressed: number; failed: number; each: MoveSent[] };
};

/** 409 with the facts as they now are: the week the move would be from, and its count. */
export type MoveChanged = { ok: false; status: 409; error: string; weekNumber: number | null; emails: number | null };

type Stop = { kind: "changed"; weekNumber: number | null; emails: number | null; error: string };

export async function saveMove(db: Firestore, input: MoveSaveInput): Promise<MoveSaveAnswer | MoveRefusal | MoveChanged> {
  const read = await readMoveFacts(db, input.runId, input.uid);
  if (!read.ok) return read;
  const { facts } = read;
  const planned = await planMove(db, facts, input.toGroupId, input.actor.uid, input.now);
  if (!planned.ok) return planned;
  const plan: MovePlan = planned.plan;

  // Filled inside the transaction: who it counted, so the send goes to them and nobody else.
  let counted: MoveRecipient[] = [];
  const result = await moveFromWeek<Stop>(
    db,
    { runId: input.runId, uid: input.uid, toGroupId: input.toGroupId, fromWeek: plan.weekNumber },
    {
      async confirm(tx, seen: MoveFromWeekRead) {
        // The run's state again, as this transaction read it: it may have ended,
        // been archived or begun to be destroyed since the facts were read.
        const runRefusal = runMoveRefusal(seen.run, seen.destroying);
        if (runRefusal) return { kind: "changed", weekNumber: null, emails: null, error: runRefusal };
        // The week, by the rule, from the documents this transaction read.
        const week = moveWeekFor(seen.run, seen.place, seen.groups, seen.to, input.now);
        const weekNumber = week.ok ? week.weekNumber : null;
        const accounts = await accountsIn(tx, db, [input.uid, ...seen.from.facilitatorUids, ...seen.to.facilitatorUids]);
        const data = accounts.get(input.uid);
        const recipients = moveRecipients({
          person: { ...facts.person, email: typeof data?.email === "string" ? data.email.trim() : "" },
          from: seen.from,
          to: seen.to,
          accounts,
          actorUid: input.actor.uid,
        });
        if (weekNumber !== input.weekNumber || weekNumber !== plan.weekNumber || recipients.length !== input.emailCount) {
          const error = weekNumber === null ? MOVE_REFUSAL.changed : changedWords(weekNumber, recipients.length);
          return { kind: "changed", weekNumber, emails: weekNumber === null ? null : recipients.length, error };
        }
        counted = recipients;
        return null;
      },
      alsoWrite(tx, seen) {
        const actor = { uid: input.actor.uid, displayName: input.actor.displayName ?? "" };
        const shared = { run: seen.run, actor, weekId: weekDocId(plan.weekNumber), reason: moveReasonForm(input.reason) || null, emailed: counted.length, subjectUid: input.uid };
        tx.create(
          db.collection(COURSE_AUDIT_COLLECTION).doc(),
          groupHistoryRow({
            ...shared,
            kind: "member-moved",
            group: seen.from,
            detail: movedOutDetail(facts.person.name, seen.to.name, plan.weekNumber, input.reason),
            after: { groupId: seen.to.id, group: seen.to.name.trim() },
          }),
        );
        tx.create(
          db.collection(COURSE_AUDIT_COLLECTION).doc(),
          groupHistoryRow({
            ...shared,
            kind: "member-moved",
            group: seen.to,
            detail: movedInDetail(facts.person.name, seen.from.name, plan.weekNumber, input.reason),
            before: { groupId: seen.from.id, group: seen.from.name.trim() },
          }),
        );
      },
    },
  );

  if (!result.ok) {
    if (result.refusal === "stopped") {
      return { ok: false, status: 409, error: result.stop.error, weekNumber: result.stop.weekNumber, emails: result.stop.emails };
    }
    if (result.refusal === "group-full") return { ok: false, status: 409, error: MOVE_REFUSAL.changed };
    if (result.refusal === "group-not-found") return { ok: false, status: 404, error: MOVE_REFUSAL.noGroup };
    return { ok: false, status: 409, error: MOVE_REFUSAL.changed };
  }

  // The emails, once the move is written, to exactly the people counted.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const each: MoveSent[] = [];
  for (const recipient of counted) {
    const outcome = await sendMoveEmail({
      to: recipient.email,
      name: recipient.firstName,
      actorUid: input.actor.uid,
      runId: input.runId,
      link: recipient.as === "person" ? movePersonUrl(appUrl, input.runId) : moveGroupUrl(appUrl, input.runId, recipient.as === "new" ? result.toGroupId : result.fromGroupId),
      words: emailFor(plan, recipient),
    });
    each.push({ uid: recipient.uid, as: recipient.as, outcome });
  }
  const tally = (outcome: MoveEmailOutcome) => each.filter((sent) => sent.outcome === outcome).length;
  const emails = { sent: tally("sent"), suppressed: tally("suppressed"), failed: tally("failed"), each };
  return {
    ok: true,
    toGroupId: result.toGroupId,
    fromGroupId: result.fromGroupId,
    weekNumber: plan.weekNumber,
    message: movedWords({ firstName: facts.person.firstName, toName: plan.toName, weekNumber: plan.weekNumber, sent: emails.sent, failed: emails.failed }),
    emails,
  };
}
