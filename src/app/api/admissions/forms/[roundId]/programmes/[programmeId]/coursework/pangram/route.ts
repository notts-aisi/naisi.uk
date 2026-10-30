import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { pangramWeekPlan } from "@/lib/courses/coursework/pangram";
import { COURSEWORK_DOOR_WORDS, PANGRAM_WORDS } from "@/lib/courses/coursework/claudeWords";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * BEFORE "Check N people with Pangram" on a week of the Coursework tab
 * (privacy v13): `?week=w03` answers who would be sent, one request each,
 * and how many answers, so the button says it before the press. ADMINS ONLY:
 * the programme's lead is turned away at the door, before anything is read.
 * It writes nothing and sends nothing; the presses go to each person's own
 * route (`coursework/[uid]/pangram`), one at a time.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // An admin's alone, decided on the session before anything is read: the
  // programme's lead, a reviewer and everybody else stop here.
  if (!canRunTerm(user)) return NextResponse.json({ error: PANGRAM_WORDS.onlyAdmins }, { status: 403 });
  const { roundId, programmeId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.notHere }, { status: 404 });
  const week = new URL(req.url).searchParams.get("week");
  if (!week || !/^w\d{2,3}$/.test(week)) return NextResponse.json({ error: COURSEWORK_DOOR_WORDS.badWeek }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const planned = await pangramWeekPlan(db, user, roundId, programmeId, week);
  if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status });
  const { pangram, people, answers } = planned.plan;
  return NextResponse.json({ pangram, people, answers }, { headers: { "Cache-Control": "no-store" } });
}
