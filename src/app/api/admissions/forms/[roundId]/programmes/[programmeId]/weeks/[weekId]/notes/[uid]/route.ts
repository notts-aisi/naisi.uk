import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { discardWeekNote } from "@/lib/courses/weekNotes/store";
import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "DISCARD": AN ADMIN DELETES CLAUDE'S END-OF-WEEK DRAFT ABOUT ONE PERSON
 * (privacy v15: what Claude returns is seen by admins only), FOR AN ADMIN
 * ALONE. Decided on the session before the params or the database are read;
 * the week's door refuses anybody else again. A view-as session is turned
 * away first.
 *
 * DELETE: the draft goes, and nothing else; a note already saved is changed
 * or deleted from the person's notes, never here. Gone for good: drafting
 * again asks Claude again. `src/lib/courses/weekNotes/` holds the rules.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; weekId: string; uid: string }> };

const isWeekId = (value: unknown): value is string => typeof value === "string" && /^w\d{2}$/.test(value);

export async function DELETE(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: WEEK_NOTES_WORDS.onlyAdmins }, { status: 403 });
  const { roundId, programmeId, weekId, uid } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: WEEK_NOTES_WORDS.notHere }, { status: 404 });
  if (!isWeekId(weekId)) return NextResponse.json({ error: WEEK_NOTES_WORDS.badWeek }, { status: 400 });
  if (!isAddressableId(uid)) return NextResponse.json({ error: WEEK_NOTES_WORDS.noDraft }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const discarded = await discardWeekNote(db, user, { roundId, programmeId, weekId, uid }, new Date());
  if (!discarded.ok) return NextResponse.json({ error: discarded.error }, { status: discarded.status });
  return NextResponse.json({ discarded: true }, { headers: { "Cache-Control": "no-store" } });
}
