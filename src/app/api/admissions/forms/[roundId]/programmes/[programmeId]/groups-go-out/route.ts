import { NextResponse } from "next/server";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { isValidDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * WHEN GROUPS GO OUT, from the programme's Groups tab: `{ on: "YYYY-MM-DD" }`,
 * the day the people holding a place are planned to get the email with their
 * group, day and room, or `{ on: null }` to clear it. There is no default.
 *
 * Stored on the run the programme names (`CourseRunDoc.groupsGoOutOn`), and
 * read by every sentence that names the day (`src/lib/courses/groupsGoOut.ts`).
 * It is the plan: nothing is sent on it, and Publish is pressed by hand.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`, the
 * gate of the Groups tab and the run's other settings). A reviewer of the programme
 * is refused; anybody with no role on it is told the programme is not
 * there. A view-as session is turned away first.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

const NO_PROGRAMME = "That programme is not on this form.";
const LEADS_AND_ADMINS = "Only the programme’s lead and admins can say when groups go out.";
const NO_RUN = "This programme doesn’t name a course run yet. Name its run first, then say when groups go out.";
const RUN_GONE = "The course run this programme names is no longer on the site.";

export type GroupsGoOutAnswer = { ok: true; on: string | null };

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: { on?: unknown } | null;
  try {
    raw = (await req.json()) as typeof raw;
  } catch {
    raw = null;
  }
  const on = raw?.on;
  if (!(on === null || (typeof on === "string" && isValidDateKey(on)))) {
    return NextResponse.json(
      { error: "Say the day groups go out as a date, like 2026-10-28, or clear it." },
      { status: 400 },
    );
  }
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: LEADS_AND_ADMINS }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? RUN_GONE : NO_RUN }, { status: 409 });
  }

  await db.collection("courseRuns").doc(view.run.id).update({ groupsGoOutOn: on });
  const answer: GroupsGoOutAnswer = { ok: true, on };
  return NextResponse.json(answer);
}
