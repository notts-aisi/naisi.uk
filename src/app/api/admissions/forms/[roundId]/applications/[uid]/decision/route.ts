import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { canRunTerm } from "@/lib/applications/access";
import {
  decideApplication,
  parseDecision,
  parseRevocation,
  revokeAcceptance,
} from "@/lib/applications/review/decide";
import { loadReview } from "@/lib/applications/review/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A decision for one programme on one application.
 *
 * PUT records Accept, Pool or Decline. Only that programme's lead or an admin
 * may, and only until decision day has been sent. DELETE revokes an
 * acceptance: an admin's act, with a reason, written to the audit log.
 *
 * Both write to the decision document beside the application and to the log,
 * in one transaction, and to nothing else. The applicant's own document is not
 * touched and nobody is emailed: that is what keeps a decision from being
 * heard before decision day. The rules are in
 * `src/lib/applications/review/decide.ts`.
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
  const parsed = parseDecision(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const decided = await decideApplication(db, user, roundId, uid, parsed.change);
  if (!decided.ok) return NextResponse.json({ error: decided.error }, { status: decided.status });

  const result = await loadReview(db, user, roundId, uid, parsed.change.programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ changed: decided.changed, review: result.review });
}

/**
 * Revoke an acceptance. Admin only, decided before the request is read. It
 * needs a reason, which is logged with the admin's name and the time, and the
 * application goes back to being reviewed.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ roundId: string; uid: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json({ error: "Only an admin can revoke an acceptance." }, { status: 403 });
  }

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
  const parsed = parseRevocation(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const revoked = await revokeAcceptance(db, user, roundId, uid, parsed);
  if (!revoked.ok) return NextResponse.json({ error: revoked.error }, { status: revoked.status });

  const result = await loadReview(db, user, roundId, uid, parsed.programmeId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ review: result.review });
}
