import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { moveFromWeek } from "@/lib/courses/moveFromWeek";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { belonging, hasGroupsByWeek, sessionsByWeekGroup } from "../groupsByWeek";
import { leftBehindOf, moveWeekFor, readNotHeld, stayNamesFor, weekRefusalWords } from "./plan";
import { weeksThatCome } from "./week";
import {
  MOVE_REFUSAL,
  boardMoveConfirmWords,
  boardMovedInDetail,
  boardMovedOutDetail,
  boardWeekChangedWords,
  leftBehindWords,
  midTermLeadOnlyWords,
  midTermToPoolWords,
  oldNoLongerMeetsWords,
  oldOffWords,
  weeksStayWords,
} from "./words";

/**
 * A MOVE MADE MID-TERM ON THE ALLOCATION BOARD (the Groups tab, Circles and
 * the run's own board, all through `POST /api/courses/runs/[runId]/allocate`)
 * KEEPS THE WEEKS ALREADY MET.
 *
 * A move on the board was always for every week: the place's group changed,
 * and every week read the new group, so the weeks somebody met with the old
 * group turned into blanks, and into absences once a register was finished.
 * Now a move of a place that has been told its group, once it has met (a
 * session of the group it belongs to has started, and was neither called off
 * nor marked as not held), or a place that already has a record of groups by
 * week, goes through the one writer of that record
 * (`moveFromWeek`) with the week the move page's rule gives (`moveWeekFor`):
 * every week before it stays with the old group, the new group has that week
 * and every later one, and one History row on each group says it was a move
 * on the Groups tab. A record is extended, or folded back when the person
 * returns to a group before an earlier move took effect, exactly as the move
 * page does it. A one-week visit to the group moved into, from the move's
 * week on, goes in the same write; every other visit stands.
 *
 * IT EMAILS NOBODY: the person is told at the next Publish ("You’ve moved"),
 * as every move on the board is (`toldAtPublish`). So nothing here is held to
 * the move page's limits.
 *
 * A move before the term (nobody told, or no session of the old group
 * started) is not this: the board writes it in its own transaction as it
 * always has (`isMidTermBoardMove` answers which).
 *
 * WHAT THE BOARD SAYS BEFORE THE PRESS is `planBoardMove`: the week, that
 * the earlier weeks stay with the old group, and what the move leaves behind
 * on the old group from that week on, in the move page's sentence. The press
 * may send that week back (`fromWeek`): when the rule now gives another,
 * nothing is written and the board is told so.
 *
 * NEVER INTO NO GROUP MID-TERM. A place in no group keeps no record of the
 * weeks it met (every week reads its group, and it has none), so a told place
 * whose group has met is never taken out of every group by the board: it is
 * refused (`midTermToPoolRefusal`), and the board says to move the person
 * straight to the new group, or to take them off the run. A told place that
 * is ALREADY in no group mid-term (taken out before this was refused) has no
 * weeks left to keep: placing it in a group is the board's plain move, as it
 * always was.
 */

/** A refusal of one person's move, the board's shape: a code, and the sentence when the board cannot word it from the code. */
export type BoardRefusal = { reason: string; words?: string };

/**
 * Whether this place is a candidate for a move made mid-term: an active
 * learner's place in a group, told its group. Only such a place can be one,
 * so only its registers are worth reading for "not held" (`readNotHeld`).
 */
export function mayBeMidTerm(place: CourseEnrolmentDoc): boolean {
  return place.role === "learner" && place.status === "active" && place.groupId !== null && placementIsTold(place);
}

/**
 * Whether a move of this place out of its group is made mid-term: a
 * candidate (`mayBeMidTerm`) which already has a record of groups by week,
 * or which has MET: one of its own sessions (each week's from the group it
 * belonged to, never a visit's host) has started and was neither called off
 * nor marked as not held on its register, the week rule's own test of a week
 * met. A place whose only past sessions were called off or not held met
 * nobody, and is moved as before the term. `notHeld` is read from the
 * registers (`readNotHeld`); with none, no session is not held.
 */
export function isMidTermBoardMove(
  run: CourseRunDoc,
  place: CourseEnrolmentDoc,
  groups: readonly CourseGroupDoc[],
  now: Date,
  notHeld: (session: ResolvedSession) => boolean = () => false,
): boolean {
  if (!mayBeMidTerm(place)) return false;
  if (hasGroupsByWeek(place)) return true;
  const sessionsOf = (groupId: string) => {
    const group = groups.find((each) => each.id === groupId);
    return group && !group.archived ? resolveSessions(run, group) : null;
  };
  return sessionsByWeekGroup(belonging(place), sessionsOf).some((session) => {
    if (session.cancelled || notHeld(session)) return false;
    const startsAt = sessionInstants(session).startsAt;
    return startsAt !== null && startsAt.getTime() <= now.getTime();
  });
}

