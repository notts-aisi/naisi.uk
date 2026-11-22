import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { loadRunPanel } from "@/lib/applications/handover/load";
import { NOT_AN_ADMIN, makeProgrammeRun } from "@/lib/applications/handover/run";
import { NEED_START, checkRunDetails, readDetailsInput } from "@/lib/courses/runStands/details";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * Make a new run of the course a programme is tied to, and name it on the
 * programme, from the Course run section of its Settings ("Make a new run of
 * AGI Strategy").
 *
 * ADMIN ONLY, decided before the body is read, as the section is: every
 * other session is forbidden whether or not the form exists.
 *
 * In order: a view-as session is refused; the session (401); an admin (403);
 * the body (400: the run's details form's checks, `checkRunDetails`, with a
 * start date required, as the older New run requires one); then, in one
 * transaction (`makeProgrammeRun`): the form and the programme (404), a
 * course behind the programme (409), no run named already and nobody handed
 * over (409), the course on the site (409), and no other run of the course
 * with the same label (409). It creates the run as a draft with the fields
 * the older New run writes, names it on the programme, and answers with the
 * section read again. It emails nobody.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: NOT_AN_ADMIN }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = readDetailsInput(raw);
  if (!input) return NextResponse.json({ error: "Send the new run’s details from the form." }, { status: 400 });
  if (input.startDate === undefined) return NextResponse.json({ error: NEED_START }, { status: 400 });
  const checked = checkRunDetails(input);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const startDate = checked.patch.startDate;
  if (startDate === undefined) return NextResponse.json({ error: NEED_START }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let made: Awaited<ReturnType<typeof makeProgrammeRun>>;
  try {
    made = await makeProgrammeRun(db, user, roundId, programmeId, {
      label: checked.patch.label,
      academicYear: checked.patch.academicYear,
      cohort: checked.patch.cohort,
      startDate,
    });
  } catch (err) {
    console.error("[programme run] could not make a run", roundId, programmeId, err);
    return NextResponse.json({ error: "Could not make the run. Try again." }, { status: 500 });
  }
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });

  const outcome = await loadRunPanel(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: "That programme is not on this form." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, runId: made.value.runId, label: made.value.label, panel: outcome.panel });
}
