import { AdminPage } from "@/features/admin/adminList";
import ResultsTab from "@/features/surveys/admin/ResultsTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { resultsView, surveyPage } from "@/lib/surveys/adminView";

export const dynamic = "force-dynamic";

/**
 * A survey's Results tab: totals and comments, made on the server, never a
 * name. Admins only, by the `(admin-only)` group's layout. Results for a
 * programme's lead are a page of their own, still to come.
 */
export default async function SurveyResultsPage({
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
  const beforeFirstSession = query["before-first-session"] === "1";
  const view = await resultsView(db, page.survey, beforeFirstSession);
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="results" />
      <ResultsTab view={view} surveyId={page.survey.id} beforeFirstSession={beforeFirstSession} />
    </AdminPage>
  );
}
