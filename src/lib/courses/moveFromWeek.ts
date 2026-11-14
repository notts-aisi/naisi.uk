import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
  type GroupFromWeek,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { joinedMarkerId, leftMarkerId } from "./allocationPublish";
import { isMoveWeek, recordAfterMove } from "./groupsByWeek";
import { lastTaughtWeek } from "./weekPlan";

/**
 * MOVING SOMEBODY TO ANOTHER GROUP FROM A WEEK: the one writer of a place's
 * record of groups by week (`groupsByWeek` on `courseEnrolments`).
 *
 * One transaction sets the place's group (`groupId`, the group they are in
 * NOW, which their facilitators, the roster and who reads their work go by)
 * and the record together, so the two can never disagree: from `fromWeek`
 * on they are in `toGroupId`, and every week before it stays where it was.
 * The record is kept consistent here and nowhere else (`recordAfterMove`):
 * in week order, no two entries from one week, no two in a row naming one
 * group, and the last entry's group the place's group. A move that leaves
 * one group for every week (a move from week 1, or back over every week it
 * changed) needs no record, and the field is deleted.
 *
 * What else it writes is what a move on the allocation board writes
 * (`POST /api/courses/runs/[runId]/allocate`): the two groups' `memberCount`
 * when the group changes, and, on a seat told before the group it was told
 * about was kept, that group in `toldGroupId`, so the seat stays told and the
 * next Publish knows what changed.
 *
 * IT ASKS NO GATE AND EMAILS NOBODY. Its one caller is the staff move
 * (`src/lib/courses/staffMove/save.ts`, behind the route
 * `POST /api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/move`
 * and its own gate), which emails after this has committed. It refuses, with
 * a reason a caller can turn into words, and never throws for a document
 * that is not there:
 *  - `bad-week`: the week is not a whole week from 1 to the limit, or it is
 *    past the last week of the run's plan (`lastTaughtWeek`);
 *  - `no-place`: no learner's place on the run that is still taking part, or
 *    no run;
 *  - `not-in-a-group`: a place in no group (place them on the board first);
 *  - `not-told`: Publish has not told them a group, so the board's move is
 *    the one to make, and the next Publish tells them;
 *  - `group-not-found` / `group-archived`: the group they go to is not one of
 *    the run's groups that still meet;
 *  - `own-group-not-found`: the group their place names is not one of the
 *    run's groups, so its count cannot be moved;
 *  - `facilitates-another-group`: they facilitate a group of the run, and
 *    sit in that group and no other;
 *  - `group-full`: the group is at its capacity (raise it first);
 *  - `unchanged`: the place already reads that way for every week;
 *  - `stopped`: the caller's own check inside the transaction stopped it
 *    (`MoveFromWeekStaff.confirm`), with what it answered.
 *
 * A STAFF MOVE MADE MID-TERM (`staff`) is told by its own emails, sent once
 * this has committed, so in the same transaction it also:
 *  - asks the caller's check (`confirm`) with what the transaction read,
 *    after every refusal above and before anything is written: the week the
 *    move is from and the count of its emails are worked out again there, so
 *    a session that started, or a facilitator who changed, between the page
 *    and the press stops it;
 *  - writes the group they move to as the group they were told about
 *    (`toldGroupId`), so the next Publish owes them nothing for this move;
 *  - does for them what Publish does after "You’ve moved"
 *    (`forgetMoveMarkers` in `./allocationPublish.ts`): deletes the `joined__`
 *    markers of the group they leave and the `left__` markers of the group
 *    they join, so the next Publish says nothing about this move and a later
 *    move back is announced afresh;
 *  - writes the caller's own rows (`alsoWrite`: the two groups' history).
 * It NEVER writes `allocatedEmailAt`: that is the instant Late is measured
 * from, and restamping it would read every week met before the move as
 * joined late.
 */

/** What the transaction read, handed to a staff move's own check and writes. */
export type MoveFromWeekRead = {
  run: CourseRunDoc;
  /** The run carries the destroy marker, as read in this transaction. */
  destroying: boolean;
  place: CourseEnrolmentDoc;
  /** The run's groups, archived ones included. */
  groups: CourseGroupDoc[];
  from: CourseGroupDoc;
  to: CourseGroupDoc;
};

/** A staff move made mid-term, told by its own emails (see the module header). */
export type MoveFromWeekStaff<Stop> = {
  /** Inside the transaction, before anything is written: null to go on, or what stopped the move. */
  confirm: (tx: Transaction, read: MoveFromWeekRead) => Promise<Stop | null>;
  /** Rows written in the same transaction once the move goes ahead. */
  alsoWrite?: (tx: Transaction, read: MoveFromWeekRead) => void;
};

export type MoveFromWeekInput = {
  runId: string;
  uid: string;
  toGroupId: string;
  /** The first week they are in `toGroupId`. */
  fromWeek: number;
};

export type MoveFromWeekRefusal =
  | "bad-week"
  | "no-place"
  | "not-in-a-group"
  | "not-told"
  | "group-not-found"
  | "group-archived"
  | "own-group-not-found"
  | "facilitates-another-group"
  | "group-full"
  | "unchanged";

export type MoveFromWeekResult<Stop = never> =
  | {
      ok: true;
      /** The group they were in before the move. */
      fromGroupId: string;
      toGroupId: string;
      /** The record now stored, or null when the place needs none. */
      groupsByWeek: GroupFromWeek[] | null;
    }
  | { ok: false; refusal: MoveFromWeekRefusal }
  | { ok: false; refusal: "stopped"; stop: Stop };

