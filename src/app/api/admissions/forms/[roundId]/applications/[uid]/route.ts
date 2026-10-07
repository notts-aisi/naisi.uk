import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadReview } from "@/lib/applications/review/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * One application, for somebody who reviews a programme the applicant ranked.
 *
 * It reads what the applicant SENT and never their draft. `?programme=` names
 * the programme the caller opened it under; without it, the first programme
 * in the applicant's own ranking that the caller has a role on.
 *
 * `src/lib/applications/review/load.ts` decides who may read it, from the
 * form, and answers "Not found" for a form, an application or a programme the
 * caller has no claim on. `detail.ts` builds the answer field by field: what
 * another reviewer scored or wrote is in it only once `reviewsVisibleTo` says
 * so, and an applicant's email address only for an admin.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ roundId: string; uid: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { roundId, uid } = await ctx.params;
  const programmeId = new URL(req.url).searchParams.get("programme");
  if (
    !isAddressableId(roundId) ||
    !isAddressableId(uid) ||
    (programmeId !== null && !isAddressableId(programmeId))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const result = await loadReview(db, user, roundId, uid, programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ review: result.review });
}
