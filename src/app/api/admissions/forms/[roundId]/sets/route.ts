import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunTerm } from "@/lib/applications/access";
import { loadEditor } from "@/lib/applications/editor/load";
import { parseNewSet } from "@/lib/applications/editor/parse";
import {
  projectFormForStaff,
  projectSetForEditor,
  setsInFormOrder,
} from "@/lib/applications/editor/views";
import { createSet } from "@/lib/applications/editor/write";
import { isId } from "@/lib/applications/normalise";

const NO_FORM = "There is no application form here.";
const ADMIN_ONLY = "Only an admin can change the application form.";

/**
 * The form's question sets, with every question, for the editor. Admin only:
 * the questions are the form, and the form is an admin's to edit. Decided
 * before anything is read, so nobody else learns whether the form exists.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const editor = await loadEditor(db, user, roundId);
  if (!editor) return NextResponse.json({ error: NO_FORM }, { status: 404 });
  const { form, sets } = editor;
  return NextResponse.json({
    form: projectFormForStaff(form, editor.context),
    sets: setsInFormOrder(form, sets).map((set) => projectSetForEditor(set, form, sets)),
  });
}

/**
 * Add an empty question set to the form: a name, and who it is for (a kind of
 * programme, one programme, or people who said yes to facilitating). Admin
 * only, and refused once anybody has sent an application.
 */
export async function POST(req: Request, ctx: { params: Promise<{ roundId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;
  const { roundId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!canRunTerm(user)) return NextResponse.json({ error: ADMIN_ONLY }, { status: 403 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const parsed = parseNewSet(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId)) return NextResponse.json({ error: NO_FORM }, { status: 404 });

  const created = await createSet(db, user, roundId, parsed.value);
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: created.status });
  }

  const editor = await loadEditor(db, user, roundId);
  if (!editor) return NextResponse.json({ error: NO_FORM }, { status: 404 });
  const { form, sets } = editor;
  return NextResponse.json(
    {
      id: created.value.id,
      form: projectFormForStaff(form, editor.context),
      sets: setsInFormOrder(form, sets).map((set) => projectSetForEditor(set, form, sets)),
    },
    { status: 201 },
  );
}
