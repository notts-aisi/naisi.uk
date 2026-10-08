import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunTerm } from "@/lib/applications/access";
import { loadEditor } from "@/lib/applications/editor/load";
import { parseSetChange } from "@/lib/applications/editor/parse";
import {
  projectFormForStaff,
  projectSetForEditor,
  setsInFormOrder,
} from "@/lib/applications/editor/views";
import { changeSet, deleteSet } from "@/lib/applications/editor/write";
import { isId } from "@/lib/applications/normalise";

const NO_SET = "That question set is not on this form.";
const ADMIN_ONLY = "Only an admin can change the application form.";

type Ctx = { params: Promise<{ roundId: string; setId: string }> };

/**
 * Change one question set: its name (`label`), the line shown to applicants
 * under its heading (`applicantLine`), its note for admins (`intro`), or its
 * whole list of questions (`questions`). Sending the list is also how
 * questions are reordered and deleted. Admin only.
 *
 * A set's two lines are two fields: the note for admins is never sent to an
 * applicant, and the line shown to applicants is.
 *
 * Two rules are the writer's and are stated here because this is the door:
 *
 *  - QUESTIONS LOCK ONCE ANYBODY HAS SENT AN APPLICATION. The answer is a 409
 *    carrying the sentence the editor shows. The name and both lines lock
 *    with them.
 *  - ONLY A STREAM SET'S QUESTIONS CAN BE SCORED. A body that scores a
 *    question in any other set is refused, never quietly unscored.
 *
 * The response is the set as it was stored, so the editor learns the id each
 * new question was given.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId, setId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseSetChange(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(setId)) {
    return NextResponse.json({ error: NO_SET }, { status: 404 });
  }

  const saved = await changeSet(db, user, roundId, setId, parsed.value);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });

  const editor = await loadEditor(db, user, roundId);
  const stored = editor?.sets.find((set) => set.id === setId);
  if (!editor || !stored) return NextResponse.json({ error: NO_SET }, { status: 404 });
  return NextResponse.json({ set: projectSetForEditor(stored, editor.form, editor.sets) });
}

/**
 * Take a question set off the form, with its questions. Admin only, and
 * refused once anybody has sent an application.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId, setId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  if (!isId(roundId) || !isId(setId)) {
    return NextResponse.json({ error: NO_SET }, { status: 404 });
  }

  const removed = await deleteSet(db, user, roundId, setId);
  if (!removed.ok) {
    return NextResponse.json({ error: removed.error }, { status: removed.status });
  }

  const editor = await loadEditor(db, user, roundId);
  if (!editor) return NextResponse.json({ error: NO_SET }, { status: 404 });
  const { form, sets } = editor;
  return NextResponse.json({
    form: projectFormForStaff(form, editor.context),
    sets: setsInFormOrder(form, sets).map((set) => projectSetForEditor(set, form, sets)),
  });
}
