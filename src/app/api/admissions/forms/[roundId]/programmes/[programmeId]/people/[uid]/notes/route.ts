import { NextResponse } from "next/server";
import { claudeConfigured } from "@/lib/ai/claude";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { addProgrammeNote, loadProgrammeNotes, openProgrammeNotes, projectNotesForLead } from "@/lib/memberNotes/programme";
import { checkedNote } from "@/lib/memberNotes/store";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * THE NOTES ABOUT ONE PERSON ON A PROGRAMME, for the programme's lead and
 * admins (privacy v15): the list, and a new note. `src/lib/memberNotes/programme.ts`
 * holds the door and what each of them is shown.
 *
 * WHO MAY: the programme's lead or an admin, about somebody else who holds a
 * place on the programme now or facilitates one of its run's live groups
 * (`openProgrammeNotes`), decided from the form before anything about the
 * person is read. A reviewer is told the notes are not theirs, and anybody
 * else is answered as a programme that is not there. A POST is turned away
 * in a view-as session first.
 *
 * GET answers the lead with the notes kept for leads, `{ notes, forLeads }`
 * (`projectNotesForLead`), and never how many others there are. An admin is
 * answered as the programme's page in the admin area answers one, `{ notes,
 * hidden, agreed, runs, forLeads, claude }`. It writes nothing.
 *
 * POST `{ text, audience?, suggest?, draftedByClaude? }` keeps a note from the
 * programme's run. The lead's is always kept for admins and leads ("leads",
 * which they may leave out), is never one Claude drafted, and is kept only
 * about somebody who has agreed to privacy v15. An admin chooses `audience`
 * every time. Answers `{ id }`; the screen reads the list again.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; uid: string }> };

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { roundId, programmeId, uid } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: NOTES_WORDS.noProgramme }, { status: 404 });
  if (!isId(uid)) return NextResponse.json({ error: NOTES_WORDS.notOnProgramme }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const door = await openProgrammeNotes(db, user, roundId, programmeId, uid);
  if (!door.ok) return NextResponse.json({ error: door.error }, { status: door.status });
  const loaded = await loadProgrammeNotes(db, user, door);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (loaded.viewer === "lead") return NextResponse.json(projectNotesForLead(loaded.lead), { headers: NO_STORE });
  const { notes, hidden, agreed, runs, forLeads } = loaded.payload;
  // An admin's, as on the admins' route: whether Claude can draft here at all.
  return NextResponse.json({ notes, hidden, agreed, runs, forLeads, claude: claudeConfigured() }, { headers: NO_STORE });
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { roundId, programmeId, uid } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: NOTES_WORDS.noProgramme }, { status: 404 });
  if (!isId(uid)) return NextResponse.json({ error: NOTES_WORDS.notOnProgramme }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const door = await openProgrammeNotes(db, user, roundId, programmeId, uid);
  if (!door.ok) return NextResponse.json({ error: door.error }, { status: door.status });

  let body: { text?: unknown; audience?: unknown; suggest?: unknown; draftedByClaude?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: NOTES_WORDS.empty400 }, { status: 400 });
  }
  const checked = checkedNote(body, door.viewer);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const added = await addProgrammeNote(db, user, door, checked.fields);
  if (!added.ok) return NextResponse.json({ error: added.error }, { status: added.status });
  return NextResponse.json({ id: added.id });
}
