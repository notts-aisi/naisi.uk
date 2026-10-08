import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunTerm } from "@/lib/applications/access";
import { listFormsForStaff } from "@/lib/applications/editor/load";
import { parseNewForm } from "@/lib/applications/editor/parse";
import { projectFormForStaff } from "@/lib/applications/editor/views";
import { createForm } from "@/lib/applications/editor/write";

/**
 * The application forms: list the ones this caller works on, and make a new
 * one.
 *
 * An application form is an admission round carrying `formVersion: 2`, and
 * the round is `allow read, write: if false`, so this list is the only way a
 * staff screen learns a form exists.
 *
 * The GET answers any signed-in caller and filters per form: an admin sees
 * every form, a lead or a reviewer sees the forms that name them, and
 * everybody else gets an empty list rather than a refusal, because "there are
 * forms you cannot see" would itself say something about an intake.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const forms = await listFormsForStaff(db, user);
  return NextResponse.json({
    forms: forms.map((loaded) => projectFormForStaff(loaded.form, loaded.context)),
    canCreate: canRunTerm(user),
  });
}

/**
 * Make an application form. Admin only.
 *
 * It starts as a draft with nothing on it but the facilitating question. This
 * route never opens one: a form's status is not written here at all.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) {
    return NextResponse.json(
      { error: "Only an admin can make an application form." },
      { status: 403 },
    );
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseNewForm(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const created = await createForm(db, user, parsed.value);
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }
  return NextResponse.json({ id: created.value.id }, { status: 201 });
}
