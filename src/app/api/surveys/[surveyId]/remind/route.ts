import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { testRefusal } from "@/lib/surveys/emails";
import { canRunSurveys, isOpen, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { pressRemind, signerOf, testStateFor } from "@/lib/surveys/sending";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * REMIND, BY HAND (sv-send-programme): the reminder, to the people a survey
 * was sent to who have not answered and still hold a place. Nothing goes
 * until an admin presses it; no reminder goes on its own.
 *
 * Body `{ emails }`, the number on the button: when it is not the number the
 * reminder would reach now, nothing is sent and the answer carries the new
 * number. Refused until the presser has sent themselves a test of the
 * reminder's wording. Admins only. Answers with counts, never addresses.
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
  const emails = raw && typeof raw === "object" ? (raw as { emails?: unknown }).emails : undefined;
  if (!isSurveyId(surveyId) || typeof emails !== "number" || !Number.isInteger(emails) || emails < 0) {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });
  const now = new Date();
  if (!survey.firstSentAt) return NextResponse.json({ error: REFUSAL.notSentYet }, { status: 409 });
  if (!isOpen(survey, now)) return NextResponse.json({ error: REFUSAL.closedSend }, { status: 409 });

  const refusal = testRefusal(testStateFor(survey, "reminder", await signerOf(db, actor.uid)));
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });

  const outcome = await pressRemind(db, { survey, presserUid: actor.uid, emails, namesOffOn: survey.namesOffOn, now });
  if (!outcome.ok) {
    const headers = outcome.retryAfterSeconds ? { "Retry-After": String(outcome.retryAfterSeconds) } : undefined;
    return NextResponse.json(
      outcome.emails === undefined ? { error: outcome.error } : { error: outcome.error, emails: outcome.emails },
      { status: outcome.status, headers },
    );
  }
  const { sent, held, suppressed, failed, noAddress } = outcome.tally;
  return NextResponse.json({ ok: true, sent, held, suppressed, failed, noAddress });
}
