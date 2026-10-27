import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { runStaffingOf } from "@/lib/courses/runStaffing";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment, placementIsTold } from "@/lib/firestore/courseEnrolments";
import {
  COURSE_GROUP_SHARED_NOTES_COLLECTION,
  normalizeCourseGroupSharedNote,
  runSharesGroupNotes,
  type CourseGroupSharedNoteDoc,
} from "@/lib/firestore/courseGroupSharedNotes";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { SharedNoteView, SharedNotesSection, WeekSharedNotes } from "./views";
import {
  NOTES_SHARED_WITH_YOUR_GROUP,
  notesSharedWithHeading,
  sharedNoteByline,
  sharedNotesWhoLine,
} from "./words";

export type { SharedNoteView, SharedNotesSection, WeekSharedNotes } from "./views";

/**
 * WHO READS AND WRITES WHICH GROUP'S SHARED NOTES ON A RUN (C29), and the one
 * reader of `courseGroupSharedNotes`. Nothing else reads the collection
 * (`tests/course-hub-shared-notes.test.mjs` walks the tree for a reader that is
 * not this file), and no route hands a note to a browser except as a page
 * this file has let its reader see.
 *
 *  - A GROUP'S PEOPLE: a learner placed in the group, told by Publish
 *    (`placementIsTold`), not left, on an account that still stands. They
 *    read their group's notes while their place is live (active, or the run
 *    completed) and write while it is active.
 *  - ITS LIVE FACILITATORS: named on the group, the group not archived, the
 *    account standing. They read and write their own group's notes, each of
 *    their groups separately.
 *  - THE PROGRAMME'S LEAD AND ADMINS read every group's notes on the run and
 *    write none (`runStaffingOf`: the lead of the programme that names the
 *    run, or an admin).
 *  - Nobody else: not the run's track leads, not a programme's reviewers, not
 *    another group, not somebody who left or whom Publish has not told.
 *
 * Only a run whose groups share notes has any (`runSharesGroupNotes`): a run
 * anyone can join reads to everybody as having none.
 *
 * Every read is one equality on one field, sorted in memory, so no read needs
 * a declared index. A read is bounded by what a group writes in a term.
 */

export type SharedNotesReading = {
  /** Reads every group's notes on the run: the programme's lead or an admin. */
  all: boolean;
  /** The groups whose notes the caller reads as one of their people or facilitators. */
  reads: ReadonlySet<string>;
  /** The groups the caller may add a note to. */
  writes: ReadonlySet<string>;
  /** The group the caller's own place is in, when they read its notes as one of its people. */
  own: string | null;
};

export const READS_NO_NOTES: SharedNotesReading = { all: false, reads: new Set(), writes: new Set(), own: null };

/** Whether this reading lets its reader see this group's notes. */
export function readsGroupNotes(reading: SharedNotesReading, groupId: string): boolean {
  return reading.all || reading.reads.has(groupId);
}

/** A live facilitator of this group. */
function facilitates(actor: SessionUser, group: CourseGroupDoc): boolean {
  return !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
}

/**
 * The caller's own place on the run, ADDRESSED and never queried, so there
 * is no way to spell somebody else's row: the group it names and whether it
 * is active, or null when it is no place in a group (none, a facilitator's
 * row, not told, left, removed, or an account that no longer stands).
 */
async function ownPlace(
  db: Firestore,
  actor: SessionUser,
  runId: string,
): Promise<{ groupId: string; active: boolean } | null> {
  if (!runId || runId.includes("/")) return null;
  const snap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get();
  if (!snap.exists) return null;
  const enrolment = normalizeCourseEnrolment(snap.id, snap.data() ?? {});
  const placed =
    enrolment.runId === runId &&
    enrolment.role === "learner" &&
    Boolean(enrolment.groupId) &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    placementIsTold(enrolment) &&
    isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid);
  return placed && enrolment.groupId ? { groupId: enrolment.groupId, active: enrolment.status === "active" } : null;
}

/**
 * What the caller reads and writes on this run, from their live session.
 * `groups` is every group of the run (archived ones are nobody's).
 */
