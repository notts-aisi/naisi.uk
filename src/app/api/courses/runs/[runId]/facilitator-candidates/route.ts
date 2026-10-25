import { NextResponse } from "next/server";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { isEligibleAdmissionsReviewer } from "@/lib/firestore/users";

/**
 * WHO CAN BE PUT ON ONE OF THIS RUN'S GROUPS AS A FACILITATOR, by name: the
 * list the Groups tab's Facilitators view picks from. Read only.
 *
 * The people are the ones the facilitators route will accept: every approved
 * account (member, committee or admin), the same `role in` query it
 * intersects a request with. NAMES AND IDS ONLY: never an address, so the
 * lead of a programme, who never sees one, can pick a facilitator.
 *
 * WHO MAY READ: somebody who may staff the run's groups (an admin, one of
 * the run's track leads, or the lead of the programme that names it:
 * `doesTrackLeadWork`) AND who may read the member roster at all, which is
 * the tier `firestore.rules` opens `users` to: an admin or SU-recognised
 * committee. A programme's lead always is one. A run's track lead who is a
 * plain member is refused, as the roster is closed to them in the run editor.
 *
 * Decided before the roster is read. A run that is not there is a 404 only
 * for somebody who could read a roster anyway.
 */

type Ctx = { params: Promise<{ runId: string }> };

/** The accounts the facilitators route accepts. */
const ELIGIBLE_ROLES = ["member", "committee", "admin"];

export type FacilitatorCandidate = { uid: string; name: string };

export async function GET(_req: Request, ctx: Ctx) {
  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // The roster's own tier, from the session alone (firestore.rules: the
  // admin and SU-recognised committee read of `users`).
  if (!isEligibleAdmissionsReviewer(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  if (!doesTrackLeadWork(await runStaffingOf(db, actor, run))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // One `in` on one field, so no declared index. Sorted here, by name.
  const snap = await db.collection("users").where("role", "in", ELIGIBLE_ROLES).get();
  const people: FacilitatorCandidate[] = snap.docs
    .map((doc) => ({ uid: doc.id, name: displayNameOf(doc.data() ?? {}) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || a.uid.localeCompare(b.uid));

  return NextResponse.json({ people });
}
