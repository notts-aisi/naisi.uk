import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunTerm } from "@/lib/applications/access";
import { loadFormForStaff } from "@/lib/applications/editor/load";
import { parseFormChange } from "@/lib/applications/editor/parse";
import { projectFormForStaff } from "@/lib/applications/editor/views";
import { changeForm } from "@/lib/applications/editor/write";
import { isId } from "@/lib/applications/normalise";

const NO_FORM = "There is no application form here.";

/**
 * One application form, as the people who work on it see it: its dates, where
 * it is in the term, and its programmes with the caller's own role on each.
 *
 * 404 for a form the caller has no role on, the same as for one that does not
 * exist. Whether a form exists is not something a stranger is told.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const loaded = await loadFormForStaff(db, user, roundId);
  if (!loaded) return NextResponse.json({ error: NO_FORM }, { status: 404 });
  return NextResponse.json({ form: projectFormForStaff(loaded.form, loaded.context) });
}

/**
 * Change the form itself. Admin only.
 *
 * What it takes: the form's name, when it opens and closes (a London date and
 * time each), the day everyone hears, the day invitations are accepted by,
 * whether it asks about facilitating, the order of its programmes, and a new
 * programme to add.
 *
 * What it does not take, each refused with where it is done instead: the
 * form's status (this route never opens a form), a programme's own settings,
 * who leads and reviews, and the question sets.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json(
      { error: "Only an admin can change the application form." },
      { status: 403 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseFormChange(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId)) return NextResponse.json({ error: NO_FORM }, { status: 404 });

  const saved = await changeForm(db, user, roundId, parsed.value);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  const loaded = await loadFormForStaff(db, user, roundId);
  if (!loaded) return NextResponse.json({ error: NO_FORM }, { status: 404 });
  return NextResponse.json({
    form: projectFormForStaff(loaded.form, loaded.context),
    addedProgrammeId: saved.value.addedProgrammeId,
  });
}
