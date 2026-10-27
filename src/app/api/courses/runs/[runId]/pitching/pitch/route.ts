import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { parsePitchInput, type PitchingView } from "@/lib/courses/pitching/model";
import { savePitch } from "@/lib/courses/pitching/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * POST: save the caller's pitch in pitching week (its title, its paper, its
 * twist and who pitches it), making it the first time. The one writer of a
 * pitch's words; `coursePitches` is shut to every browser.
 *
 * Order: a view-as session is refused before anything else, because a pitch
 * is the member's own word; then the session; then the body, checked before
 * anything is read; then `savePitch`, which asks for the caller's own told
 * seat in one of the run's groups before it reads anything else, refuses once
 * the group's session in pitching week has started, and writes in a
 * transaction (one pitch per person, a partner from the caller's own group).
 *
 * Answers with the caller's page as it now stands.
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
    return NextResponse.json({ error: "Send your pitch’s title, paper and twist." }, { status: 400 });
  }
  const parsed = parsePitchInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const outcome = await savePitch(db, user, runId, parsed.value);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const body: { view: PitchingView } = { view: outcome.view };
  return NextResponse.json(body);
}
