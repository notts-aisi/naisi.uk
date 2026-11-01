import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadForm } from "@/lib/applications/repo";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { buildChart, chartNumbersCsv, readChartAsk } from "@/lib/surveys/chart";
import { checkInsChart } from "@/lib/surveys/chartLoad";
import { MAKE_CHART_WORDS, chartFileWords, checkInsTitleWords } from "@/lib/surveys/chartWords";
import { canRunSurveys } from "@/lib/surveys/repo";
import { CHART_WORDS, REFUSAL } from "@/lib/surveys/words";

type Ctx = { params: Promise<{ roundId: string; programmeId: string }> };

/**
 * "DOWNLOAD THE NUMBERS" ON MAKE A CHART ACROSS A PROGRAMME'S CHECK-INS: the
 * chart the page draws, as a spreadsheet (`chartNumbersCsv`), built again
 * from the records when it is asked for, by the same reads and the same
 * model as the page, under the choices the page's address holds
 * (`?question=`, `?show=`, `?split=`, `?who=`).
 *
 *   GET ?question=<id>&show=…&split=…  ->  the file
 *
 * ADMINS ONLY, asked before anything is read. The programme's lead reads
 * check-ins a week at a time, every group's together, behind floors, and
 * never downloads them; a chart by group is an admin's alone. A view-as
 * session's account is never an admin's, so it is refused here like any
 * other member's.
 *
 * A GET: it reads, and writes nothing. It names nobody, only groups and
 * counts, so it is NOT a download the site records (`dataExports`, for files
 * of named people).
 */
export async function GET(req: Request, ctx: Ctx) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: REFUSAL.notSignedIn }, { status: 401 });
  if (!canRunSurveys(actor)) return NextResponse.json({ error: REFUSAL.adminOnly }, { status: 403 });

  const { roundId, programmeId } = await ctx.params;
  const query = new URL(req.url).searchParams;
  const ask = readChartAsk({ question: query.get("question") ?? undefined, show: query.get("show") ?? undefined, split: query.get("split") ?? undefined });
  if (!isAddressableId(roundId) || !isAddressableId(programmeId) || ask.question === null) {
    return NextResponse.json({ error: REFUSAL.body }, { status: 400 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // The programme through the application form's own loader, which answers
  // null for a round that is not a form; once a form has gone, its check-ins
  // still name their programme.
  const form = await loadForm(db, roundId);
  const loaded = await checkInsChart(db, { roundId, programmeId, form }, { who: query.get("who") ?? undefined });
  if (!loaded) return NextResponse.json({ error: MAKE_CHART_WORDS.checkInsMissing }, { status: 404 });
  const model = buildChart(loaded.input, ask);
  if (model.chosen?.question !== ask.question) return NextResponse.json({ error: CHART_WORDS.noQuestion }, { status: 404 });

  const name = checkInsTitleWords(loaded.name);
  return new Response(chartNumbersCsv(model, { name, who: loaded.input.who }), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${chartFileWords(name, londonDateKey(new Date()))}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
