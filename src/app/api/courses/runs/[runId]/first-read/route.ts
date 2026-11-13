import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { MAX_IDS, MAX_ID_LENGTH, MAX_PEOPLE, markFirstRead, type FirstReadAsk } from "@/lib/courses/weekWork/firstRead";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * WHEN AN ANSWER WAS FIRST READ: `POST /api/courses/runs/[runId]/first-read`
 * `{ weekId, people: [{ uid, ids }] }`, made by the reading view of one
 * person's week and the page of one question across a group once they have
 * drawn the answers named, and by This week's work (the facilitator's group
 * page, the programme's page for a group's week) once a person's boxes are
 * opened; never by their GET and never while they render, so a link preview
 * or a prefetch marks nothing.
 *
 * It keeps, on each person's week record, the day each answer named was
 * first put in front of somebody who may read it in full, where no time is
 * there yet, and, the first time, when this site began keeping them. NEVER
 * WHO. What may be marked, and by whom, is
 * `src/lib/courses/weekWork/firstRead.ts`, asking the gates every reading page
 * asks: nobody marks their own work, an answer the caller may not read in
 * full is passed over, and a time once set never moves.
 *
 * View-as is refused first, so an admin looking as somebody else never marks
 * anything in their name. Then the session, then the body, before anything is
 * read. It answers `{ ok: true }` and nothing else: never a time, never which
 * answers were marked or passed over.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type FirstReadAnswer = { ok: true };

const SAY_WHICH = "Say which week, whose answers and which of them.";

async function bodyOf(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The people named and their answers, or null for a body that does not say. */
function peopleOf(value: unknown): FirstReadAsk[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PEOPLE) return null;
  const out: FirstReadAsk[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const { uid, ids } = entry as { uid?: unknown; ids?: unknown };
    // An id too long to name a document is refused here, before anybody's time is kept, never by the database midway.
    if (typeof uid !== "string" || !isAddressableId(uid) || uid.length > MAX_ID_LENGTH || seen.has(uid)) return null;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) return null;
    if (!ids.every((id): id is string => typeof id === "string" && isAddressableId(id) && id.length <= MAX_ID_LENGTH)) return null;
    seen.add(uid);
    out.push({ uid, ids: [...new Set(ids)] });
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  const body = await bodyOf(req);
  const weekId = typeof body?.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  const people = body ? peopleOf(body.people) : null;
  if (!people || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) return NextResponse.json({ error: SAY_WHICH }, { status: 400 });

  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const outcome = await markFirstRead(db, actor, { runId, weekId, weekNumber, people, now: new Date() });
    if (!outcome.ok) return NextResponse.json({ error: outcome.status === 404 ? "Not found" : "Forbidden" }, { status: outcome.status });
  } catch (err) {
    console.error("[courses first-read] not kept", runId, weekId, err);
    return NextResponse.json({ error: "Not kept" }, { status: 500 });
  }
  const answer: FirstReadAnswer = { ok: true };
  return NextResponse.json(answer);
}
