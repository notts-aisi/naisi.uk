import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser, type SessionUser } from "@/lib/firebase/session";
import { checkedText, deleteNote, editNote, gateNotes } from "@/lib/memberNotes/store";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * ONE NOTE ABOUT A PERSON: change its words (PATCH `{ text }`) or delete it
 * (DELETE). An admin, about somebody else (`gateNotes`), after a view-as
 * session is turned away. Who wrote it, when, where from and whether Claude
 * drafted it never change; an admin who changes another's words is kept as
 * `editedByUid`. A note about somebody else answers as a note that is not
 * here. Answers `{ ok: true }`; the screen reads the list again.
 */

type Ctx = { params: Promise<{ uid: string; noteId: string }> };

async function gated(user: SessionUser, ctx: Ctx) {
  const { uid, noteId } = await ctx.params;
  const refused = gateNotes(user, uid);
  if (refused) return { error: NextResponse.json({ error: refused.error }, { status: refused.status }) } as const;
  if (!isAddressableId(uid) || !isAddressableId(noteId)) {
    return { error: NextResponse.json({ error: NOTES_WORDS.gone }, { status: 404 }) } as const;
  }
  return { user, uid, noteId } as const;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gate = await gated(user, ctx);
  if ("error" in gate) return gate.error;

  let body: { text?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: NOTES_WORDS.empty400 }, { status: 400 });
  }
  const text = checkedText(body.text);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: text.status });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const edited = await editNote(db, gate.user, gate.uid, gate.noteId, text.text);
  if (!edited.ok) return NextResponse.json({ error: edited.error }, { status: edited.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const gate = await gated(user, ctx);
  if ("error" in gate) return gate.error;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const removed = await deleteNote(db, gate.uid, gate.noteId);
  if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status });
  return NextResponse.json({ ok: true });
}
