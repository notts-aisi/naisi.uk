import { NextResponse } from "next/server";
import { setFinishRule } from "@/lib/applications/handover/finishingAct";
import { isId } from "@/lib/applications/normalise";
import { parseFinishRule } from "@/lib/courses/finishing/model";
import { NO_PROGRAMME } from "@/lib/courses/finishing/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The rule for who finished, from the programme's Settings tab:
 * `{ atLeast }`, the least number of sessions a person must have come to of
 * the sessions their group held, or `null` to clear it. There is no default.
 * Only the programme's lead and admins are ever shown the number.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read. A reviewer of the
 * programme is refused; anybody with no role on it is told the programme is
 * not there. A view-as session is turned away first.
 *
 * Every write and every refusal is in
 * `src/lib/applications/handover/finishingAct.ts`. The answer is the rule as
 * stored and how many sessions the run's groups meet.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
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
  const parsed = parseFinishRule(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await setFinishRule(db, user, roundId, programmeId, parsed.value.atLeast, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({
    ok: true,
    rule: { atLeast: outcome.rule.atLeast, sessions: outcome.rule.sessions },
  });
}
