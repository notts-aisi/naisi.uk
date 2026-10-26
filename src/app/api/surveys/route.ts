import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { createBeforeSurvey, parseCreate } from "@/lib/surveys/create";
import { canRunSurveys } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

/**
 * MAKE A PROGRAMME'S BEFORE SURVEY from the template (sv-new): the programme,
 * the lines of question 4 and the day it closes. Admins only: only admins
 * make, send, remind and close surveys.
 *
 * ORDER: view-as first, then the session and the admin bar, then the body,
 * and only then a read. Answers `{ ok, survey: { id } }`.
 */
export async function POST(req: Request) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const now = new Date();
  const parsed = parseCreate(raw, now);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const made = await createBeforeSurvey(db, actor.uid, parsed.input, now);
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status });
  return NextResponse.json({ ok: true, survey: { id: made.id } });
}
