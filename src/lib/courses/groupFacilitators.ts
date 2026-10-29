import "server-only";
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { courseApplicationId } from "@/lib/firestore/courseApplications";
import { courseEnrolmentId, enrolmentHasLeft } from "@/lib/firestore/courseEnrolments";

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
 *  2. it upserts a `role: "facilitator"` enrolment for the run, for somebody
 *     who holds no place on it, which is what makes the group appear on that
 *     person's /learn hub ("every run you touch" is one query over
 *     enrolments). Somebody who holds a place keeps their learner's row;
 *     the board turns a facilitator's row into a learner's when it places
 *     them;
 *  3. it keeps `facilitatorAppointments` (the record of how each uid got
 *     there) to the uids in the array: an answer writes who asked, when, and
 *     when they agreed; anybody taken off loses their record with their place.
 *     A change by hand writes no record for those it adds: nobody agreed to
 *     anything, and the record says only what happened.
 *
 * ## A facilitator who holds a place sits in the group they facilitate
 *
 * A facilitator can be one of the run's fellows as well: somebody with a
 * place on it, who does the course and is marked on its register like
 * everybody else, and runs the group's logistics too. Such a person SITS IN
 * THE GROUP THEY FACILITATE. So before anybody is added, `seatFor` asks where
 * they sit on the run:
 *
 *  - in this group already: nothing moves;
 *  - in no group yet (on the run's list, or placed once and taken out of
 *    their group on the board): the appointment PLACES THEM IN THIS GROUP, as
 *    the board's own placement would, room permitting (`placementsFor`);
 *  - in another group: nothing is saved. The board decides where people sit,
 *    so they are moved there first, or made a facilitator of their own group;
 *  - holding no place on the run (or having left it): they facilitate as a
 *    facilitator always has, with a facilitator's row.
 *
 * A learner's row is never turned into a facilitator's: their place, their
 * group and their history on the run stay theirs. Taking somebody off a
 * group's facilitators leaves their place where it is.
 *
 * The writes go into a batch or a transaction the caller owns, so an answer
 * and the appointment it makes commit together. A placement reads the
 * group's count of people, so a caller that places somebody reads the group,
 * their row and their row on the run's list inside a transaction.
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

// ---------------------------------------------------------------------------
// Where somebody sits, and the places an appointment makes
// ---------------------------------------------------------------------------

/** What `seatFor` is told about one person on the run. */
export type SeatFacts = {
  /**
   * Their row on the run (`courseEnrolments/{runId}__{uid}`), as stored, or
   * null for none. Only its `role`, `status` and `groupId` are read.
   */
  row: Readonly<Record<string, unknown>> | null;
  /**
   * Whether they are on the run's list as somebody accepted
   * (`courseApplications/{runId}__{uid}`), in a row the caller may place.
   * Only asked when they have no row on the run.
   */
  accepted: boolean;
};

export type Seat =
  /** A fellow of the run already in this group: nothing moves. */
  | { kind: "in-the-group" }
  /** A fellow of the run in no group yet: the appointment places them in this one. */
  | { kind: "place"; row: "update" | "create" }
  /** A fellow of the run in another group: the board decides where people sit. */
  | { kind: "elsewhere"; groupId: string }
  /** Nobody holding a place on the run: a facilitator's row, as always. */
  | { kind: "facilitator-only" };

/**
 * Where one person sits on the run, as an appointment to `groupId` sees it.
 * A learner's row that has not left is a fellow's; somebody with no row who
 * is on the run's list, accepted, is a fellow nobody has placed yet.
 * Anybody else holds no place on the run: a facilitator's row, a row that
 * has left, or no row and no acceptance.
 */
export function seatFor(groupId: string, facts: SeatFacts): Seat {
  const { row } = facts;
  if (row && row.role === "learner" && typeof row.status === "string" && !enrolmentHasLeft(row.status)) {
    if (row.groupId === groupId) return { kind: "in-the-group" };
    if (typeof row.groupId === "string" && row.groupId !== "") return { kind: "elsewhere", groupId: row.groupId };
    return { kind: "place", row: "update" };
  }
  if (!row && facts.accepted) return { kind: "place", row: "create" };
  return { kind: "facilitator-only" };
}

