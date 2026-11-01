import { NextResponse } from "next/server";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { resultsView } from "@/lib/surveys/adminView";
import { questionTotalsCsv } from "@/lib/surveys/questionFile";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { chosenAnswers, readChoice } from "@/lib/surveys/resultsFilters";
import { CHART_WORDS, REFUSAL, questionFileWords } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

const QUESTION = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * "DOWNLOAD THIS QUESTION" ON A SURVEY'S RESULTS: one question's
 * totals and comments as a spreadsheet (`src/lib/surveys/questionFile.ts`),
 * counted again from the records when it is asked for, under the filters the
 * Results page holds (`?who=`, `?as=`, `?before-first-session=1`).
 *
 *   GET ?question=<id>  ->  the file
 *
 * ADMINS ONLY, asked before anything is read: a programme's lead reads the
 * results and never downloads them (the privacy policy: the lead "cannot
 * download the answers"). A view-as session's account is never an admin's,
 * so it is refused here like any other member's.
 *
 * A GET: it reads, and writes nothing. It names nobody, so it is NOT a
 * download the site logs (`dataExports`, for files of named people), and the
 * page's link can be an ordinary link that works before the page's script
 * arrives.
 */
export async function GET(req: Request, ctx: Ctx) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  const query = new URL(req.url).searchParams;
  const questionId = query.get("question") ?? "";
  if (!isSurveyId(surveyId) || !QUESTION.test(questionId)) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const chosen = await chosenAnswers(
    db,
    survey,
    readChoice({ who: query.get("who") ?? undefined, as: query.get("as") ?? undefined, beforeFirstSession: query.get("before-first-session") === "1" }),
  );
  const view = await resultsView(db, survey, chosen.choice.beforeFirstSession, { commentsInOrder: "words", only: chosen.only });
  const result = view.questions.find((each) => each.id === questionId);
  if (!result) return NextResponse.json({ error: CHART_WORDS.noQuestion }, { status: 404 });

  const now = new Date();
  const who = chosen.filters.narrowed || CHART_WORDS.everyone;
  return new Response(questionTotalsCsv(survey.name, result, { who, answers: view.answers }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${questionFileWords(survey.name, result.number, londonDateKey(now))}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
