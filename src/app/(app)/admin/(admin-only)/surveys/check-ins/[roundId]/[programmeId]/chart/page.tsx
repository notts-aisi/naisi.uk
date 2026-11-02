import Link from "next/link";
import Chip from "@/components/ui/Chip";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import MakeAChart from "@/features/surveys/chart/MakeAChart";
import { isAddressableId } from "@/lib/addressableId";
import { loadForm } from "@/lib/applications/repo";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildChart, readChartAsk } from "@/lib/surveys/chart";
import { checkInsChart } from "@/lib/surveys/chartLoad";
import {
  MAKE_CHART_WORDS,
  chartAnswersWords,
  chartFileWords,
  checkInsLineWords,
  checkInsTitleWords,
} from "@/lib/surveys/chartWords";
import { hubTabHref } from "@/lib/surveys/hub/tabs";

export const dynamic = "force-dynamic";

/**
 * MAKE A CHART ACROSS A PROGRAMME'S CHECK-INS, for admins: one question of
 * the check-ins at the end of its groups' sessions, week by week, for every
 * group together or a chart a group on one scale, counted for everybody or
 * for one group (`checkInsChart`, then `buildChart`). Opens on how useful
 * the sessions were, on average, by week, by group.
 *
 * ADMINS ONLY, by the `(admin-only)` group's layout. The programme's lead
 * reads check-ins on the programme's own Surveys tab, a whole week at a
 * time, every group's together, behind floors, and never by group: this page
 * is not theirs, and nothing on their tab leads here. An admin's chart has
 * no floor, as an admin's own pages show each check-in.
 *
 * Drawing it names nobody and records nothing; its file of numbers
 * (`GET /api/surveys/check-ins/[roundId]/[programmeId]/chart`) builds the
 * same chart from the same reads. An address that names no programme with a
 * check-in is answered on the page in a sentence, never `notFound()`.
 */
export default async function CheckInsChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ roundId, programmeId }, query] = await Promise.all([params, searchParams]);
  const one = (key: string) => (typeof query[key] === "string" ? query[key] : undefined);
  const db = getAdminDb();
  // The programme through the application form's own loader, which answers
  // null for a round that is not a form; once a form has gone, its check-ins
  // still name their programme.
  const form = db && isAddressableId(roundId) ? await loadForm(db, roundId) : null;
  const loaded = db ? await checkInsChart(db, { roundId, programmeId, form }, { who: one("who") }) : null;
  const crumb = <Link href={hubTabHref("programmes")}>{MAKE_CHART_WORDS.crumb}</Link>;
  if (!loaded) {
    return (
      <AdminPage>
        <PageHead crumb={crumb} title={MAKE_CHART_WORDS.checkInsMissingTitle} description={MAKE_CHART_WORDS.checkInsMissing} />
      </AdminPage>
    );
  }
  const model = buildChart(loaded.input, readChartAsk({ question: one("question"), show: one("show"), split: one("split") }));
  const title = checkInsTitleWords(loaded.name);
  const base = `${encodeURIComponent(roundId)}/${encodeURIComponent(programmeId)}`;
  return (
    <AdminPage wide>
      <PageHead
        crumb={crumb}
        title={title}
        badges={<Chip tone="accent">{MAKE_CHART_WORDS.everySession}</Chip>}
        meta={
          <>
            <span>{loaded.programme}</span>
            <span>{checkInsLineWords(loaded.weeksAt, loaded.answers)}</span>
          </>
        }
      />
      <MakeAChart
        model={model}
        who={loaded.who}
        action={`/admin/surveys/check-ins/${base}/chart`}
        file={`/api/surveys/check-ins/${base}/chart`}
        fileName={chartFileWords(title, londonDateKey(new Date()))}
        line={[title, loaded.input.who, chartAnswersWords(model.answers)].join(" · ")}
      />
    </AdminPage>
  );
}
