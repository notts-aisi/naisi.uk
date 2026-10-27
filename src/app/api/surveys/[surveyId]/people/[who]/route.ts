import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { openPersonAnswers } from "@/lib/surveys/onePerson";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { PERSON_WORDS, REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string; who: string }> };

/**
 * AN ADMIN OPENS ONE PERSON'S ANSWERS (sv-person), from a survey's Who
 * answered tab: to every survey of its programme, or to a survey after an
 * event. Usually for a request to see or delete them.
 *
 * A POST and not a GET, because opening them writes: THE OPENING IS RECORDED
 * FIRST (`openPersonAnswers`, through `openSurveyAnswersRecorded` in
 * `src/lib/firestore/recordOpenings.ts`), with who opened them, whose they
 * were, the surveys and when, and nothing of the person is read until that
 * row is stored. When it cannot be stored, they stay closed. The page asks
 * for this when it is opened in an admin's browser, so a link that is only
 * fetched (a prefetch, a preview) records and reads nothing.
 *
 * ADMINS ONLY, decided before anything is read, never a programme's lead, a
 * facilitator or a committee member; refused in a view-as session like every
 * other survey route, and it could not succeed in one anyway: the session is
 * then the member's, who is no admin.
 *
 * The answer is built field by field (`PersonView`), never a stored document.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId, who } = await ctx.params;
  if (!isSurveyId(surveyId)) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const opening = await openPersonAnswers(db, actor, survey, who, new Date());
  if (opening.kind === "nobody") return NextResponse.json({ error: PERSON_WORDS.nobodyHere }, { status: 404 });
  if (opening.kind === "names-off") return NextResponse.json({ error: PERSON_WORDS.namesOff }, { status: 410 });
  if (opening.kind === "not-recorded") return NextResponse.json({ error: PERSON_WORDS.notRecorded }, { status: 500 });
  return NextResponse.json({ person: opening.view }, { headers: { "Cache-Control": "no-store" } });
}
