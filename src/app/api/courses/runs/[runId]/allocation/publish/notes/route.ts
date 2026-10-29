import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { draftPlacementNote } from "@/lib/courses/placementNotes/draft";
import { PLACEMENT_NOTE_LIMIT, tidyPlacementNote, type PlacementChoice } from "@/lib/courses/placementNotes/model";
import { readOutsideSection } from "@/lib/courses/placementNotes/section";
import { savePlacementChoice } from "@/lib/courses/placementNotes/store";
import {
  movedWords,
  notWaitingWords,
  ONLY_ADMINS_DRAFT,
  OWN_NOTE,
  SAY_CHOICE,
  SAY_WHO,
  TOO_LONG,
  WRITE_IT,
} from "@/lib/courses/placementNotes/words";

/**
 * A NOTE FOR SOMEBODY PLACED OUTSIDE THE TIMES THEY GAVE, on Publish's own
 * page ("Outside the times they gave").
 *
 *  - `GET` the section: the people a press of Publish would tell their group
 *    who are placed outside the times they gave, and what was chosen for
 *    each (`readOutsideSection`). Writes nothing.
 *  - `PUT { uid, groupId, choice: "note", text }` saves words of the caller's
 *    own for that person in that group; `{ choice: "none" }` saves "Send
 *    without a note". This is the only way words reach the email.
 *  - `POST { uid }` asks Claude for a draft and keeps it with Claude's other
 *    notes on the person's application. A draft is never sent. ADMINS ONLY.
 *
 * Each answers with the section as it stands after the change.
 *
 * WHO: an admin, or the lead of the programme that names the run, decided as
 * the section decides it, before anything is written. A view-as session is
 * refused before anything is read. A save is refused for anybody Publish
 * would not wait on now (told already, or now inside their times), and for
 * a group they are no longer in: a choice belongs to one person in one group.
 * Nobody writes a note to themselves; they may choose to go without one.
 *
 * NOTHING HERE TELLS ANYBODY ANYTHING: a saved note goes with their "Your
 * group" email, on the press of Publish that tells them.
 */

// One call to Claude, inside the backend's request limit.
export const maxDuration = 290;

type Ctx = { params: Promise<{ runId: string }> };

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = (await req.json()) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/** An id from the body, or null. */
function idOf(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id && id.length <= 160 && isAddressableId(id) ? id : null;
}

async function context(runId: string) {
  const actor = await getCurrentUser();
  if (!actor) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const db = getAdminDb();
  if (!db) return { error: NextResponse.json({ error: "Server not configured" }, { status: 500 }) } as const;
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return { error: NextResponse.json({ error: "Run not found" }, { status: 404 }) } as const;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const read = await readOutsideSection(db, actor, run);
  if (!read.ok) return { error: NextResponse.json({ error: read.error }, { status: read.status }) } as const;
  return { actor, db, run, read } as const;
}

/** The section again, after a change, for whoever made it. */
async function sectionAfter(runId: string) {
  const again = await context(runId);
  if ("error" in again) return again.error;
  return NextResponse.json({ ok: true, section: again.read.section }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;
  const found = await context(runId);
  if ("error" in found) return found.error;
  return NextResponse.json({ ok: true, section: found.read.section }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;
  const found = await context(runId);
  if ("error" in found) return found.error;
  const { actor, db, read } = found;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const uid = idOf(body.uid);
  const groupId = idOf(body.groupId);
  if (!uid || !groupId) return NextResponse.json({ error: SAY_WHO }, { status: 400 });
  const choice: PlacementChoice | null = body.choice === "note" || body.choice === "none" ? body.choice : null;
  if (!choice) return NextResponse.json({ error: SAY_CHOICE }, { status: 400 });
  const typed = typeof body.text === "string" ? body.text : "";
  if (choice === "note" && typed.length > PLACEMENT_NOTE_LIMIT) return NextResponse.json({ error: TOO_LONG }, { status: 400 });
  const text = choice === "note" ? tidyPlacementNote(typed) : "";
  if (choice === "note" && !text) return NextResponse.json({ error: WRITE_IT }, { status: 400 });

  // Only somebody Publish would wait on now, in the group they are in now.
  const person = read.plan.outside.find((entry) => entry.uid === uid);
  if (!person) {
    const name = read.plan.people.find((entry) => entry.uid === uid)?.name ?? "That person";
    return NextResponse.json({ error: notWaitingWords(name) }, { status: 409 });
  }
  if (person.groupId !== groupId) return NextResponse.json({ error: movedWords(person.name) }, { status: 409 });
  if (choice === "note" && uid === actor.uid) return NextResponse.json({ error: OWN_NOTE }, { status: 403 });

  try {
    await savePlacementChoice(db, {
      runId,
      uid,
      groupId,
      choice,
      text,
      by: { uid: actor.uid, name: actor.displayName?.trim().split(/\s+/)[0] || "An admin" },
    });
  } catch (err) {
    console.error("[placement note] could not save", runId, err);
    return NextResponse.json({ error: "Could not save that. Try again." }, { status: 500 });
  }
  return sectionAfter(runId);
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Claude drafts for an admin alone, refused before anything is read.
  if (actor.role !== "admin") return NextResponse.json({ error: ONLY_ADMINS_DRAFT }, { status: 403 });

  const found = await context(runId);
  if ("error" in found) return found.error;
  const { db, read } = found;

  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const uid = idOf(body.uid);
  if (!uid) return NextResponse.json({ error: SAY_WHO }, { status: 400 });
  const person = read.plan.outside.find((entry) => entry.uid === uid);
  if (!person) {
    const name = read.plan.people.find((entry) => entry.uid === uid)?.name ?? "That person";
    return NextResponse.json({ error: notWaitingWords(name) }, { status: 409 });
  }

  let drafted: Awaited<ReturnType<typeof draftPlacementNote>>;
  try {
    drafted = await draftPlacementNote(db, actor, runId, person);
  } catch (err) {
    console.error("[placement note] could not draft", runId, err);
    return NextResponse.json({ error: "Could not draft that note. Try again." }, { status: 500 });
  }
  if (!drafted.ok) return NextResponse.json({ error: drafted.error }, { status: drafted.status });
  return sectionAfter(runId);
}
