import { NextResponse } from "next/server";
import { isId } from "@/lib/applications/normalise";
import { setTraining } from "@/lib/courses/facilitatorAsks/act";
import { parseTraining } from "@/lib/courses/facilitatorAsks/model";
import { NO_PROGRAMME } from "@/lib/courses/facilitatorAsks/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The facilitators' training, from the programme's Settings tab: a setting
 * of the run the programme names. `{ training: { dateKey, time, room } }`,
 * all three, or `{ training: null }` to clear it. There is no default: with
 * none set, the ask's email and its page leave the training out.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read. A reviewer is refused;
 * anybody with no role on the programme is told it is not there. A view-as
 * session is turned away first. Nobody is emailed.
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
  const parsed = parseTraining(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await setTraining(db, user, roundId, programmeId, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, training: outcome.training });
}
