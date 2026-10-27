import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import { parseSharedNote } from "@/lib/courses/sharedNotes/parse";
import { writesSharedNotesOn } from "@/lib/courses/sharedNotes/readers";
import { SHARED_NOTE_REFUSAL } from "@/lib/courses/sharedNotes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { COURSE_GROUP_SHARED_NOTES_COLLECTION, runSharesGroupNotes } from "@/lib/firestore/courseGroupSharedNotes";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";

/**
 * A NOTE SHARED WITH A GROUP (C29, board wk-week-phone's "Notes shared with
 * your group"): somebody in the group, or one of its facilitators, adds a
 * note on a week's page, and the group, its facilitators, the programme's
 * lead and admins read it.
 *
 *   POST { body, weekNumber }  ->  { ok: true, id }
 *
 * WHO WRITES: somebody whose active place on the run is in THIS group, told
 * by Publish, on an account that stands, or a live facilitator of the group
 * (`writesSharedNotesOn`), and nobody else. The lead and admins read the
 * notes and write none. Everybody else, and a group that is not there, is one
 * 403, so probing ids tells nobody which groups exist; an admin is told the
 * group is missing, or who may write here.
 *
 * ORDER: view-as refused, the session, the body (a 400 with a sentence a
 * person can act on, before anything is read), the database, the group and
 * the gate, the run (there, not being destroyed, and one whose groups share
 * notes), the week (one of the group's taught weeks), the write.
 *
 * NOTHING READS NOTES HERE. There is no GET: the week's page reads them on the
 * server through `src/lib/courses/sharedNotes/readers.ts`, and
 * `firestore.rules` refuses every browser. The answer carries the new note's
 * id and nothing of anybody else's.
 *
 * Nobody is emailed or told: a note waits on the week's page.
 */

export type SharedNotePosted = { ok: true; id: string };

/** The group's run, unless it is gone or going. */
async function liveRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!isAddressableId(runId)) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || (snap.data() ?? {}).destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

export async function POST(req: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { groupId } = await ctx.params;
  if (!isAddressableId(groupId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The body is checked before any document is read.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: SHARED_NOTE_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseSharedNote(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const writes = Boolean(group && (await writesSharedNotesOn(db, actor, group)));
  if (!writes) {
    if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Reachable only by an admin, who could read the group anyway.
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    return NextResponse.json({ error: SHARED_NOTE_REFUSAL.notYours }, { status: 403 });
  }
  const run = group ? await liveRun(db, group.runId) : null;
  if (!group || !run || run.id !== group.runId || !runSharesGroupNotes(run)) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // The week the note is written on is one of the group's own taught weeks.
  if (parsed.weekNumber > resolveGroupCalendar(run, group).totalWeeks) {
    return NextResponse.json({ error: SHARED_NOTE_REFUSAL.week }, { status: 400 });
  }

  const ref = db.collection(COURSE_GROUP_SHARED_NOTES_COLLECTION).doc();
  await ref.set({
    runId: run.id,
    groupId: group.id,
    weekNumber: parsed.weekNumber,
    authorUid: actor.uid,
    body: parsed.body,
    createdAt: FieldValue.serverTimestamp(),
  });

  const answer: SharedNotePosted = { ok: true, id: ref.id };
  return NextResponse.json(answer);
}
