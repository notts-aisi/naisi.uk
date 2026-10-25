import { NextResponse } from "next/server";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { NOTE_REFUSAL } from "@/lib/courses/facilitatorPageWords";
import { parseGroupNote } from "@/lib/courses/groupNotes/parse";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { COURSE_GROUP_NOTES_COLLECTION } from "@/lib/firestore/courseGroupNotes";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * A NOTE A GROUP'S FACILITATORS SHARE (C30, board wk-fac-group's "Notes for
 * you and Sofia"): one facilitator writes it on the group's page, and the
 * group's other facilitators, the programme's lead and admins read it.
 *
 *   POST { body }  ->  { ok: true, id }
 *
 * WHO WRITES: a live facilitator of THIS group (`isNamedWithStanding` on the
 * group's `facilitatorUids`, the group not archived), and nobody else. The
 * lead and admins read the notes and write none: the notes are the
 * facilitators' own. Everybody else, and a group that is not there, is one
 * 403, so probing ids tells nobody which groups exist; an admin is told the
 * group is missing, or that the notes are its facilitators' to write.
 *
 * ORDER: view-as refused, the session, the body (a 400 with a sentence a
 * person can act on, before anything is read), the database, the group and
 * the gate, the run, the write.
 *
 * NOTHING READS NOTES HERE. There is no GET: the pages that show notes read
 * them on the server (`src/lib/courses/groupNotes/readers.ts`) after their
 * own gate, and `firestore.rules` refuses every browser. The answer carries
 * the new note's id and nothing of anybody else's.
 *
 * Nobody is emailed or told: a note waits on the group's page.
 */

export type GroupNotePosted = { ok: true; id: string };

/** The run the group is on, unless it is gone or going. */
async function runIsLive(db: Firestore, runId: string): Promise<boolean> {
  if (!isAddressableId(runId)) return false;
  const snap = await db.collection("courseRuns").doc(runId).get();
  return snap.exists && (snap.data() ?? {}).destroying !== true;
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
    return NextResponse.json({ error: NOTE_REFUSAL.body }, { status: 400 });
  }
  const parsed = parseGroupNote(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ── The gate ──────────────────────────────────────────────────────────────
  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  const group = groupSnap.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const facilitates = Boolean(
    group && !group.archived && isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids),
  );
  if (!facilitates) {
    if (actor.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // Reachable only by an admin, who could read the group anyway.
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
    return NextResponse.json({ error: NOTE_REFUSAL.notYours }, { status: 403 });
  }
  if (!group || !(await runIsLive(db, group.runId))) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const ref = db.collection(COURSE_GROUP_NOTES_COLLECTION).doc();
  await ref.set({
    runId: group.runId,
    groupId: group.id,
    authorUid: actor.uid,
    body: parsed.body,
    createdAt: FieldValue.serverTimestamp(),
  });

  const answer: GroupNotePosted = { ok: true, id: ref.id };
  return NextResponse.json(answer);
}
