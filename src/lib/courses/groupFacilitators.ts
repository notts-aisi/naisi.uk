import "server-only";
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { courseEnrolmentId } from "@/lib/firestore/courseEnrolments";

/**
 * STAFFING A GROUP: the one place a group's facilitators are changed. Two
 * doors use it, and nothing else may write `courseGroups.facilitatorUids`:
 *
 *  - by hand, through `POST /api/courses/groups/[groupId]/facilitators`, the
 *    route the run editor's group card and a programme's Facilitators view
 *    "Change" use, which intersects what it is sent with the approved
 *    accounts before it gets here;
 *  - by an answer, when somebody asked to facilitate says yes
 *    (`src/lib/courses/facilitatorAsks/answer.ts`).
 *
 * `courseGroups.facilitatorUids` is server-owned (pinned in rules) because
 * changing it does THREE things that must not drift apart:
 *
 *  1. it grants the facilitator read and edit access to the group (rules
 *     resolve `isGroupFacilitator()` off this array);
 *  2. it upserts a `role: "facilitator"` enrolment for the run, which is what
 *     makes the group appear on that person's /learn hub ("every run you
 *     touch" is one query over enrolments);
 *  3. it keeps `facilitatorAppointments` (the record of how each uid got
 *     there) to the uids in the array: an answer writes who asked, when, and
 *     when they agreed; anybody taken off loses their record with their place.
 *     A change by hand writes no record for those it adds: nobody agreed to
 *     anything, and the record says only what happened.
 *
 * The writes go into a batch or a transaction the caller owns, so an answer
 * and the appointment it makes commit together.
 */

/** Who goes on and who comes off, from the group's facilitators now and those wanted. */
export function facilitatorChange(current: readonly string[], next: readonly string[]): { added: string[]; removed: string[] } {
  const nextSet = new Set(next);
  const currentSet = new Set(current);
  return {
    added: next.filter((uid) => !currentSet.has(uid)),
    removed: current.filter((uid) => !nextSet.has(uid)),
  };
}

/** The run's row of each uid a change touches, by uid: what decides add or retire. */
export function enrolmentRefsFor(db: Firestore, runId: string, uids: readonly string[]): DocumentReference[] {
  return uids.map((uid) => db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)));
}

/** How one uid came to facilitate the group, when an answer put them there. */
export type AppointmentRecord = {
  /** Who asked them. */
  byUid: string;
  /** That person's name, as the record keeps it. */
  byName: string;
};

/** Anything that takes Firestore writes: a batch or a transaction. */
type Writer = {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
  update(ref: DocumentReference, data: Record<string, unknown>): unknown;
};

/**
 * The writes that change a group's facilitators from `current` to `next`,
 * into the caller's batch or transaction. `enrolments` is each touched uid's
 * row on the run, read by the caller (a batch cannot read). `agreed` holds the
 * record for each uid an answer adds: its appointment is written with the
 * moment of the write as both when and when they agreed.
 */
export function writeFacilitatorChange(
  writer: Writer,
  db: Firestore,
  input: {
    groupRef: DocumentReference;
    runId: string;
    courseId: string;
    current: readonly string[];
    next: readonly string[];
    enrolments: ReadonlyMap<string, DocumentSnapshot | undefined>;
    /** The uids the group's `facilitatorAppointments` holds a record for now. */
    recorded: ReadonlySet<string>;
    agreed?: ReadonlyMap<string, AppointmentRecord>;
  },
): { added: string[]; removed: string[] } {
  const { runId, courseId } = input;
  const { added, removed } = facilitatorChange(input.current, input.next);

  const groupPatch: Record<string, unknown> = {
    facilitatorUids: [...input.next],
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const uid of added) {
    const record = input.agreed?.get(uid);
    if (!record) continue;
    groupPatch[`facilitatorAppointments.${uid}`] = {
      at: FieldValue.serverTimestamp(),
      byUid: record.byUid,
      byName: record.byName,
      agreedAt: FieldValue.serverTimestamp(),
    };
  }
  // A uid taken off the group takes its record with it: the map is the
  // record of how each uid IN the array got there.
  for (const uid of removed) {
    if (input.recorded.has(uid)) groupPatch[`facilitatorAppointments.${uid}`] = FieldValue.delete();
  }
  writer.update(input.groupRef, groupPatch);

  for (const uid of added) {
    const snap = input.enrolments.get(uid);
    const ref = db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid));
    if (!snap?.exists) {
      writer.set(ref, {
        runId,
        courseId,
        uid,
        // Facilitators carry a null `groupId` on purpose: that scalar is the
        // LEARNER allocation invariant (one placement per person per run).
        // Which group someone facilitates is `courseGroups.facilitatorUids`,
        // which is also what lets one person facilitate two groups.
        groupId: null,
        status: "active",
        role: "facilitator",
        applicationId: null,
        // Facilitators aren't paced or scored, so week 1 is the neutral
        // anchor: `joinedWeekNumber` only scopes learner percentages.
        joinedWeekNumber: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      continue;
    }
    const existing = snap.data() ?? {};
    // A learner enrolment is never overwritten: flipping its role would
    // discard their group placement and their learner history on this run.
    // They still get facilitator access via `facilitatorUids` above.
    if (existing.role === "facilitator") {
      writer.update(ref, { status: "active", updatedAt: FieldValue.serverTimestamp() });
    }
  }

  for (const uid of removed) {
    const snap = input.enrolments.get(uid);
    if (!snap?.exists) continue;
    const existing = snap.data() ?? {};
    // Retire rather than delete, and only ever a facilitator row: a learner
    // enrolment for the same (run, uid) shares this doc id, and someone who
    // learned on the run before facilitating it must keep that history.
    // "removed" (not a delete) also keeps the audit trail of who staffed what.
    if (existing.role === "facilitator") {
      const ref = db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid));
      writer.update(ref, { status: "removed", updatedAt: FieldValue.serverTimestamp() });
    }
  }

  return { added, removed };
}
