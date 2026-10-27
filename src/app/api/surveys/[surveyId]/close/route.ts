import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { closeAnonymousForm } from "@/lib/anonymousFeedback/forms";
import { alignWalkInEmails } from "@/lib/surveys/events/records";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { SURVEYS_COLLECTION, normalizeSurvey } from "@/lib/firestore/surveys";
import { canRunSurveys, isOpen, isSurveyId } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * CLOSE A SURVEY NOW, before its closing day: from this moment it takes no
 * more answers and nothing more can be sent, and it is never opened again.
 * The survey at a programme's end takes its anonymous form with it, and a
 * survey after an event the emails its walk-ins left for it. Nobody is
 * emailed. Admins only.
 *
 * A survey that is not open (never sent, or already closed) is answered 409:
 * there is nothing to close. Body `{}`.
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

  const ref = db.collection(SURVEYS_COLLECTION).doc(surveyId);
  const now = new Date();
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 404, error: REFUSAL.noSurvey };
    const survey = normalizeSurvey(snap.id, snap.data() ?? {});
    if (!survey.firstSentAt) return { status: 409, error: REFUSAL.notSentYet };
    if (!isOpen(survey, now)) return { status: 409, error: REFUSAL.closed };
    tx.update(ref, { closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return null;
  });
  if (outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  // The anonymous keep, change and drop form that follows the survey at a
  // programme's end closes with it (docs/surveys.md). Any other survey has
  // none, and this changes nothing.
  await closeAnonymousForm(db, surveyId);
  // A survey after an event takes its walk-ins' emails with it: they were
  // kept for it alone (src/lib/events/checkIns.ts). Any other survey has none.
  await alignWalkInEmails(db, surveyId, now);
  return NextResponse.json({ ok: true });
}
