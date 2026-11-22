import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { programmeLedBy } from "@/lib/courses/programmeLead";
import { namingOf } from "@/lib/courses/weekPlanEdit/facts";
import { planStepOf } from "@/lib/courses/weekPlanEdit/model";
import { NOT_NAMED, PLAN_BODY, PLAN_NOT_YOURS, RUN_GONE } from "@/lib/courses/weekPlanEdit/words";
import { changeWeekPlan } from "@/lib/courses/weekPlanEdit/write";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * A RUN'S WEEK PLAN, CHANGED ONE STEP AT A TIME, from the Weeks tab of the
 * programme that names the run: `POST /api/courses/runs/[runId]/week-plan`
 * with `{ action, planKey }` and, by the action:
 *
 *  - `add-week`: a week at the end;
 *  - `add-break` with `afterWeek` and `label`: a break after that week;
 *  - `move` with `index` and `direction` ("up" or "down"): the entry at that
 *    place in the plan, one place;
 *  - `remove` with `index`: the entry at that place.
 *
 * `planKey` is the plan as the page drew it (`planKeyOf`): a step worked out
 * on an older drawing is refused, never taken on a plan it was not meant for.
 *
 * WHO. An admin, or the lead of the programme that names the run while they
 * stand as one (`programmeLedBy`), decided from the forms before anything of
 * the run is read; everybody else meets one 403. The order: view-as, the
 * session (401), the gate (403), the body's shape (400), then a run some
 * programme names (404 for an id that is none, 409 for a run no programme
 * names, which keeps its run editor's plan).
 *
 * WHAT. One transaction (`src/lib/courses/weekPlanEdit/write.ts`) that reads
 * again what it depends on, refuses as the owner's rule says with a sentence
 * the reader can act on (`judgeChange`), and leaves every week of the plan at
 * the address its number says, its document and everything under it with
 * it. Nothing is emailed.
 */

type Params = { params: Promise<{ runId: string }> };

export async function POST(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The gate, before anything of the run is read: only the forms.
  const { runId } = await ctx.params;
  if (actor.role !== "admin" && (!isAddressableId(runId) || (await programmeLedBy(db, actor, runId)) === null)) {
    return NextResponse.json({ error: PLAN_NOT_YOURS }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const shaped = planStepOf(raw);
  if (!shaped.ok) return NextResponse.json({ error: PLAN_BODY }, { status: 400 });
  if (!isAddressableId(runId)) return NextResponse.json({ error: RUN_GONE }, { status: 404 });

  const naming = await namingOf(db, runId);
  if (!naming) {
    const run = await db.collection("courseRuns").doc(runId).get();
    return run.exists && run.data()?.destroying !== true
      ? NextResponse.json({ error: NOT_NAMED }, { status: 409 })
      : NextResponse.json({ error: RUN_GONE }, { status: 404 });
  }

  try {
    const answer = await changeWeekPlan(db, runId, naming, shaped.step, shaped.planKey);
    if (!answer.ok) return NextResponse.json({ error: answer.error }, { status: answer.status });
    return NextResponse.json({ ok: true, message: answer.message });
  } catch (err) {
    console.error("[courses week plan] change failed", runId, err);
    return NextResponse.json({ error: "Couldn’t change the week plan just now. Try again." }, { status: 500 });
  }
}
