import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { draftWeekNote } from "@/lib/courses/weekNotes/store";
import { WEEK_NOTES_WORDS } from "@/lib/courses/weekNotes/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * CLAUDE DRAFTS ONE PERSON'S END-OF-WEEK NOTE (privacy v15: "Once a week
 * Claude may also draft a short note on how each person is doing, using only
 * the work they submitted and the feedback, ratings and comments people on
 * the team gave it"), FOR AN ADMIN ALONE: what Claude returns is seen by
 * admins only. Decided on the session before the body, the params or the
 * database are read, so the programme's lead, a reviewer and everybody else
 * stop here; the week's door (`openWeekNotes`, `adminOnly`) refuses them
 * again before the run is read. A view-as session is turned away first.
 *
 * POST `{ uid, again? }`: one person, once every group has met the week,
 * whose week is submitted and not reopened since. Sends one request to
 * Anthropic, with labels and numbers in place of names, and keeps the draft
 * with the run. Refused when a note from this week is already saved, or a
 * draft is already there and `again` is not true; with `again`, an unsaved
 * draft is replaced. The page's "Draft this week's notes" sends one of these
 * per person, three at a time. Nobody is emailed.
 * `src/lib/courses/weekNotes/` holds the rules.
 */

export const maxDuration = 290;

type Ctx = { params: Promise<{ roundId: string; programmeId: string; weekId: string }> };

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
  const body = raw && typeof raw === "object" ? (raw as { uid?: unknown; again?: unknown }) : {};
  if (typeof body.uid !== "string" || !isAddressableId(body.uid)) return NextResponse.json({ error: WEEK_NOTES_WORDS.badUid }, { status: 400 });
  const { roundId, programmeId, weekId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: WEEK_NOTES_WORDS.notHere }, { status: 404 });
  if (!isWeekId(weekId)) return NextResponse.json({ error: WEEK_NOTES_WORDS.badWeek }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const drafted = await draftWeekNote(db, user, { roundId, programmeId, weekId, uid: body.uid, again: body.again === true }, new Date());
  if (!drafted.ok) return NextResponse.json({ error: drafted.error }, { status: drafted.status });
  return NextResponse.json({ drafted: true }, { headers: { "Cache-Control": "no-store" } });
}
