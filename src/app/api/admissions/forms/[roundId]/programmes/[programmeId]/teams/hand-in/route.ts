import { NextResponse } from "next/server";
import { teamsGate, teamsRun } from "@/lib/applications/handover/teamsLoad";
import { isId } from "@/lib/applications/normalise";
import { handInSettingsProblem } from "@/lib/courses/teamPage/lead";
import { parseHandInSettings } from "@/lib/courses/teamPage/model";
import { LEADS_AND_ADMINS_SET_DATES } from "@/lib/courses/teamPage/words";
import { NOT_AN_INCUBATOR, NO_PROGRAMME, NO_RUN, RUN_GONE } from "@/lib/courses/teams/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * AN INCUBATOR'S HAND-IN DATES, from the programme's Teams tab:
 * `{ dueOn: "YYYY-MM-DD" | null, showcaseWeek: number | null }`, the day
 * each team's one hand-in is due and the taught week whose session is the
 * showcase, each set or cleared. There is no default.
 *
 * Stored on the run the programme names (`CourseRunDoc.teamHandIn`) and read
 * by each team's page and its hand-in. Nothing is sent on either date.
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`teamsGate`, the Teams
 * tab's own question). A reviewer is refused; anybody with no role on the
 * programme is told it is not there; a fellowship has no teams. A view-as
 * session is turned away first.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export type HandInDatesAnswer = { ok: true; dueOn: string | null; showcaseWeek: number | null };

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseHandInSettings(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const gate = await teamsGate(db, user, roundId, programmeId);
  if (!gate.ok) {
    if (gate.outcome === "not-yours") return NextResponse.json({ error: LEADS_AND_ADMINS_SET_DATES }, { status: 403 });
    if (gate.outcome === "not-an-incubator") return NextResponse.json({ error: NOT_AN_INCUBATOR }, { status: 409 });
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  const found = await teamsRun(db, gate.programme);
  if (!found.ok) {
    return NextResponse.json({ error: found.blank === "run-gone" ? RUN_GONE : NO_RUN }, { status: 409 });
  }
  const problem = handInSettingsProblem(found.run, parsed.value);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const { dueOn, showcaseWeek } = parsed.value;
  await db.collection("courseRuns").doc(found.run.id).update({ teamHandIn: { dueOn, showcaseWeek } });
  const answer: HandInDatesAnswer = { ok: true, dueOn, showcaseWeek };
  return NextResponse.json(answer);
}
