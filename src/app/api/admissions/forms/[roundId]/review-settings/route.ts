import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import { setRevealOtherReviews } from "@/lib/applications/review/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The admin's switch: show other reviewers' scores on a first review.
 *
 * A first review is blind to other reviewers until every answer there is to
 * score has one. This switch lifts that for EVERYBODY reviewing on the form,
 * which is why it is an admin's (`canRunTerm`) and not a programme lead's.
 * Admin only, decided before the request is read.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json(
      { error: "Only an admin can change whether other reviewers’ scores are shown." },
      { status: 403 },
    );
  }

  const { roundId } = await ctx.params;
  if (!isAddressableId(roundId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { revealOtherReviews?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const saved = await setRevealOtherReviews(db, user, roundId, body?.revealOtherReviews);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ revealOtherReviews: saved.revealOtherReviews });
}