export async function sharedNotesReadingOf(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
): Promise<SharedNotesReading> {
  if (!runSharesGroupNotes(run)) return READS_NO_NOTES;
  const live = groups.filter((group) => group.runId === run.id && !group.archived);
  const reads = new Set<string>();
  const writes = new Set<string>();
  for (const group of live) {
    if (!facilitates(actor, group)) continue;
    reads.add(group.id);
    writes.add(group.id);
  }
  const place = await ownPlace(db, actor, run.id);
  const own = place && live.some((group) => group.id === place.groupId) ? place.groupId : null;
  if (place && own) {
    reads.add(own);
    if (place.active) writes.add(own);
  }
  const staffing = await runStaffingOf(db, actor, run);
  return { all: staffing.isAdmin || staffing.leadOf !== null, reads, writes, own };
}

/**
 * THE ADD ROUTE'S GATE, for one group: the same two ways in as
 * `sharedNotesReadingOf`'s writers, and no others. A live facilitator of the
 * group, or somebody whose active, told place on the group's run is in it.
 * The lead and admins read the notes and write none. Whether the group's run
 * is there and shares notes at all is the route's to ask next.
 */
export async function writesSharedNotesOn(db: Firestore, actor: SessionUser, group: CourseGroupDoc): Promise<boolean> {
  if (group.archived) return false;
  if (facilitates(actor, group)) return true;
  const place = await ownPlace(db, actor, group.runId);
  return Boolean(place && place.active && place.groupId === group.id);
}

/**
 * The name a person goes by, as the run's member pages name people: the name
 * they chose, then their account's, never an address.
 */
function goesByName(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
  const display = typeof data.displayName === "string" ? data.displayName.trim() : "";
  return preferred || display || "NAISI member";
}

/** Newest first; a note with no stamp yet (just written) first of all; then by id, so the order is stable. */
function newestFirst(a: CourseGroupSharedNoteDoc, b: CourseGroupSharedNoteDoc): number {
  const at = (note: CourseGroupSharedNoteDoc) => (note.createdAt ? note.createdAt.getTime() : Number.POSITIVE_INFINITY);
  return at(b) - at(a) || b.id.localeCompare(a.id);
}

