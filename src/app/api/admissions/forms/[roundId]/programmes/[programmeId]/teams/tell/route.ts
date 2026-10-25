import { NextResponse } from "next/server";
import { tellEveryone } from "@/lib/applications/handover/teamsTell";
import { isId } from "@/lib/applications/normalise";
import { parseTellRequest } from "@/lib/courses/teams/model";
import { NO_PROGRAMME } from "@/lib/courses/teams/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Tell everyone their team": email each person in an incubator's teams their
 * team, its project and their teammates' names, once for each team that is
 * new to them or has changed.
 *
 * WHO MAY is the programme's lead or an admin (`teamsGate`, from the form,
 * once a valid body has arrived). A view-as session is turned away first,
 * because the emails would go in the member's name.
 *
 * THE BODY SAYS HOW MANY PEOPLE THE BUTTON NAMED (`emails`), and the press is
 * refused, with the number as it is now, when the people owed an email are
 * not that many. Nothing goes until the presser has sent themselves a test.
 * Everything the press does is in
 * `src/lib/applications/handover/teamsTell.ts`.
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
  const parsed = parseTellRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await tellEveryone(db, user, roundId, programmeId, parsed.value);
  if (!outcome.ok) {
    const body: { error: string; emails?: number } = { error: outcome.error };
    if (typeof outcome.emails === "number") body.emails = outcome.emails;
    return NextResponse.json(body, { status: outcome.status });
  }
  return NextResponse.json({ ok: true, report: outcome.report, said: outcome.said, view: outcome.view });
}
