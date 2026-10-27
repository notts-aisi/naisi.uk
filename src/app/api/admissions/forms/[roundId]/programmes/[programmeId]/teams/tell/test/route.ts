import { NextResponse } from "next/server";
import { sendTeamEmailTest } from "@/lib/applications/handover/teamsTell";
import { isId } from "@/lib/applications/normalise";
import { NO_PROGRAMME } from "@/lib/courses/teams/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send a test to me" beside "Tell everyone their team": the email of the
 * first person a press would tell, marked as a test, to the address on the
 * caller's own session and nobody else. A test that reaches them is recorded,
 * and only then may they press.
 *
 * WHO MAY is who may press (`teamsGate`). WHERE IT GOES is never in the
 * request, and a view-as session is turned away first, because the address
 * on it is the member's. It takes no body.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await sendTeamEmailTest(db, user, roundId, programmeId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, delivery: outcome.delivery, subject: outcome.subject, view: outcome.view });
}
