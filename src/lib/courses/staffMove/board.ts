import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { groupHistoryRow } from "@/lib/courses/groupChange/facts";
import { moveFromWeek } from "@/lib/courses/moveFromWeek";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { belonging, hasGroupsByWeek, sessionsByWeekGroup } from "../groupsByWeek";
import { moveWeekFor, readNotHeld, stayNamesFor, weekRefusalWords } from "./plan";
import { weeksThatCome, type MoveWeek } from "./week";
import {
  MOVE_REFUSAL,
  boardMoveConfirmWords,
  boardMovedInDetail,
  boardMovedOutDetail,
  boardWeekChangedWords,
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
 * Now a move of a place that has been told its group, once a session of the
 * group it belongs to has started (or a place that already has a record of
 * groups by week), goes through the one writer of that record
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
 * WHAT THE BOARD SAYS BEFORE THE PRESS is `planBoardMove`: the week, and that
 * the earlier weeks stay with the old group. The press may send that week
 * back (`fromWeek`): when the rule now gives another, nothing is written and
 * the board is told so.
 */

/** A refusal of one person's move, the board's shape: a code, and the sentence when the board cannot word it from the code. */
export type BoardRefusal = { reason: string; words?: string };

/**
 * Whether a move of this place to another group is made mid-term: an active
 * learner's place in a group, told its group, which already has a record of
 * groups by week, or one of whose own sessions (each week's from the group it
 * belonged to, never a visit's host) has started, called off or not.
 */
export function isMidTermBoardMove(
  run: CourseRunDoc,
  place: CourseEnrolmentDoc,
  groups: readonly CourseGroupDoc[],
  now: Date,
): boolean {
  if (place.role !== "learner" || place.status !== "active" || !place.groupId || !placementIsTold(place)) return false;
  if (hasGroupsByWeek(place)) return true;
  const sessionsOf = (groupId: string) => {
    const group = groups.find((each) => each.id === groupId);
    return group && !group.archived ? resolveSessions(run, group) : null;
  };
  return sessionsByWeekGroup(belonging(place), sessionsOf).some((session) => {
    const startsAt = sessionInstants(session).startsAt;
    return startsAt !== null && startsAt.getTime() <= now.getTime();
  });
}

/** What the board says before a press, for one person: the week and the question, or why no week can be offered. */
export type BoardMovePlan =
  | { kind: "plain" }
  | { kind: "mid-term"; weekNumber: number; words: string; personName: string }
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

/** The week by the rule, now, for this place moved to `to`. */
async function weekNow(db: Firestore, run: CourseRunDoc, place: CourseEnrolmentDoc, groups: readonly CourseGroupDoc[], to: CourseGroupDoc, now: Date): Promise<MoveWeek> {
  const notHeld = await readNotHeld((refs) => db.getAll(...refs), db, run, place, groups, now);
  return moveWeekFor(run, place, groups, to, now, notHeld);
}

/**
 * WHAT A MOVE ON THE BOARD WOULD DO, for one person, read outside any
 * transaction: a move as the board always made it (`plain`), a move made
 * mid-term with its week and the board's question, or the week rule's
 * refusal in its sentence. The caller has already decided the person is one
 * it may place, and the group one of the run's that still meets.
 */
export async function planBoardMove(db: Firestore, run: CourseRunDoc, uid: string, toGroupId: string, now: Date): Promise<BoardMovePlan> {
  const placeSnap = await db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, uid)).get();
  if (!placeSnap.exists) return { kind: "plain" };
  const place = normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {});
  if (place.runId !== run.id || place.uid !== uid || place.groupId === toGroupId) return { kind: "plain" };
  const groups = await groupsOfRun(db, run.id);
  if (!isMidTermBoardMove(run, place, groups, now)) return { kind: "plain" };
  const from = groups.find((group) => group.id === place.groupId) ?? null;
  const to = groups.find((group) => group.id === toGroupId) ?? null;
  if (!to || to.archived) return { kind: "plain" };
  const person = await namesOf(db, uid);
  if (!from || from.archived) {
    return { kind: "refused", refusal: { reason: "old-no-longer-meets", words: oldNoLongerMeetsWords(person.firstName, from?.name ?? "") } };
  }
  const week = await weekNow(db, run, place, groups, to, now);
  if (!week.ok) return { kind: "refused", refusal: { reason: "no-week", words: weekRefusalWords(week, person.firstName, from.name, to.name) } };
  const weeks = weeksThatCome(place.joinedWeekNumber, week.weekNumber);
  const words = boardMoveConfirmWords({
    name: person.name,
    firstName: person.firstName,
    toName: to.name,
    weekNumber: week.weekNumber,
    weeksStay: weeksStayWords(weeks, stayNamesFor(place, groups, from.id, weeks), person.firstName),
    oldOff: week.oldOff
      ? oldOffWords({ firstName: person.firstName, fromName: from.name, toName: to.name, dateKey: week.oldSession.dateKey, weekNumber: week.weekNumber, why: week.oldOff })
      : "",
  });
  return { kind: "mid-term", weekNumber: week.weekNumber, words, personName: person.name };
}

/** What stopped a board move inside its transaction. */
type Stop = { refusal: BoardRefusal };

/**
 * THE MOVE ITSELF, one person, in its own transaction (`moveFromWeek`): the
 * week worked out again from what that transaction read, and refused when it
 * is not the week the board stated (`fromWeek`, when the press sent one) or
 * the week the plan just read. Null when it is written; else the refusal.
 */
export async function saveBoardMove(
  db: Firestore,
  input: { run: CourseRunDoc; uid: string; toGroupId: string; fromWeek: number | null; actor: SessionUser; now: Date },
): Promise<BoardRefusal | null> {
  const planned = await planBoardMove(db, input.run, input.uid, input.toGroupId, input.now);
  if (planned.kind === "refused") return planned.refusal;
  // Not mid-term any longer (a race with another press): the board is out of date.
  if (planned.kind === "plain") return { reason: "changed", words: MOVE_REFUSAL.changed };
  const person = await namesOf(db, input.uid);
  if (input.fromWeek !== null && input.fromWeek !== planned.weekNumber) {
    return { reason: "week-changed", words: boardWeekChangedWords(person.firstName, planned.weekNumber) };
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
  if (result.ok) return null;
  if (result.refusal === "stopped") return result.stop.refusal;
  // The board's own codes, worded by the board as for any other move.
  if (result.refusal === "group-full" || result.refusal === "group-not-found" || result.refusal === "group-archived" || result.refusal === "facilitates-another-group") {
    return { reason: result.refusal };
  }
  return { reason: "changed", words: MOVE_REFUSAL.changed };
}
