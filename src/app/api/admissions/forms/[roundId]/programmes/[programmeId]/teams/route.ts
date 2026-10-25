import { NextResponse } from "next/server";
import { actOnTeams } from "@/lib/applications/handover/teamsAct";
import { isId } from "@/lib/applications/normalise";
import { parseTeamsAction } from "@/lib/courses/teams/model";
import { NO_PROGRAMME } from "@/lib/courses/teams/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * An incubator's teams, made and changed from its Teams tab: make a pitch a
 * team, make the teams from first choices on the agenda, move somebody to
 * another team or to no team, or remove a team. Emails nobody.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`teamsGate`). A
 * reviewer of the programme is refused; anybody with no role on it is told
 * the programme is not there. A view-as session is turned away first.
 *
 * Every write, and every refusal, is in
 * `src/lib/applications/handover/teamsAct.ts`. The answer is the tab as it
 * stands after the write, names only.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseTeamsAction(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await actOnTeams(db, user, roundId, programmeId, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, said: outcome.said, view: outcome.view });
}
