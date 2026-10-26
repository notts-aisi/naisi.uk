import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { askToFacilitate } from "@/lib/courses/facilitatorAsks/act";
import { parseAskRequest } from "@/lib/courses/facilitatorAsks/requests";
import { NO_PROGRAMME, sentWords } from "@/lib/courses/facilitatorAsks/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Ask to facilitate…": ask one person, who said on the form they would like
 * to facilitate this programme, to facilitate one group of the run it names,
 * with the day and time to answer by chosen here. Emails that person and
 * nobody else, so the body carries the number the button showed, which is 1.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read. A reviewer is refused;
 * anybody with no role on the programme is told it is not there. A view-as
 * session is turned away first.
 *
 * Every rule and every write is `askToFacilitate` in
 * `src/lib/courses/facilitatorAsks/act.ts`. The answer names the ask and what
 * the mail door did, never an address.
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
  const parsed = parseAskRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await askToFacilitate(db, user, roundId, programmeId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({
    ok: true,
    askId: outcome.askId,
    delivery: outcome.delivery,
    said: sentWords(outcome.delivery, outcome.firstName, "asked"),
  });
}
