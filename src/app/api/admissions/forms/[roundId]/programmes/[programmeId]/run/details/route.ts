import { NextResponse } from "next/server";
import { canRunTerm } from "@/lib/applications/access";
import { loadRunPanel } from "@/lib/applications/handover/load";
import { checkRunDetails, readDetailsInput } from "@/lib/courses/runStands/details";
import { ONLY_AN_ADMIN_CHANGES_DETAILS, saveRunDetails } from "@/lib/courses/runStands/saveDetails";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * The details of the course run a programme names, from the Course run
 * section of its Settings: label, academic year, cohort and the day week 1
 * starts.
 *
 * ADMIN ONLY, decided before the body is read, as the section is: every
 * other session is forbidden whether or not the form exists.
 *
 * In order: a view-as session is refused; the session (401); an admin (403);
 * the body (400: the older run editor's checks, `checkRunDetails`); the form
 * and the programme (404); a run named (409); then, in one transaction, the
 * run on the site (404), not being destroyed (409), and no new start date
 * once the groups have gone out (409). It emails nobody.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ONLY_AN_ADMIN_CHANGES_DETAILS }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = readDetailsInput(raw);
  if (!input) return NextResponse.json({ error: "Send the run’s details from the form." }, { status: 400 });
  const checked = checkRunDetails(input);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  let saved: Awaited<ReturnType<typeof saveRunDetails>>;
  try {
    saved = await saveRunDetails(db, user, roundId, programmeId, checked.patch);
  } catch (err) {
    console.error("[run details] could not save", roundId, programmeId, err);
    return NextResponse.json({ error: "Could not save the run’s details. Try again." }, { status: 500 });
  }
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  const outcome = await loadRunPanel(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: "That programme is not on this form." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, panel: outcome.panel });
}
