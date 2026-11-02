import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { openWhoBehind, readWhoAsked } from "@/lib/surveys/seeWho";
import { CHART_WORDS, REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * "SEE WHO (7)" BEHIND A BAR OF A SURVEY'S RESULTS, OR "WHOSE IS THIS?"
 * BESIDE A COMMENT: the names of the people behind it, for an
 * admin. Names, never addresses.
 *
 *   POST { question, bar, count, who?, as?, beforeFirstSession? }
 *   POST { question, comment, who?, as?, beforeFirstSession? }
 *     ->  { who: { names, namesOff, opened } }
 *
 * A POST and not a GET, because opening them writes: THE OPENING IS RECORDED
 * FIRST (`openWhoBehind`, through `openSurveyNamesRecorded` in
 * `src/lib/firestore/recordOpenings.ts`), and no name is read until that row
 * is stored. When it cannot be stored, nobody is named. A bar whose count is
 * no longer the one on its button opens nothing: the page is reloaded first.
 *
 * ADMINS ONLY, decided before anything is read; refused in a view-as session
 * first, like every survey route. The answer is built field by field, never
 * a stored document.
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
  const asked = readWhoAsked(raw);
  if (!isSurveyId(surveyId) || !asked) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const opening = await openWhoBehind(db, actor, survey, asked, new Date());
  if (opening.kind === "no-question") return NextResponse.json({ error: CHART_WORDS.noQuestion }, { status: 404 });
  if (opening.kind === "no-comment") return NextResponse.json({ error: CHART_WORDS.noComment }, { status: 404 });
  if (opening.kind === "names-off") return NextResponse.json({ error: CHART_WORDS.namesOff }, { status: 410 });
  if (opening.kind === "changed") return NextResponse.json({ error: CHART_WORDS.changed }, { status: 409 });
  if (opening.kind === "not-recorded") return NextResponse.json({ error: CHART_WORDS.notRecorded }, { status: 500 });
  return NextResponse.json(
    { who: { names: opening.view.names, namesOff: opening.view.namesOff, opened: opening.view.opened } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
