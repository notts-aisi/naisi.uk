import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { loadFormForStaff, loadSetup } from "@/lib/applications/editor/load";
import { own } from "@/lib/applications/editor/own";
import { parseRolesChange } from "@/lib/applications/editor/parse";
import { projectProgrammeForSetup } from "@/lib/applications/editor/views";
import { roleOnProgramme } from "@/lib/applications/access";
import { setProgrammeRoles } from "@/lib/applications/roles";
import { isId } from "@/lib/applications/normalise";

const NO_PROGRAMME = "That programme is not on this form.";

/**
 * Name a programme's lead and its reviewers.
 *
 * This is an access grant: being named is what lets a person read
 * applications. Every rule about who may name whom lives in
 * `setProgrammeRoles`, the one writer, and is not repeated here: only an
 * admin changes the lead, a lead adds and removes their own reviewers, and
 * everybody named is checked against their live account.
 *
 * What this route adds is the answer for a stranger. The writer tells
 * somebody with no role on the programme that only its lead may do this,
 * which also tells them the programme exists, so a caller with no role is
 * answered here first with the same 404 a missing programme gets.
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ roundId: string; programmeId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseRolesChange(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  // The programme has to be one the form itself holds before the writer is
  // handed its id: the writer addresses `programmes.<id>` as a field path.
  const loaded = await loadFormForStaff(db, user, roundId);
  if (
    !loaded ||
    !own(loaded.form.programmes, programmeId) ||
    roleOnProgramme(user, loaded.form, programmeId) === null
  ) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const result = await setProgrammeRoles(db, user, roundId, programmeId, parsed.value);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const outcome = await loadSetup(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  const { form, sets, programme, context } = outcome.setup;
  return NextResponse.json({
    programme: projectProgrammeForSetup(form, sets, programme, context),
  });
}
