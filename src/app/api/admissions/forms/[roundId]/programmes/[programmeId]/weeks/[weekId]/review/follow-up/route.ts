import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { isId } from "@/lib/applications/normalise";
import { isAddressableId } from "@/lib/addressableId";
import { askFollowUp } from "@/lib/courses/weekReview/followUp";
import { REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "ASK RAHUL TO HAVE A WORD WITH GRACE", from a week's review (privacy v15),
 * FOR AN ADMIN ALONE, decided on the session before the params, the body or
 * the database are read, as the review's own route is. A view-as session is
 * turned away first.
 *
 * POST `{ uid }`: the person to have a word with, who must hold a place on
 * the programme and not facilitate on its run. Makes one task for their
 * group's live facilitators, with fixed words and no reason, and emails each
 * of them whose task emails are on (`src/lib/courses/weekReview/followUp.ts`).
 * Who it reaches is read on the server; the request names only the person.
 * Asking twice in a week is refused.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; weekId: string }> };

const isWeekId = (value: unknown): value is string => typeof value === "string" && /^w\d{2}$/.test(value);

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: REVIEW_WORDS.onlyAdmins }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const uid = raw && typeof raw === "object" ? (raw as { uid?: unknown }).uid : undefined;
  if (typeof uid !== "string" || !isAddressableId(uid)) return NextResponse.json({ error: REVIEW_WORDS.followUpBadUid }, { status: 400 });
  const { roundId, programmeId, weekId } = await ctx.params;
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: REVIEW_WORDS.notHere }, { status: 404 });
  if (!isWeekId(weekId)) return NextResponse.json({ error: REVIEW_WORDS.badWeek }, { status: 400 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const asked = await askFollowUp(db, user, { roundId, programmeId, weekId, uid }, new Date());
  if (!asked.ok) return NextResponse.json({ error: asked.error }, { status: asked.status });
  return NextResponse.json({ taskId: asked.taskId, emailed: asked.emailed }, { headers: { "Cache-Control": "no-store" } });
}
