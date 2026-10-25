import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { SHARED_NOTE_REFUSAL } from "@/lib/courses/sharedNotes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import {
  COURSE_GROUP_SHARED_NOTES_COLLECTION,
  normalizeCourseGroupSharedNote,
} from "@/lib/firestore/courseGroupSharedNotes";

/**
 * DELETE A NOTE SHARED WITH A GROUP (C29), for the person who wrote it.
 *
 *   DELETE  ->  { ok: true }
 *
 * WHO DELETES: the note's writer, and nobody else: not the group's
 * facilitators, not the programme's lead, not an admin. A note is its
 * writer's words; whether it stays is theirs to say. The writer may delete it
 * whether or not they are still in the group, because the words are still
 * theirs.
 *
 * Everybody else, and a note that is not there or not on this group, is one
 * 403, so probing ids tells nobody which notes exist; an admin is told the
 * note is missing, or whose it is to delete.
 *
 * ORDER: view-as refused, the ids, the session, the database, the note and
 * the gate, the delete. Nobody is emailed or told.
 */

export type SharedNoteDeleted = { ok: true };

export async function DELETE(_req: Request, ctx: { params: Promise<{ groupId: string; noteId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId, noteId } = await ctx.params;
  if (!isAddressableId(groupId) || !isAddressableId(noteId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const ref = db.collection(COURSE_GROUP_SHARED_NOTES_COLLECTION).doc(noteId);
  const snap = await ref.get();
  const note = snap.exists ? normalizeCourseGroupSharedNote(snap.id, snap.data() ?? {}) : null;
  const here = note !== null && note.groupId === groupId;
  if (!here || note.authorUid !== actor.uid) {
    if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Reachable only by an admin, who reads every group's notes anyway.
    if (!here) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    return NextResponse.json({ error: SHARED_NOTE_REFUSAL.notYoursToDelete }, { status: 403 });
  }

  await ref.delete();
  const answer: SharedNoteDeleted = { ok: true };
  return NextResponse.json(answer);
}
