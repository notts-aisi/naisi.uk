import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { openAtEvent } from "@/lib/surveys/events/sending";
import { EVENT_REFUSAL } from "@/lib/surveys/events/words";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * OPEN A SURVEY AFTER AN EVENT FOR ITS QR CODE (sv-send, "At the event"):
 * from this moment it takes answers from anybody signed in who came or
 * signed up, through the code's page, until it closes. It fixes the
 * survey's questions, words and closing day, as a first send does, and is
 * claimed once. Nobody is emailed: the email is its own press, later.
 *
 * ORDER: view-as first, then the session and the admin bar, then the
 * address, and only then a read. Admins only. Body `{}`. A survey that is
 * not one after an event is answered 409: it opens with its first send.
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

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });
  if (!isEventSurvey(survey)) return NextResponse.json({ error: EVENT_REFUSAL.notEvent }, { status: 409 });

  const opened = await openAtEvent(db, survey, actor.uid, new Date());
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: opened.status });
  return NextResponse.json({ ok: true });
}
