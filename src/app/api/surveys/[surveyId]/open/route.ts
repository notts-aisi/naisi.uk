import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { openLeavingSurvey } from "@/lib/surveys/leaving";
import { canRunSurveys, isSurveyId } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * OPEN A LEAVING SURVEY (Q46): from this moment it reaches each person who
 * leaves its programme by their own hand, through their own link, on the
 * page that says they left and in the email that says so. Nobody presses
 * send and nobody is emailed by this press. It fixes the questions and words
 * and the day names come off, as a first send does, and it is claimed once.
 *
 * ORDER: view-as first, then the session and the admin bar, then the
 * address, and only then a read. Admins only. Body `{}`. A survey that is
 * not a leaving survey is answered 409: it is sent from its Send tab.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  if (!isSurveyId(surveyId)) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const opened = await openLeavingSurvey(db, surveyId, new Date());
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status });
  return NextResponse.json({ ok: true });
}