async function views(db: Firestore, notes: CourseGroupSharedNoteDoc[], readerUid: string): Promise<SharedNoteView[]> {
  const uids = [...new Set(notes.map((note) => note.authorUid))].filter((uid) => uid && !uid.includes("/"));
  const accounts = new Map<string, Record<string, unknown>>();
  if (uids.length > 0) {
    const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  return notes.map((note) => {
    const writerName = goesByName(accounts.get(note.authorUid) ?? {});
    const writerFirstName = writerName.split(/\s+/)[0] ?? writerName;
    const dateKey = note.createdAt ? londonDateKey(note.createdAt) : "";
    return {
      id: note.id,
      groupId: note.groupId,
      weekNumber: note.weekNumber,
      writerUid: note.authorUid,
      writerName,
      writerFirstName,
      dateKey,
      byline: sharedNoteByline(writerFirstName, dateKey),
      body: note.body,
      mine: Boolean(readerUid) && note.authorUid === readerUid,
    };
  });
}

/**
 * One group's notes, newest first, for a reader `reading` lets see them, and
 * null for anybody else. `reading` is `sharedNotesReadingOf` for the same
 * caller and run.
 */
export async function loadGroupSharedNotes(
  db: Firestore,
  actor: SessionUser,
  run: Pick<CourseRunDoc, "id">,
  groupId: string,
  reading: SharedNotesReading,
): Promise<SharedNoteView[] | null> {
  if (!readsGroupNotes(reading, groupId)) return null;
  const snap = await db.collection(COURSE_GROUP_SHARED_NOTES_COLLECTION).where("groupId", "==", groupId).get();
  const notes = snap.docs
    .map((doc) => normalizeCourseGroupSharedNote(doc.id, doc.data() ?? {}))
    .filter((note): note is CourseGroupSharedNoteDoc => note !== null && note.runId === run.id && note.groupId === groupId)
    .sort(newestFirst);
  return views(db, notes, actor.uid);
}

/**
 * Every group's notes on the run, by group id, newest first, for the
 * programme's lead and admins (`reading.all`), and an empty map for anybody
 * else: a group's people and facilitators read their own group's with
 * `loadGroupSharedNotes`, one group at a time.
 */
export async function loadRunSharedNotes(
  db: Firestore,
  actor: SessionUser,
  run: Pick<CourseRunDoc, "id">,
  reading: SharedNotesReading,
): Promise<Map<string, SharedNoteView[]>> {
  const byGroup = new Map<string, SharedNoteView[]>();
  if (!reading.all) return byGroup;
  const snap = await db.collection(COURSE_GROUP_SHARED_NOTES_COLLECTION).where("runId", "==", run.id).get();
  const notes = snap.docs
    .map((doc) => normalizeCourseGroupSharedNote(doc.id, doc.data() ?? {}))
    .filter((note): note is CourseGroupSharedNoteDoc => note !== null && note.runId === run.id)
    .sort(newestFirst);
  for (const view of await views(db, notes, actor.uid)) {
    const list = byGroup.get(view.groupId) ?? [];
    list.push(view);
    byGroup.set(view.groupId, list);
  }
  return byGroup;
}

/** The group's name, for putting sections in order. */
function nameOf(group: CourseGroupDoc): string {
  return group.name.trim();
}

/**
 * WHAT A WEEK'S PAGE DRAWS OF THE NOTES, for one reader (`WeekSharedNotes`).
 * Null on a run whose groups share none, or that has no live group: that
 * page keeps the run's comments on each reading. Otherwise a section for the
 * group the reader's own place is in, under the board's "Notes shared with
 * your group", then one for each other group they facilitate, named, so a
 * facilitator of two groups reads each group's notes under its own name. The
 * programme's lead and admins read every group's notes on the programme's
 * Attendance tab (`sharedNotesForAttendance`), not here.
 */
export async function sharedNotesForWeekPage(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  leadFirstName: string | null,
): Promise<WeekSharedNotes> {
  const live = groups.filter((group) => group.runId === run.id && !group.archived);
  if (!runSharesGroupNotes(run) || live.length === 0) return null;
  const reading = await sharedNotesReadingOf(db, actor, run, live);
  const mine = live
    .filter((group) => reading.reads.has(group.id))
    .sort((a, b) =>
      a.id === reading.own ? -1 : b.id === reading.own ? 1 : nameOf(a).localeCompare(nameOf(b)) || a.id.localeCompare(b.id),
    );
  const sections: SharedNotesSection[] = [];
  for (const group of mine) {
    const notes = await loadGroupSharedNotes(db, actor, run, group.id, reading);
    if (!notes) continue;
    const member = group.id === reading.own;
    sections.push({
      groupId: group.id,
      heading: member ? NOTES_SHARED_WITH_YOUR_GROUP : notesSharedWithHeading(group.name),
      whoLine: sharedNotesWhoLine({ groupName: group.name, reader: member ? "member" : "facilitator", leadFirstName }),
      canWrite: reading.writes.has(group.id),
      notes,
    });
  }
  return { sections };
}

/**
 * THE NOTES ON THE PROGRAMME'S ATTENDANCE TAB, for its lead and admins: a
 * section for each live group that has any, named, newest first, with no way
 * to add one (they read the notes and write none). Empty for anybody else,
 * and on a run whose groups share none.
 */
export async function sharedNotesForAttendance(
  db: Firestore,
  actor: SessionUser,
  run: CourseRunDoc,
  groups: readonly CourseGroupDoc[],
  leadFirstName: string | null,
): Promise<SharedNotesSection[]> {
  const live = groups.filter((group) => group.runId === run.id && !group.archived);
  if (!runSharesGroupNotes(run) || live.length === 0) return [];
  const reading = await sharedNotesReadingOf(db, actor, run, live);
  if (!reading.all) return [];
  const byGroup = await loadRunSharedNotes(db, actor, run, reading);
  const reader = actor.role === "admin" ? "admin" : "lead";
  return live
    .filter((group) => (byGroup.get(group.id) ?? []).length > 0)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || a.id.localeCompare(b.id))
    .map((group) => ({
      groupId: group.id,
      heading: notesSharedWithHeading(group.name),
      whoLine: sharedNotesWhoLine({ groupName: group.name, reader, leadFirstName }),
      canWrite: false,
      notes: byGroup.get(group.id) ?? [],
    }));
}
