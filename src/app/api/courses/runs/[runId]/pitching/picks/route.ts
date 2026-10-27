import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parsePickInput, type PitchingView } from "@/lib/courses/pitching/model";
import { setPick } from "@/lib/courses/pitching/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * POST: "I’d join this" on one of the caller's group's pitches, pressed
 * (`join: true`) or unpressed (`join: false`).
 *
 * Order: a view-as session is refused before anything else, because a pick is
 * the member's own choice; then the session; then the body, checked before
 * anything is read; then `setPick`, which asks for the caller's own told seat
 * in one of the run's groups first, refuses once the group's session in
 * pitching week has started, and counts the caller's picks in the same
 * transaction that adds one, so the run's pick limit holds under two presses
 * at once.
 *
 * Answers with the caller's page as it now stands: which pitches they picked
 * and how many, and nothing about anybody else's picks.
 */
export async function POST(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) {
    return NextResponse.json({ error: "There’s no pitching week here." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Say which pitch, and whether you’d join it." }, { status: 400 });
  }
  const parsed = parsePickInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await setPick(db, user, runId, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const body: { view: PitchingView } = { view: outcome.view };
  return NextResponse.json(body);
}
