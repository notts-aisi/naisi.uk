import { NextResponse } from "next/server";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { buildChart, chartNumbersCsv, readChartAsk } from "@/lib/surveys/chart";
import { surveyChart } from "@/lib/surveys/chartLoad";
import { chartFileWords } from "@/lib/surveys/chartWords";
import { canRunSurveys, isSurveyId, readSurvey } from "@/lib/surveys/repo";
import { CHART_WORDS, REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ surveyId: string }> };

/**
 * "DOWNLOAD THE NUMBERS" ON A SURVEY'S MAKE A CHART: the chart the page
 * draws, as a spreadsheet (`chartNumbersCsv`), built again from the records
 * when it is asked for, by the same reads and the same model as the page,
 * under the choices the page's address holds (`?question=`, `?show=`,
 * `?split=`, and Who's `?who=` or `?as=`).
 *
 *   GET ?question=<id>&show=…&split=…  ->  the file
 *
 * ADMINS ONLY, asked before anything is read: a programme's lead reads
 * totals on the programme's own pages and never downloads them, by group or
 * otherwise (the privacy policy: the lead "cannot download the answers"). A
 * view-as session's account is never an admin's, so it is refused here like
 * any other member's.
 *
 * A GET: it reads, and writes nothing. It names nobody, so it is NOT a
 * download the site records (`dataExports`, for files of named people), and
 * the page's link is an ordinary link that works before its script arrives.
 */
export async function GET(req: Request, ctx: Ctx) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { surveyId } = await ctx.params;
  const query = new URL(req.url).searchParams;
  const ask = readChartAsk({ question: query.get("question") ?? undefined, show: query.get("show") ?? undefined, split: query.get("split") ?? undefined });
  if (!isSurveyId(surveyId) || ask.question === null) return NextResponse.json({ error: REFUSAL.body }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const survey = await readSurvey(db, surveyId);
  if (!survey) return NextResponse.json({ error: REFUSAL.noSurvey }, { status: 404 });

  const loaded = await surveyChart(db, survey, { who: query.get("who") ?? undefined, as: query.get("as") ?? undefined });
  const model = buildChart(loaded.input, ask);
  if (model.chosen?.question !== ask.question) return NextResponse.json({ error: CHART_WORDS.noQuestion }, { status: 404 });

  return new Response(chartNumbersCsv(model, { name: survey.name, who: loaded.input.who }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${chartFileWords(survey.name, londonDateKey(new Date()))}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
