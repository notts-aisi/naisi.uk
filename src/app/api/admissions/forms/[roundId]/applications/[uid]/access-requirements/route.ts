import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { openAccessRequirements } from "@/lib/applications/review/accessRequirements";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * An admin opens one applicant's access-requirements answer.
 *
 * A POST and not a GET, because opening it writes: every read appends a
 * `courseAudit` row of kind `access-requirements-read`, in the transaction
 * that reads the answer, saying who opened it and whose it was. That is what
 * the privacy policy tells applicants happens, and it is why this is a button
 * an admin presses and not part of the review screen's own payload.
 *
 * `src/lib/applications/review/accessRequirements.ts` decides who may: an
 * admin, and nobody else. A programme's lead and its reviewers are refused
 * before anything is read. A form or an application that is not there, a
 * draft nobody sent and the caller's own application all answer "Not found".
 *
 * Refused during a view-as session like every other write, and it could not
 * succeed in one anyway: the session is then the member's, who is no admin.
 */
export async function POST(
  _req: Request,
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
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The read and its record are one call: the second argument is the kind
  // the read is logged under.
  const opened = await openAccessRequirements(db, user, roundId, uid, "access-requirements-read");
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status });
  return NextResponse.json(
    { accessRequirements: opened.accessRequirements },
    { headers: { "Cache-Control": "no-store" } },
  );
}
