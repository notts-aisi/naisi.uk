import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { loadSetup } from "@/lib/applications/editor/load";
import { parseProgrammeChange } from "@/lib/applications/editor/parse";
import { projectProgrammeForSetup } from "@/lib/applications/editor/views";
import { changeProgramme } from "@/lib/applications/editor/write";
import { isId } from "@/lib/applications/normalise";

const NO_PROGRAMME = "That programme is not on this form.";
const NOT_YOURS = "Only this programme’s lead or an admin can see its settings.";

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

/**
 * One programme's settings, for its lead or an admin.
 *
 * 404 for a form or a programme the caller has no role on, the same as for
 * one that does not exist. A reviewer has a role here, so they are told the
 * truth: the settings are the lead's.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadSetup(db, user, roundId, programmeId);
  if (outcome.status === "none") {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  if (outcome.status === "not-yours") {
    return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
  }
  const { form, sets, programme, context } = outcome.setup;
  return NextResponse.json({
    programme: projectProgrammeForSetup(form, sets, programme, context),
  });
}

/**
 * Change one programme's settings: what applicants are shown (its name, its
 * one-line description, when it starts, its places), whether its reviewers
 * score, and the wording of its emails. Its lead or an admin.
 *
 * Closing a programme, or opening it again, is an admin's alone, and the
 * writer refuses it from a lead. Who leads and who reviews is not saved here
 * at all: that is the roles route beside this one.
 *
 * The body is read before any document is, so a malformed one gets the same
 * answer whether or not the programme exists.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId, programmeId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseProgrammeChange(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }

  const saved = await changeProgramme(db, user, roundId, programmeId, parsed.value);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  const outcome = await loadSetup(db, user, roundId, programmeId);
  if (outcome.status !== "ok") {
    return NextResponse.json({ error: NO_PROGRAMME }, { status: 404 });
  }
  const { form, sets, programme, context } = outcome.setup;
  return NextResponse.json({
    programme: projectProgrammeForSetup(form, sets, programme, context),
  });
}
