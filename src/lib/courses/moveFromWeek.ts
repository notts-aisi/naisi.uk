import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
  type GroupFromWeek,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
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
 * IT ASKS NO GATE AND EMAILS NOBODY. Its caller is a route behind its own
 * gate, and nothing calls it from a route yet. It refuses, with a reason a
 * caller can turn into words, and never throws for a document that is not
 * there:
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
 *  - `unchanged`: the place already reads that way for every week.
 */

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

export type MoveFromWeekResult =
  | {
      ok: true;
      /** The group they were in before the move. */
      fromGroupId: string;
      toGroupId: string;
      /** The record now stored, or null when the place needs none. */
      groupsByWeek: GroupFromWeek[] | null;
    }
  | { ok: false; refusal: MoveFromWeekRefusal };

/** An id a document can be addressed by. */
function addressable(value: string): boolean {
  return Boolean(value) && !value.includes("/") && value !== "." && value !== "..";
}

/** Whether two records say the same thing (null for none). */
function sameRecord(a: readonly GroupFromWeek[] | null, b: readonly GroupFromWeek[] | null): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((entry, index) => entry.groupId === b[index].groupId && entry.fromWeek === b[index].fromWeek);
}

export async function moveFromWeek(db: Firestore, input: MoveFromWeekInput): Promise<MoveFromWeekResult> {
  const { runId, uid, toGroupId, fromWeek } = input;
  if (!isMoveWeek(fromWeek)) return { ok: false, refusal: "bad-week" };
  if (!addressable(runId) || !addressable(uid) || !addressable(toGroupId)) return { ok: false, refusal: "no-place" };

  return db.runTransaction(async (tx): Promise<MoveFromWeekResult> => {
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
    const lastWeek = lastTaughtWeek(normalizeCourseRun(runSnap.id, runSnap.data() ?? {}).weekPlan);
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
    if (!groups.some((group) => group.id === fromGroupId)) return { ok: false, refusal: "own-group-not-found" };
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

    const patch: Record<string, unknown> = {
      groupId: toGroupId,
      groupsByWeek: record ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    // A seat told before the group it was told about was kept was told about
    // the group it leaves, as a move on the board writes it.
    if (moving && place.toldGroupId === null) patch.toldGroupId = fromGroupId;
    tx.update(placeRef, patch);
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
    return { ok: true, fromGroupId, toGroupId, groupsByWeek: record };
  });
}
