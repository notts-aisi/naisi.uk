import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { remindAsk } from "@/lib/courses/facilitatorAsks/act";
import { parseRemindRequest } from "@/lib/courses/facilitatorAsks/requests";
import { NO_PROGRAMME, sentWords } from "@/lib/courses/facilitatorAsks/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * "Remind Grace": the ask again, under a line that says it is a reminder,
 * to the one person asked and nobody else, while their ask is waiting. The
 * body carries the number the button showed, which is 1.
 *
 * WHO MAY is the programme's lead or an admin, as for the ask. Every rule
 * (waiting, at most three, twelve hours apart) is `remindAsk` in
 * `src/lib/courses/facilitatorAsks/act.ts`.
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
  const parsed = parseRemindRequest(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await remindAsk(db, user, roundId, programmeId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({
    ok: true,
    delivery: outcome.delivery,
    said: sentWords(outcome.delivery, outcome.firstName, "reminded"),
  });
}
