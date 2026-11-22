import { NextResponse } from "next/server";
import { savePitchingWeek } from "@/lib/applications/handover/pitchingWeekSave";
import { parsePitchingWeekBody } from "@/lib/courses/pitching/settings";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * PITCHING WEEK'S SETTINGS, saved from a programme's Groups, Pitches:
 * `PUT` with `{ teamsFrom, pickLimit, teamSizeMin, teamSizeMax, teamsMadeOn }`,
 * every key sent, each a value or null.
 *
 * The order: view-as is refused first, then the session (401), then the
 * body's shape and every check the run editor's Pitching week section makes
 * (400, `parsePitchingWeekBody`), then who may (the programme's lead or an
 * admin, from the form, before the run is read) and the run, then the write
 * (`savePitchingWeek`, which says what it writes and what it never touches).
 * Emails nobody.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
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
  const parsed = parsePitchingWeekBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const { roundId, programmeId } = await ctx.params;
  const outcome = await savePitchingWeek(db, user, roundId, programmeId, parsed.input);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, saved: outcome.saved, message: outcome.message, settings: outcome.settings });
}
