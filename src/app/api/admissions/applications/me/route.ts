import { NextResponse } from "next/server";
import { requireApplicant } from "@/lib/admissions/applicantSession";
import { loadStatusRows } from "@/lib/admissions/statusHubData";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import type { ApplicationStatusPayload } from "@/lib/admissions/statusTypes";

/**
 * `GET /api/admissions/applications/me` - every application the caller has,
 * joined to its round.
 *
 * The same rows `/applications` renders, from the same projection
 * (`buildStatusRow`), so the page and the API can never disagree about what an
 * applicant may see. The page does not fetch this route (it is a server
 * component reading the same loader directly); this exists for the client
 * surfaces that will want it, and as the thing the projection tests can point
 * at as "the wire".
 *
 * ## What is not on the wire
 *
 * Never the stored `email`, never `evidence` (a facilitator's private notes
 * about the applicant), never an unshared `outcome.reason`, never the
 * access-requirements answer. The reasons are written out once, in
 * `statusTypes.ts`, and enforced in one place, `buildStatusRow`.
 *
 * The last of those is structural, not a habit. The session gate comes from
 * `applicantSession.ts`, and the loader behind it takes the collection name
 * from `@/lib/firestore/admissionApplications`, so nothing in this route's
 * import graph is the apply tree's shared context module: that is the module
 * holding the two helpers which address the access-requirements collection on
 * a caller's behalf, and this route must be provably unable to reach them. The
 * privacy scan in `tests/privacy-policy.test.mjs` reads the import list,
 * which is the right thing for it to read, and a source pin in
 * `tests/admissions-status-hub.test.mjs` keeps this route and the loader off
 * that module.
 *
 * ## A view-as session is refused, as the page is
 *
 * These are the rows `/applications` draws, and that page draws a notice in
 * their place while an admin is viewing the site as a member: the one query
 * behind both fetches every application the account has, and an application
 * made on an application form is its owner's to read. This route is held to
 * the rule the page is held to, so it refuses first, like the form's own
 * read, and makes no query.
 *
 * A `pending` account is a legitimate caller (`requireApplicant` admits it):
 * somebody who made an account at the fair and applied the same afternoon is
 * still pending on the Monday they come back to check.
 */
export async function GET() {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const caller = await requireApplicant();
  if (caller instanceof NextResponse) return caller;
  const { user, db } = caller;

  try {
    const rows = await loadStatusRows(db, user.uid, new Date());
    return NextResponse.json({ rows } satisfies ApplicationStatusPayload);
  } catch (err) {
    console.error("[admissions status] read failed", user.uid, err);
    return NextResponse.json(
      { error: "Could not load your applications." },
      { status: 500 },
    );
  }
}
