import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, fullNameOfUser } from "@/lib/courses/programmeLead";
import { noteByline } from "@/lib/courses/facilitatorPageWords";
import { londonDateKey } from "@/lib/courses/weekPlan";
import {
  COURSE_GROUP_NOTES_COLLECTION,
  normalizeCourseGroupNote,
  type CourseGroupNoteDoc,
} from "@/lib/firestore/courseGroupNotes";

/**
 * THE NOTES A GROUP'S FACILITATORS SHARE, read on the server (C30).
 *
 * Who may read them is decided by the page that calls this, before it does:
 * the group page for a live facilitator of the group or an admin, the
 * programme's Attendance tab for the lead of the programme that names the
 * run or an admin. Nothing here asks who is reading, so nothing here may be
 * called before that decision, and no route hands these rows to a browser.
 *
 * Each note comes back with its writer's names, worked out from their account
 * when it is read, and its day in London. Newest first. One equality on one
 * field per read, sorted in memory, so no read needs a declared index. A
 * read is bounded by what a run's facilitators write in a term: a few notes a
 * group a week.
 */

/** One note as a page shows it: who wrote it, on what day, and its words. */
export type GroupNoteView = {
  id: string;
  groupId: string;
  writerUid: string;
  /** The writer's whole name, for their initials. */
  writerName: string;
  /** The name over the note: "Sofia". */
  writerFirstName: string;
  /** The London day it was written, "YYYY-MM-DD", or "" when the stamp is missing. */
  dateKey: string;
  /** "Sofia · Wed 11 Nov". */
  byline: string;
  /** Plain text, shown as text. */
  body: string;
};

/** Newest first; a note with no stamp yet (just written) first of all; then by id, so the order is stable. */
function newestFirst(a: CourseGroupNoteDoc, b: CourseGroupNoteDoc): number {
  const at = (note: CourseGroupNoteDoc) => (note.createdAt ? note.createdAt.getTime() : Number.POSITIVE_INFINITY);
  return at(b) - at(a) || b.id.localeCompare(a.id);
}

async function withWriters(db: Firestore, notes: CourseGroupNoteDoc[]): Promise<GroupNoteView[]> {
  const uids = [...new Set(notes.map((note) => note.authorUid))].filter((uid) => uid && !uid.includes("/"));
  const accounts = new Map<string, Record<string, unknown>>();
  if (uids.length > 0) {
    const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  }
  return notes.map((note) => {
    const account = accounts.get(note.authorUid) ?? {};
    const writerName = fullNameOfUser(account);
    const writerFirstName = firstNameOfUser(account) || writerName;
    const dateKey = note.createdAt ? londonDateKey(note.createdAt) : "";
    return {
      id: note.id,
      groupId: note.groupId,
      writerUid: note.authorUid,
      writerName,
      writerFirstName,
      dateKey,
      byline: noteByline(writerFirstName, dateKey),
      body: note.body,
    };
  });
}

/** One group's notes, newest first, for a reader the caller has already let read them. */
export async function readGroupNotes(db: Firestore, group: { id: string; runId: string }): Promise<GroupNoteView[]> {
  const snap = await db.collection(COURSE_GROUP_NOTES_COLLECTION).where("groupId", "==", group.id).get();
  const notes = snap.docs
    .map((doc) => normalizeCourseGroupNote(doc.id, doc.data() ?? {}))
    .filter((note): note is CourseGroupNoteDoc => note !== null && note.runId === group.runId && note.groupId === group.id)
    .sort(newestFirst);
  return withWriters(db, notes);
}

/** Every group's notes on one run, by group id, newest first, for a reader the caller has already let read them. */
export async function readRunGroupNotes(db: Firestore, runId: string): Promise<Map<string, GroupNoteView[]>> {
  const snap = await db.collection(COURSE_GROUP_NOTES_COLLECTION).where("runId", "==", runId).get();
  const notes = snap.docs
    .map((doc) => normalizeCourseGroupNote(doc.id, doc.data() ?? {}))
    .filter((note): note is CourseGroupNoteDoc => note !== null && note.runId === runId)
    .sort(newestFirst);
  const views = await withWriters(db, notes);
  const byGroup = new Map<string, GroupNoteView[]>();
  for (const view of views) {
    const list = byGroup.get(view.groupId) ?? [];
    list.push(view);
    byGroup.set(view.groupId, list);
  }
  return byGroup;
}
