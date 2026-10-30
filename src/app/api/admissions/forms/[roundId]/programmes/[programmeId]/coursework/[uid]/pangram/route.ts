import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { checkPersonPangram, loadPersonPangram } from "@/lib/courses/coursework/pangram";
import { COURSEWORK_DOOR_WORDS } from "@/lib/courses/coursework/claudeWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * PANGRAM ON ONE PERSON'S COURSEWORK (privacy v13). ADMINS ONLY: the
 * programme's lead is turned away at the door before anything is read, and
 * nothing a lead reaches carries a reading.
 *
 * GET answers each of their counted written answers and reflections of 50
 * words or more with its last reading, and whether its words changed since;
 * it writes nothing and sends nothing. POST `{ weekId? }` sends them (one
 * week's, or all), joined into one request, keeps each answer's reading and
 * answers the same view. A view-as session is turned away first. A flag
 * reads "worth a look", never a verdict. `src/lib/courses/coursework/pangram.ts`
 * holds the rules.
 */

export const maxDuration = 200;

type Ctx = { params: Promise<{ roundId: string; programmeId: string; uid: string }> };

function viewBody(view: Awaited<ReturnType<typeof loadPersonPangram>> & { ok: true }) {
  const { pangram, parts, tooShort, notCounted } = view.view;
  return { pangram, parts, tooShort, notCounted };
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { roundId, programmeId, uid } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId) || !isId(uid)) {
    return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.notHere }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const loaded = await loadPersonPangram(db, user, roundId, programmeId, uid);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  return NextResponse.json(viewBody(loaded), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const weekId = raw && typeof raw === "object" ? (raw as { weekId?: unknown }).weekId : undefined;
  if (weekId !== undefined && weekId !== null && (typeof weekId !== "string" || !/^w\d{2,3}$/.test(weekId))) {
    return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.badWeek }, { status: 400 });
  }
  const { roundId, programmeId, uid } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId) || !isId(uid)) {
    return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.notHere }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const checked = await checkPersonPangram(db, user, roundId, programmeId, uid, typeof weekId === "string" ? weekId : null);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  return NextResponse.json(viewBody(checked), { headers: { "Cache-Control": "no-store" } });
}
