import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { readTabRun, weekOwnersOf } from "@/lib/courses/weeksTab/load";
import { weekNumberOfId } from "@/lib/courses/weeksTab/paths";
import { OWNER_NOT_ONE, OWNER_NOT_YOURS } from "@/lib/courses/weeksTab/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isWeekOwnerUid } from "@/lib/firestore/courses";

/**
 * A WEEK'S OWNER, ON ITS PROGRAMME'S WEEKS TAB (board pr-weeks: "Owner ...
 * The lead or a helper."): `PUT /api/courses/runs/[runId]/weeks/[weekId]/owner`
 * with `{ ownerUid }`, a uid, or null for the programme's lead.
 *
 * Stored on the RUN's week as `ownerUid`, and this route is its only writer.
 * The lead is stored as null, which is what every week starts as, so a week
 * follows the programme's lead when the lead changes. A helper is one of the
 * run's track leads with an approved account (`weekOwnersOf`); anybody else
 * is refused, so no page ever shows an owner nobody chose from the list.
 *
 * WHO. The lead of the programme that names the run, while they stand as one
 * (`programmeLedBy`), and admins: those who mark a week ready. Every other
 * caller gets the same 403, decided from the forms before anything of the run
 * is read. The order: view-as, session (401), the body (400), the gate (403),
 * the address (404), then the run and the week.
 *
 * Nobody is emailed. Only the owner field is written: the week's content and
 * its last-edited stamp are left alone.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

export async function PUT(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { ownerUid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say who owns the week: { \"ownerUid\": an account, or null for the lead }." }, { status: 400 });
  }
  const asked = body?.ownerUid;
  if (asked !== null && !isWeekOwnerUid(asked)) {
    return NextResponse.json({ error: "Say who owns the week: { \"ownerUid\": an account, or null for the lead }." }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The gate, before anything of the run is read: only the forms.
  const { runId, weekId } = await ctx.params;
  if (actor.role !== "admin" && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return NextResponse.json({ error: OWNER_NOT_YOURS }, { status: 403 });
  }
  const weekNumber = weekNumberOfId(weekId);
  if (!isAddressableId(runId) || weekNumber === null) {
    return NextResponse.json({ error: "That isn’t a week of a run: weeks are w01 to w60." }, { status: 404 });
  }

  const run = await readTabRun(db, runId);
  if (!run) return NextResponse.json({ error: "That run isn’t on the site." }, { status: 404 });
  const weekRef = db.collection("courseRuns").doc(run.id).collection("weeks").doc(weekId);
  const weekSnap = await weekRef.get();
  if (!weekSnap.exists) return NextResponse.json({ error: `Week ${weekNumber} has no page on this run yet.` }, { status: 404 });

  const owners = await weekOwnersOf(db, run);
  const chosen = asked === null ? null : (owners.find((owner) => owner.uid === asked) ?? undefined);
  if (chosen === undefined) return NextResponse.json({ error: OWNER_NOT_ONE }, { status: 400 });
  // The lead is stored as null: the week follows the programme's lead.
  const stored = chosen === null || chosen.lead ? null : chosen.uid;
  try {
    await weekRef.update({ ownerUid: stored });
  } catch (err) {
    console.error("[courses week owner] write failed", runId, weekId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, week: { weekId, weekNumber, ownerUid: stored } });
}
