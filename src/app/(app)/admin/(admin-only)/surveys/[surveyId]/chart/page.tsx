import Link from "next/link";
import { AdminPage } from "@/features/admin/adminList";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import MakeAChart from "@/features/surveys/chart/MakeAChart";
import styles from "@/features/surveys/chart/chart.module.css";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { isCheckIn } from "@/lib/firestore/surveys";
import { surveyPage } from "@/lib/surveys/adminView";
import { buildChart, readChartAsk } from "@/lib/surveys/chart";
import { surveyChart } from "@/lib/surveys/chartLoad";
import { MAKE_CHART_WORDS, chartAnswersWords, chartFileWords } from "@/lib/surveys/chartWords";

export const dynamic = "force-dynamic";

/**
 * A survey's Make a chart tab: one of its questions drawn as an admin
 * chooses, its counts, its shares or its average, for everybody who
 * answered or split into a chart a group, and counted for everybody or for
 * the people Who chooses (the Results' own filter). Admins only, by the
 * `(admin-only)` group's layout; a programme's lead never has it.
 *
 * Made on the server from the answers alone (`surveyChart`, then
 * `buildChart`), so drawing it names nobody and records nothing, and its
 * file of numbers (`GET /api/surveys/[surveyId]/chart`) builds the same
 * chart from the same reads. A check-in, one group's session, is charted
 * here on its own and leads to the chart of its programme's check-ins, week
 * by week and group by group.
 */
export default async function SurveyChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ surveyId }, query] = await Promise.all([params, searchParams]);
  const db = getAdminDb();
  const page = db ? await surveyPage(db, surveyId, new Date()) : null;
  if (!db || !page) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  const one = (key: string) => (typeof query[key] === "string" ? query[key] : undefined);
  const { survey } = page;
  const loaded = await surveyChart(db, survey, { who: one("who"), as: one("as") });
  const model = buildChart(loaded.input, readChartAsk({ question: one("question"), show: one("show"), split: one("split") }));
  const address = `/admin/surveys/${encodeURIComponent(survey.id)}/chart`;
  const aside = isCheckIn(survey) ? (
    <Link
      href={`/admin/surveys/check-ins/${encodeURIComponent(survey.audience.roundId)}/${encodeURIComponent(survey.audience.programmeId)}/chart`}
      className={styles.link}
    >
      {MAKE_CHART_WORDS.everyCheckIn}
    </Link>
  ) : null;
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="chart" />
      <MakeAChart
        model={model}
        who={loaded.who}
        action={address}
        file={`/api/surveys/${encodeURIComponent(survey.id)}/chart`}
        fileName={chartFileWords(survey.name, londonDateKey(new Date()))}
        line={[survey.name, loaded.input.who, chartAnswersWords(model.answers)].join(" · ")}
        aside={aside}
      />
    </AdminPage>
  );
}