/** An id a document can be addressed by. */
function addressable(value: string): boolean {
  return Boolean(value) && !value.includes("/") && value !== "." && value !== "..";
}

/** Whether two records say the same thing (null for none). */
function sameRecord(a: readonly GroupFromWeek[] | null, b: readonly GroupFromWeek[] | null): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((entry, index) => entry.groupId === b[index].groupId && entry.fromWeek === b[index].fromWeek);
}

export async function moveFromWeek<Stop = never>(
  db: Firestore,
  input: MoveFromWeekInput,
  staff: MoveFromWeekStaff<Stop> | null = null,
): Promise<MoveFromWeekResult<Stop>> {
  const { runId, uid, toGroupId, fromWeek } = input;
  if (!isMoveWeek(fromWeek)) return { ok: false, refusal: "bad-week" };
  if (!addressable(runId) || !addressable(uid) || !addressable(toGroupId)) return { ok: false, refusal: "no-place" };

  return db.runTransaction(async (tx): Promise<MoveFromWeekResult<Stop>> => {
    const placeRef = db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid));
    // The run, for its plan's last week, and the run's groups, one equality:
    // the group they move to, the group they leave, and any group they
    // facilitate.
    const [placeSnap, runSnap, groupSnap] = await Promise.all([
      tx.get(placeRef),
      tx.get(db.collection("courseRuns").doc(runId)),
      tx.get(db.collection("courseGroups").where("runId", "==", runId)),
    ]);
    if (!placeSnap.exists || !runSnap.exists) return { ok: false, refusal: "no-place" };
    const place = normalizeCourseEnrolment(placeSnap.id, placeSnap.data() ?? {});
    if (place.runId !== runId || place.uid !== uid || place.role !== "learner" || place.status !== "active") {
      return { ok: false, refusal: "no-place" };
    }
    // A week of the run's plan: never one past its last taught week.
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const lastWeek = lastTaughtWeek(run.weekPlan);
    if (lastWeek === null || fromWeek > lastWeek) return { ok: false, refusal: "bad-week" };
    const fromGroupId = place.groupId;
    if (!fromGroupId) return { ok: false, refusal: "not-in-a-group" };
    if (!placementIsTold(place)) return { ok: false, refusal: "not-told" };

    const groups = groupSnap.docs
      .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
      .filter((group) => group.runId === runId);
    const target = groups.find((group) => group.id === toGroupId) ?? null;
    if (!target) return { ok: false, refusal: "group-not-found" };
    if (target.archived) return { ok: false, refusal: "group-archived" };
    // The group they leave, whose count the move takes one off: a document
    // that is not there is refused here, never left to fail the write.
    const from = groups.find((group) => group.id === fromGroupId) ?? null;
    if (!from) return { ok: false, refusal: "own-group-not-found" };
    const facilitates = groups.filter((group) => !group.archived && group.facilitatorUids.includes(uid));
    if (facilitates.length > 0 && !facilitates.some((group) => group.id === toGroupId)) {
      return { ok: false, refusal: "facilitates-another-group" };
    }

    const record = recordAfterMove(place, toGroupId, fromWeek);
    const moving = fromGroupId !== toGroupId;
    if (!moving && sameRecord(record, place.groupsByWeek ?? null)) return { ok: false, refusal: "unchanged" };
    if (moving && target.capacity !== null && target.memberCount >= target.capacity) {
      return { ok: false, refusal: "group-full" };
    }

    // A staff move's own check, with what was read, before any write.
    const read: MoveFromWeekRead = { run, destroying: (runSnap.data() ?? {}).destroying === true, place, groups, from, to: target };
    if (staff) {
      const stop = await staff.confirm(tx, read);
      if (stop !== null) return { ok: false, refusal: "stopped", stop };
    }

    const patch: Record<string, unknown> = {
      groupId: toGroupId,
      groupsByWeek: record ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (staff && moving) {
      // Told about the group they join by the staff move's own emails: the
      // next Publish owes them nothing. `allocatedEmailAt` is never written.
      patch.toldGroupId = toGroupId;
    } else if (moving && place.toldGroupId === null) {
      // A seat told before the group it was told about was kept was told about
      // the group it leaves, as a move on the board writes it.
      patch.toldGroupId = fromGroupId;
    }
    tx.update(placeRef, patch);
    if (staff && moving) {
      // What Publish forgets after "You’ve moved": their time in the group they
      // leave, and any earlier time out of the group they join.
      for (const facilitatorUid of from.facilitatorUids) {
        tx.delete(db.collection("courseNudges").doc(joinedMarkerId(runId, from.id, facilitatorUid, uid)));
      }
      for (const facilitatorUid of target.facilitatorUids) {
        tx.delete(db.collection("courseNudges").doc(leftMarkerId(runId, target.id, facilitatorUid, uid)));
      }
    }
    if (moving) {
      tx.update(db.collection("courseGroups").doc(fromGroupId), {
        memberCount: FieldValue.increment(-1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(db.collection("courseGroups").doc(toGroupId), {
        memberCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (staff?.alsoWrite) staff.alsoWrite(tx, read);
    return { ok: true, fromGroupId, toGroupId, groupsByWeek: record };
  });
}