/** `isMidTermBoardMove` with its registers read: a plain read, or a transaction's. */
export async function readIsMidTerm(
  readAll: Parameters<typeof readNotHeld>[0],
  db: Firestore,
  run: CourseRunDoc,
  place: CourseEnrolmentDoc,
  groups: readonly CourseGroupDoc[],
  now: Date,
): Promise<boolean> {
  if (!mayBeMidTerm(place)) return false;
  if (hasGroupsByWeek(place)) return true;
  const notHeld = await readNotHeld(readAll, db, run, place, groups, now);
  return isMidTermBoardMove(run, place, groups, now, notHeld);
}

/**
 * The refusal of a move into no group mid-term (see the note at the top), in
 * the board's sentence: the person's first name read from their account.
 */
export async function midTermToPoolRefusal(db: Firestore, uid: string, fromName: string): Promise<BoardRefusal> {
  const person = await namesOf(db, uid);
  return { reason: "mid-term-to-pool", words: midTermToPoolWords(person.firstName, fromName) };
}

/**
 * The refusal of a move made mid-term by somebody who does not make one (see
 * `movesForGoodMidTerm`), in the board's sentence: the person's first name
 * read from their account, the group they are in named.
 */
export async function midTermLeadOnlyRefusal(db: Firestore, uid: string, fromName: string): Promise<BoardRefusal> {
  const person = await namesOf(db, uid);
  return { reason: "mid-term-lead-only", words: midTermLeadOnlyWords(person.firstName, fromName) };
}

/** What the board says before a press, for one person: the week and the question, or why no week can be offered. */
export type BoardMovePlan =
  | { kind: "plain" }
  | { kind: "mid-term"; weekNumber: number; words: string; personName: string; firstName: string }
  | { kind: "refused"; refusal: BoardRefusal };

/** The person's names, from their account. */
async function namesOf(db: Firestore, uid: string): Promise<{ name: string; firstName: string }> {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
  const name = data ? fullNameOfUser(data) : "NAISI member";
  return { name, firstName: (data ? firstNameOfUser(data) : "") || name };
}

/** The run's groups, archived ones included: one equality. */
async function groupsOfRun(db: Firestore, runId: string): Promise<CourseGroupDoc[]> {
  const snap = await db.collection("courseGroups").where("runId", "==", runId).get();
  return snap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})).filter((group) => group.runId === runId);
}

/**
 * WHAT A MOVE ON THE BOARD WOULD DO, for one person, read outside any
 * transaction: a move as the board always made it (`plain`), a move made
 * mid-term with its week and the board's question, or the week rule's
 * refusal in its sentence. The caller has already decided the person is one
 * it may place, and the group one of the run's that still meets. The
 * question is worded only when `ask` (the preview): the press needs the week
 * alone, and is spared the reads of what is left behind. `timeAnswers` is
 * the caller's `readsTimeAnswers`: the question names a "most weeks" tick to
 * a reader of time answers alone (`leftBehindOf`).
 */
export async function planBoardMove(
  db: Firestore,
  run: CourseRunDoc,
  uid: string,
  toGroupId: string,
  now: Date,
  ask: boolean,
  timeAnswers: boolean,
): Promise<BoardMovePlan> {
  const placeSnap = await db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, uid)).get();
  if (!placeSnap.exists) return { kind: "plain" };
  const place = normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {});
  if (place.runId !== run.id || place.uid !== uid || place.groupId === toGroupId) return { kind: "plain" };
  const groups = await groupsOfRun(db, run.id);
  if (!mayBeMidTerm(place)) return { kind: "plain" };
  // The registers of their own sessions that have started, read once: for "met", and for the week rule.
  const notHeld = await readNotHeld((refs) => db.getAll(...refs), db, run, place, groups, now);
  if (!isMidTermBoardMove(run, place, groups, now, notHeld)) return { kind: "plain" };
  const from = groups.find((group) => group.id === place.groupId) ?? null;
  const to = groups.find((group) => group.id === toGroupId) ?? null;
  if (!to || to.archived) return { kind: "plain" };
  const person = await namesOf(db, uid);
  if (!from || from.archived) {
    return { kind: "refused", refusal: { reason: "old-no-longer-meets", words: oldNoLongerMeetsWords(person.firstName, from?.name ?? "") } };
  }
  const week = moveWeekFor(run, place, groups, to, now, notHeld);
  if (!week.ok) return { kind: "refused", refusal: { reason: "no-week", words: weekRefusalWords(week, person.firstName, from.name, to.name) } };
  if (!ask) return { kind: "mid-term", weekNumber: week.weekNumber, words: "", personName: person.name, firstName: person.firstName };
  const weeks = weeksThatCome(place.joinedWeekNumber, week.weekNumber);
  // What stays on the old group from week N on, as the move page says it.
  const leftBehind = await leftBehindOf(db, { run, from, place }, week.weekNumber, { timeAnswers });
  const words = boardMoveConfirmWords({
    name: person.name,
    firstName: person.firstName,
    toName: to.name,
    weekNumber: week.weekNumber,
    weeksStay: weeksStayWords(weeks, stayNamesFor(place, groups, from.id, weeks), person.firstName),
    oldOff: week.oldOff
      ? oldOffWords({ firstName: person.firstName, fromName: from.name, toName: to.name, dateKey: week.oldSession.dateKey, weekNumber: week.weekNumber, why: week.oldOff })
      : "",
    leftBehind: leftBehind.length > 0 ? leftBehindWords(person.firstName, from.name, leftBehind) : "",
  });
  return { kind: "mid-term", weekNumber: week.weekNumber, words, personName: person.name, firstName: person.firstName };
}

