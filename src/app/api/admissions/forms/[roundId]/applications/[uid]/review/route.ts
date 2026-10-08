import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadReview } from "@/lib/applications/review/load";
import { parseReviewChange, saveReview } from "@/lib/applications/review/saveReview";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Save the caller's own scores, comments and overall comment on one
 * application.
 *
 * The row written is the caller's and nobody else's: its id is built from the
 * session, never from the request. A score is accepted only on an answer of a
 * programme the caller reviews, nobody reviews their own application, and the
 * row's total is worked out here from the scores it holds. All of that is in
 * `src/lib/applications/review/saveReview.ts`.
 *
 * The answer is the application as the caller may now see it, so a first
 * review that has just been finished shows what it unlocked.
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ roundId: string; uid: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { roundId, uid } = await ctx.params;
  if (!isAddressableId(roundId) || !isAddressableId(uid)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseReviewChange(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const programme = (body as { programmeId?: unknown }).programmeId;
  const programmeId = typeof programme === "string" && isAddressableId(programme) ? programme : null;

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const saved = await saveReview(db, user, roundId, uid, parsed.change);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  const result = await loadReview(db, user, roundId, uid, programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ review: result.review });
}
