import { NextResponse } from "next/server";
import { decideFinished } from "@/lib/applications/handover/finishingAct";
import { isId } from "@/lib/applications/normalise";
import { parseFinishDecision } from "@/lib/courses/finishing/model";
import { NO_PROGRAMME } from "@/lib/courses/finishing/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * One person's Finished switch, on the programme's Overview once its run's
 * last session is over (board en-finish): `{ uid, finished }`. Saved at once.
 * Where the switch now says what the suggestion says, the lead's earlier
 * change is removed; otherwise the change is stored with who made it and
 * when. Emails nobody.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read. A reviewer of the
 * programme is refused; anybody with no role on it is told the programme is
 * not there. A view-as session is turned away first.
 *
 * Every write and every refusal is in
 * `src/lib/applications/handover/finishingAct.ts`. The answer is the section
 * as it now stands for the caller: names, groups and counts, never a stored
 * document.
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
  const parsed = parseFinishDecision(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await decideFinished(db, user, roundId, programmeId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, model: outcome.model });
}
