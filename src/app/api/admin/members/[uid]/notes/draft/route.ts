import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { draftNote } from "@/lib/memberNotes/draft";
import { gateNotes } from "@/lib/memberNotes/store";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * "Draft a note with Claude" (privacy v13): `{ runId }`. Claude reads the
 * person's coursework on that run, only what they wrote after they agreed to
 * privacy v13, with no name in it, and drafts a note for other admins. The
 * answer is the draft, `{ text }`, for the admin's box. NOTHING IS STORED:
 * only Save note keeps it, through the notes route, marked as drafted by
 * Claude. `src/lib/memberNotes/draft.ts` says what is sent.
 *
 * WHO MAY: an admin, about somebody else, after a view-as session is turned
 * away and before anything is read. A POST, because it sends coursework to
 * Anthropic. It may take most of the backend's request limit.
 */

export const maxDuration = 290;

type Ctx = { params: Promise<{ uid: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { uid } = await ctx.params;
  const refused = gateNotes(user, uid);
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
  if (!isAddressableId(uid)) return NextResponse.json({ error: NOTES_WORDS.noAccount }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const runId = raw && typeof raw === "object" ? (raw as { runId?: unknown }).runId : undefined;
  if (typeof runId !== "string" || !isAddressableId(runId)) {
    return NextResponse.json({ error: NOTES_WORDS.badRun }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const drafted = await draftNote(db, user, uid, runId);
  if (!drafted.ok) return NextResponse.json({ error: drafted.error }, { status: drafted.status });
  return NextResponse.json({ text: drafted.text, sent: drafted.sent }, { headers: { "Cache-Control": "no-store" } });
}
