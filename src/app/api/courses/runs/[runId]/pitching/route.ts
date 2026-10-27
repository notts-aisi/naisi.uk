import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadPitching } from "@/lib/courses/pitching/load";
import type { PitchingView } from "@/lib/courses/pitching/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * GET: one person's pitching week, as their page draws it: their own pitch,
 * their group's pitches with who pitched each, which of them they picked, and
 * the sentences around them. Reads only.
 *
 * WHO: somebody with a live learner seat in one of this run's groups, told by
 * Publish, whose account stands. Everybody else, the run's staff included, is
 * refused the same way whether or not the run exists; the lead and admins
 * read the pitches on the programme's page instead.
 *
 * NEVER SENT: anybody else's picks, or how many people picked a pitch. The
 * response is built field by field in `pitchingView`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!isAddressableId(runId)) {
    return NextResponse.json({ error: "There’s no pitching week here." }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadPitching(db, user, runId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const body: { view: PitchingView } = { view: outcome.view };
  return NextResponse.json(body);
}
