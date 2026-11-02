import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { openAnswersTable } from "@/lib/surveys/answersTable";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { ANSWERS_WORDS, REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * A SURVEY'S ANSWERS TAB: every answer in one table, with names,
 * for an admin.
 *
 * A POST and not a GET, because opening the tab writes: THE OPENING IS
 * RECORDED FIRST (`openAnswersTable`, through `openSurveyNamesRecorded` in
 * `src/lib/firestore/recordOpenings.ts`), with everybody whose answers it
 * shows, and no name is read until that row is stored. When it cannot be
 * stored, the tab stays closed. The page asks for this once it is open in the
 * admin's browser, so a prefetch or a preview of its address records and
 * reads nothing.
 *
 * ADMINS ONLY, decided before anything is read; refused in a view-as session
 * first, like every survey route. The answer is built field by field
 * (`AnswersView`), never a stored document.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  if (!isSurveyId(surveyId)) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const opening = await openAnswersTable(db, actor, survey, new Date());
  if (opening.kind === "names-off") return NextResponse.json({ error: ANSWERS_WORDS.namesOff }, { status: 410 });
  if (opening.kind === "not-recorded") return NextResponse.json({ error: ANSWERS_WORDS.notRecorded }, { status: 500 });
  return NextResponse.json({ answers: opening.view }, { headers: { "Cache-Control": "no-store" } });
}