/** What stopped a board move inside its transaction. */
type Stop = { refusal: BoardRefusal };

/** What a board move's save did: the group it left, or why nothing was written. */
export type BoardMoveSaved = { ok: true; leftGroupId: string } | { ok: false; refusal: BoardRefusal };

/**
 * THE MOVE ITSELF, one person, in its own transaction (`moveFromWeek`): the
 * week worked out again from what that transaction read, and refused when it
 * is not the week the board stated (`fromWeek`, when the press sent one) or
 * the week the plan just read. The group it left when it is written (a seat
 * there is free from that commit); else the refusal.
 *
 * WHAT ONE MOVE COSTS: outside the transaction, the plan's reads (the place,
 * the run's groups by one equality, the person's account, and the registers
 * of the person's own sessions that have started, for "not held"); then one
 * transaction (the place, the run, the run's groups, those registers again)
 * that writes the place, two counts and two History rows.
 */
export async function saveBoardMove(
  db: Firestore,
  input: { run: CourseRunDoc; uid: string; toGroupId: string; fromWeek: number | null; actor: SessionUser; now: Date },
): Promise<BoardMoveSaved> {
  const refused = (refusal: BoardRefusal): BoardMoveSaved => ({ ok: false, refusal });
  // The press words nothing, so reads no time answer.
  const planned = await planBoardMove(db, input.run, input.uid, input.toGroupId, input.now, false, false);
  if (planned.kind === "refused") return refused(planned.refusal);
  // Not mid-term any longer (a race with another press): the board is out of date.
  if (planned.kind === "plain") return refused({ reason: "changed", words: MOVE_REFUSAL.changed });
  const person = { name: planned.personName, firstName: planned.firstName };
  if (input.fromWeek !== null && input.fromWeek !== planned.weekNumber) {
    return refused({ reason: "week-changed", words: boardWeekChangedWords(person.firstName, planned.weekNumber) });
  }
  const weekNumber = planned.weekNumber;
  const result = await moveFromWeek<Stop>(
    db,
    { runId: input.run.id, uid: input.uid, toGroupId: input.toGroupId, fromWeek: weekNumber },
    {
      toldAtPublish: true,
      async confirm(tx, seen) {
        if (seen.from.archived) return { refusal: { reason: "old-no-longer-meets", words: oldNoLongerMeetsWords(person.firstName, seen.from.name) } };
        // The week, by the rule, from the documents this transaction read.
        const notHeld = await readNotHeld((refs) => tx.getAll(...refs), db, seen.run, seen.place, seen.groups, input.now);
        const week = moveWeekFor(seen.run, seen.place, seen.groups, seen.to, input.now, notHeld);
        if (!week.ok) return { refusal: { reason: "no-week", words: weekRefusalWords(week, person.firstName, seen.from.name, seen.to.name) } };
        if (week.weekNumber !== weekNumber) return { refusal: { reason: "week-changed", words: boardWeekChangedWords(person.firstName, week.weekNumber) } };
        return null;
      },
      alsoWrite(tx, seen) {
        const actor = { uid: input.actor.uid, displayName: input.actor.displayName ?? "" };
        const shared = { run: seen.run, actor, weekId: weekDocId(weekNumber), reason: null, emailed: 0, subjectUid: input.uid };
        tx.create(
          db.collection(COURSE_AUDIT_COLLECTION).doc(),
          groupHistoryRow({
            ...shared,
            kind: "member-moved",
            group: seen.from,
            detail: boardMovedOutDetail(person.name, seen.to.name, weekNumber),
            after: { groupId: seen.to.id, group: seen.to.name.trim() },
          }),
        );
        tx.create(
          db.collection(COURSE_AUDIT_COLLECTION).doc(),
          groupHistoryRow({
            ...shared,
            kind: "member-moved",
            group: seen.to,
            detail: boardMovedInDetail(person.name, seen.from.name, weekNumber),
            before: { groupId: seen.from.id, group: seen.from.name.trim() },
          }),
        );
      },
    },
  );
  if (result.ok) return { ok: true, leftGroupId: result.fromGroupId };
  if (result.refusal === "stopped") return refused(result.stop.refusal);
  // The board's own codes, worded by the board as for any other move.
  if (result.refusal === "group-full" || result.refusal === "group-not-found" || result.refusal === "group-archived" || result.refusal === "facilitates-another-group") {
    return refused({ reason: result.refusal });
  }
  return refused({ reason: "changed", words: MOVE_REFUSAL.changed });
}
