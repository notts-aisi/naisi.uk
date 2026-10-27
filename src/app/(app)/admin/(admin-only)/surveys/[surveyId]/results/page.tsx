import { AdminPage } from "@/features/admin/adminList";
import EventResultsHead, { EventResultsLayout } from "@/features/surveys/admin/EventResultsHead";
import ExportButton from "@/features/surveys/admin/ExportButton";
import ResultsTab from "@/features/surveys/admin/ResultsTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { resultsView, surveyPage } from "@/lib/surveys/adminView";
import { eventResultsHead, resultsWhoFor } from "@/lib/surveys/events/adminView";

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
  // A survey after an event (sv-results): its own numbers first, every rate of the answers, and who sees them (Q42).
  if (isEventSurvey(page.survey)) {
    const [head, view, who] = await Promise.all([
      eventResultsHead(db, page.survey),
      resultsView(db, page.survey, false),
      resultsWhoFor(db, page.survey),
    ]);
    return (
      <AdminPage wide>
        <SurveyHead head={page.head} current="results" />
        <EventResultsHead head={head} />
        <EventResultsLayout who={who} download={view.answers > 0 ? <ExportButton surveyId={page.survey.id} /> : null}>
          <ResultsTab view={view} surveyId={page.survey.id} beforeFirstSession={false} ofAnswers />
        </EventResultsLayout>
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
