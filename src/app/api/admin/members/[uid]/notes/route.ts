import { NextResponse } from "next/server";
import { claudeConfigured } from "@/lib/ai/claude";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { addNote, checkedNote, gateNotes, loadNotes, type AdminNotesPlace } from "@/lib/memberNotes/store";
import { NOTES_WORDS } from "@/lib/memberNotes/words";

/**
 * THE NOTES KEPT ABOUT ONE PERSON, ON THE ADMINS' SIDE (privacy v13, v15):
 * the list, and a new note. `src/lib/memberNotes/model.ts` holds the rules.
 *
 * WHO MAY: an admin, about somebody else (`gateNotes`), decided before
 * anything is read; the person a note is about never reads one, an admin
 * included. A POST is turned away in a view-as session first. A programme's
 * lead reads and writes through the programme's own route instead
 * (`/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes`).
 *
 * GET `?place=profile` (every note), `?place=application` (only notes written
 * after the person agreed to privacy v13), `?place=run&run=<runId>` (those,
 * and earlier notes written from that run). Each note says who reads it.
 * It writes nothing.
 *
 * POST `{ text, audience, suggest?, runId?, draftedByClaude? }` keeps a note.
 * `audience` is the admin's choice every time, "admins" or "leads"; a note is
 * kept for leads only about somebody who has agreed to privacy v15.
 * `suggest` lists what it suggests them for next term, ticked by the admin.
 * `draftedByClaude` is the admin's Save of Claude's draft, which the draft
 * route never stores itself. Answers `{ id }`; the screen reads the list
 * again.
 */

type Ctx = { params: Promise<{ uid: string }> };

function placeFrom(url: URL): AdminNotesPlace | null {
  const place = url.searchParams.get("place") ?? "profile";
  if (place === "profile") return { kind: "profile" };
  if (place === "application") return { kind: "application" };
  if (place === "run") {
    const runId = url.searchParams.get("run") ?? "";
    return isAddressableId(runId) ? { kind: "run", runId } : null;
  }
  return null;
}

export async function GET(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { uid } = await ctx.params;
  const refused = gateNotes(user, uid);
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
  if (!isAddressableId(uid)) return NextResponse.json({ error: NOTES_WORDS.noAccount }, { status: 404 });
  const place = placeFrom(new URL(req.url));
  if (!place) return NextResponse.json({ error: NOTES_WORDS.badPlace }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const loaded = await loadNotes(db, user, uid, place);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { notes, hidden, agreed, runs, forLeads } = loaded.payload;
  // Whether Claude can draft here at all: with no key the screen says so and
  // offers no button.
  return NextResponse.json(
    { notes, hidden, agreed, runs, forLeads, claude: claudeConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { uid } = await ctx.params;
  const refused = gateNotes(user, uid);
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status });
  if (!isAddressableId(uid)) return NextResponse.json({ error: NOTES_WORDS.noAccount }, { status: 404 });

  let body: { text?: unknown; audience?: unknown; suggest?: unknown; runId?: unknown; draftedByClaude?: unknown };
  try {
    body = ((await req.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ error: NOTES_WORDS.empty400 }, { status: 400 });
  }
  const checked = checkedNote(body, "admin");
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const runId = body.runId === undefined || body.runId === null || body.runId === "" ? null : body.runId;
  if (runId !== null && (typeof runId !== "string" || !isAddressableId(runId))) {
    return NextResponse.json({ error: NOTES_WORDS.badRun }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const added = await addNote(db, user, uid, { ...checked.fields, runId });
  if (!added.ok) return NextResponse.json({ error: added.error }, { status: added.status });
  return NextResponse.json({ id: added.id });
}
