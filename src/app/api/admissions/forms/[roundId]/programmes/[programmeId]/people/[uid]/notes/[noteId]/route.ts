import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { deleteProgrammeNote, editProgrammeNote, openProgrammeNotes } from "@/lib/memberNotes/programme";
import { checkedChange } from "@/lib/memberNotes/store";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * ONE NOTE ABOUT A PERSON ON A PROGRAMME, for the programme's lead and admins
 * (privacy v15): change it (PATCH `{ text, audience?, suggest? }`) or delete
 * it (DELETE), after a view-as session is turned away and through the
 * programme's door (`openProgrammeNotes`), as the list route opens it.
 *
 * The lead changes or deletes only a note they added, while they may read
 * it: a note they may not read answers as a note that is not here, and
 * another's is refused. A lead's note stays kept for admins and leads. An
 * admin changes or deletes any note about the person, and may change who
 * reads it; a note is kept for leads only when it was written after its
 * person agreed to privacy v15. Who wrote it, when, where from and whether
 * Claude drafted it never change. Answers `{ ok: true }`; the screen reads
 * the list again.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; uid: string; noteId: string }> };

/** The programme's door, open on the person the address names, with the note's id; or the answer that refuses. */
async function opened(user: SessionUser, ctx: Ctx) {
  const { roundId, programmeId, uid, noteId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) {
    return { error: NextResponse.json({ error: NOTES_WORDS.noProgramme }, { status: 404 }) } as const;
  }
  if (!isId(uid)) return { error: NextResponse.json({ error: NOTES_WORDS.notOnProgramme }, { status: 404 }) } as const;
  if (!isId(noteId)) return { error: NextResponse.json({ error: NOTES_WORDS.gone }, { status: 404 }) } as const;
  const db = getAdminDb();
  if (!db) return { error: NextResponse.json({ error: "Server not configured" }, { status: 500 }) } as const;
  const door = await openProgrammeNotes(db, user, roundId, programmeId, uid);
  if (!door.ok) return { error: NextResponse.json({ error: door.error }, { status: door.status }) } as const;
  return { db, door, noteId } as const;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gate = await opened(user, ctx);
  if ("error" in gate) return gate.error;

  let body: { text?: unknown; audience?: unknown; suggest?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: NOTES_WORDS.empty400 }, { status: 400 });
  }
  const checked = checkedChange(body, gate.door.viewer);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const edited = await editProgrammeNote(gate.db, user, gate.door, gate.noteId, checked.change);
  if (!edited.ok) return NextResponse.json({ error: edited.error }, { status: edited.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gate = await opened(user, ctx);
  if ("error" in gate) return gate.error;

  const removed = await deleteProgrammeNote(gate.db, user, gate.door, gate.noteId);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return NextResponse.json({ ok: true });
}
