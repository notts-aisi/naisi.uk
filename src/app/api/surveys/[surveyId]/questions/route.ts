import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isCheckIn } from "@/lib/firestore/surveys";
import { parseSave, saveSurvey } from "@/lib/surveys/create";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * SAVE A SURVEY'S WORDS AND QUESTIONS from its editor (sv-edit): the title
 * and intro people see, how many minutes it takes, the day it closes, and the
 * questions' words, options, lines and order. Refused once the survey has
 * been sent: from then on the email people got names the day it closes, and
 * the later stages have to ask the same questions.
 *
 * Admins only. The questions themselves cannot be added, taken out or
 * retyped here (`sameQuestions`), so every stage of a programme keeps
 * asking the questionnaire's questions under the same ids.
 */
export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  if (!isSurveyId(surveyId) || raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });
  // A check-in's questions are made from the group's week when it opens, and never change.
  if (isCheckIn(survey)) return NextResponse.json({ error: REFUSAL.checkInNotSent }, { status: 409 });
  if (survey.firstSentAt) return NextResponse.json({ error: REFUSAL.sent }, { status: 409 });

  const now = new Date();
  const parsed = parseSave(raw, survey, now);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const saved = await saveSurvey(db, survey, parsed.input, now);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  return NextResponse.json({ ok: true });
}
