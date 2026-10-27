import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { sendAskTest } from "@/lib/courses/facilitatorAsks/act";
import { parseTestRequest } from "@/lib/courses/facilitatorAsks/requests";
import { NO_PROGRAMME } from "@/lib/courses/facilitatorAsks/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Send a test to me" before asking: the real email one person would be
 * sent, for one group and one day and time to answer by, marked as a test
 * and sent to the address on the caller's own session and nobody else. A
 * test that reached the caller is recorded on the run, and asking for an
 * answer by that day and time is then unlocked.
 *
 * WHO MAY is the programme's lead or an admin, as for the ask itself. Every
 * rule is `sendAskTest` in `src/lib/courses/facilitatorAsks/act.ts`.
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
  const parsed = parseTestRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await sendAskTest(db, user, roundId, programmeId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, delivery: outcome.delivery });
}
