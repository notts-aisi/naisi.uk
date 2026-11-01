import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isCheckIn } from "@/lib/firestore/surveys";
import { pressBlanks } from "@/lib/surveys/blanksStore";
import { subjectOf } from "@/lib/surveys/onePerson";
import { canRunSurveys, isOpen, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { BLANKS_REFUSAL, REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string; who: string }> };

/**
 * "SEND THE QUESTIONS THEY LEFT BLANK", BY HAND, FOR ONE PERSON
 * (docs/surveys.md): an admin's press, from the Answers tab or the person's own
 * answers page, for somebody who sent the survey with required questions left
 * blank. It mints a new secret for that person's link of blanks, records the
 * press on their row (who, when, how many questions), then emails them the
 * link as an important notice. Never in bulk and never on its own.
 *
 * Body `{ questions }`, the number the confirmation named: when it is not the
 * number blank now, nothing is sent and the answer carries the new number.
 * Refused while the survey does not take answers, when nothing is blank, and
 * for somebody who has not sent it. Admins only, view-as refused first.
 * Answers with what became of the email and the line to show, never an
 * address or a secret.
 */
export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId, who } = await ctx.params;
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const questions = raw && typeof raw === "object" ? (raw as { questions?: unknown }).questions : undefined;
  if (!isSurveyId(surveyId) || typeof who !== "string" || typeof questions !== "number" || !Number.isInteger(questions) || questions < 1) {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });
  // A check-in is never sent again, its questions left blank included.
  if (isCheckIn(survey)) return NextResponse.json({ error: REFUSAL.checkInNotSent }, { status: 409 });
  const subject = subjectOf(survey, who);
  if (!subject) return NextResponse.json({ error: BLANKS_REFUSAL.nobody }, { status: 404 });
  const now = new Date();
  if (!isOpen(survey, now)) return NextResponse.json({ error: BLANKS_REFUSAL.closed }, { status: 409 });

  const outcome = await pressBlanks(db, { survey, subject, presserUid: actor.uid, viewer: actor, questions, now });
  if (!outcome.ok) {
    const headers = outcome.retryAfterSeconds ? { "Retry-After": String(outcome.retryAfterSeconds) } : undefined;
    return NextResponse.json(
      outcome.questions === undefined ? { error: outcome.error } : { error: outcome.error, questions: outcome.questions },
      { status: outcome.status, headers },
    );
  }
  return NextResponse.json({ ok: true, delivery: outcome.delivery, pressed: outcome.pressed });
}