/** A place an appointment makes: a fellow's row moved into the group, or their first row. */
export type Placing = { row: "update" } | { row: "create"; joinedWeekNumber: number };

/** Why an appointment cannot be made, about one person. Nothing is saved. */
export type SeatProblem =
  | { kind: "elsewhere"; uid: string; groupId: string }
  | { kind: "full"; uid: string };

/**
 * THE PLACES AN APPOINTMENT MAKES, or the first reason it cannot be made.
 * Each person being added who holds a place on the run and sits in no group
 * is placed in this one; somebody in another group stops the whole
 * appointment, and so does a group with no room left for those it would
 * place (its capacity counts every fellow in it, facilitators who hold a
 * place among them, as the board's does). `joinedWeekNumber` is the group's
 * own clock for a first row (`joinedWeekFor`), as the board's first
 * placement stamps it.
 */
export function placementsFor(input: {
  group: { id: string; capacity: number | null; memberCount: number };
  added: readonly string[];
  seats: ReadonlyMap<string, SeatFacts>;
  joinedWeekNumber: number;
}): { ok: true; placing: Map<string, Placing> } | { ok: false; problem: SeatProblem } {
  const placing = new Map<string, Placing>();
  for (const uid of input.added) {
    const seat = seatFor(input.group.id, input.seats.get(uid) ?? { row: null, accepted: false });
    if (seat.kind === "elsewhere") return { ok: false, problem: { kind: "elsewhere", uid, groupId: seat.groupId } };
    if (seat.kind !== "place") continue;
    if (input.group.capacity !== null && input.group.memberCount + placing.size >= input.group.capacity) {
      return { ok: false, problem: { kind: "full", uid } };
    }
    placing.set(uid, seat.row === "create" ? { row: "create", joinedWeekNumber: input.joinedWeekNumber } : { row: "update" });
  }
  return { ok: true, placing };
}

/** Anything that takes Firestore writes: a batch or a transaction. */
type Writer = {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
  create(ref: DocumentReference, data: Record<string, unknown>): unknown;
  update(ref: DocumentReference, data: Record<string, unknown>): unknown;
};

/**
 * The writes that change a group's facilitators from `current` to `next`,
 * into the caller's batch or transaction. `enrolments` is each touched uid's
 * row on the run, read by the caller (a batch cannot read). `agreed` holds the
 * record for each uid an answer adds: its appointment is written with the
 * moment of the write as both when and when they agreed. `placing` holds the
 * places `placementsFor` decided, for added uids only: each is placed in this
 * group in the same write, and the group's count of people moves with them.
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
    placing?: ReadonlyMap<string, Placing>;
  },
): { added: string[]; removed: string[] } {
  const { runId, courseId } = input;
  const { added, removed } = facilitatorChange(input.current, input.next);
  const placed = added.filter((uid) => input.placing?.has(uid));

  const groupPatch: Record<string, unknown> = {
    facilitatorUids: [...input.next],
    updatedAt: FieldValue.serverTimestamp(),
  };
  // The group's count of people is every active, grouped learner's row, so a
  // fellow placed here counts as the board's placement counts them.
  if (placed.length > 0) groupPatch.memberCount = FieldValue.increment(placed.length);
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
    const place = input.placing?.get(uid);
    if (place?.row === "create") {
      // Their first row on the run, as the board's first placement writes
      // it (`POST /api/courses/runs/[runId]/allocate`): a learner's, in this
      // group, from their row on the run's list, on the group's own clock.
      // No placement email has gone, so the next Publish tells them.
      writer.create(ref, {
        runId,
        courseId,
        uid,
        groupId: input.groupRef.id,
        status: "active",
        role: "learner",
        applicationId: courseApplicationId(runId, uid),
        joinedWeekNumber: place.joinedWeekNumber,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      continue;
    }
    if (place?.row === "update") {
      // A fellow in no group: into this one. Publish's stamp certifies the
      // group they were told about, so a new group clears it, as a move on
      // the board does, and the next Publish tells them.
      writer.update(ref, {
        groupId: input.groupRef.id,
        allocatedEmailAt: FieldValue.delete(),
        // And any answer to "can you make this time?", which was about no
        // group of theirs now.
        timeAnswer: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      continue;
    }
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
