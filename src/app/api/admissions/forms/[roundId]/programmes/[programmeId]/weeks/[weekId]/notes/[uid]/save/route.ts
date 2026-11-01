import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { saveWeekNote } from "@/lib/courses/weekNotes/store";
import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * "SAVE TO THEIR NOTES": AN ADMIN KEEPS CLAUDE'S END-OF-WEEK DRAFT AS A NOTE
 * (privacy v15: nothing Claude returns is filed on a person's profile
 * "except a note an admin has read, edited and saved, which says it was
 * drafted by Claude"), FOR AN ADMIN ALONE. Decided on the session before the
 * body, the params or the database are read; the week's door refuses anybody
 * else again. A view-as session is turned away first.
 *
 * POST `{ text, audience, suggest }`: the admin's own words from the box,
 * who reads the note ("leads": admins and the programme's leads; "admins")
 * and what it suggests for next term (ticked by a person, never by Claude).
 * Kept with `draftedByClaude`, its week and what the draft was built from,
 * and the draft deleted, in one transaction; refused while the person's week
 * is not submitted, or when a note from this week is already kept. Nobody is
 * emailed. `src/lib/courses/weekNotes/` holds the rules.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; weekId: string; uid: string }> };

const isWeekId = (value: unknown): value is string => typeof value === "string" && /^w\d{2}$/.test(value);

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: WEEK_NOTES_WORDS.onlyAdmins }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const body = raw && typeof raw === "object" ? (raw as { text?: unknown; audience?: unknown; suggest?: unknown }) : {};
  // The shape, before anything is read: the words and who reads them are checked again with the note's own rules.
  if (typeof body.text !== "string" || !body.text.trim()) return NextResponse.json({ error: NOTES_WORDS.empty400 }, { status: 400 });
  if (body.audience !== "admins" && body.audience !== "leads") return NextResponse.json({ error: NOTES_WORDS.audience400 }, { status: 400 });
  const { roundId, programmeId, weekId, uid } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: WEEK_NOTES_WORDS.notHere }, { status: 404 });
  if (!isWeekId(weekId)) return NextResponse.json({ error: WEEK_NOTES_WORDS.badWeek }, { status: 400 });
  if (!isAddressableId(uid)) return NextResponse.json({ error: WEEK_NOTES_WORDS.notFellow }, { status: 404 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const saved = await saveWeekNote(
    db,
    user,
    { roundId, programmeId, weekId, uid, text: body.text, audience: body.audience, suggest: body.suggest },
    new Date(),
  );
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ id: saved.id }, { headers: { "Cache-Control": "no-store" } });
}
