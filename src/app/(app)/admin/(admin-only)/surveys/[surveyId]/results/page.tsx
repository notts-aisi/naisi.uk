import { AdminPage } from "@/features/admin/adminList";
import ResultsFilters from "@/features/surveys/charts/ResultsFilters";
import charts from "@/features/surveys/charts/charts.module.css";
import EventResultsHead, { EventResultsLayout } from "@/features/surveys/admin/EventResultsHead";
import ResultsTab, { type ResultsAdmin } from "@/features/surveys/admin/ResultsTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import styles from "@/features/surveys/admin/surveyAdmin.module.css";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { resultsView, surveyPage } from "@/lib/surveys/adminView";
import { eventResultsHead, resultsWhoFor } from "@/lib/surveys/events/adminView";
import { chosenAnswers, readChoice } from "@/lib/surveys/resultsFilters";
import { CHART_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A survey's Results tab: every question as a chart, made on the
 * server, never a name. Admins only, by the `(admin-only)` group's layout.
 * The programme's lead reads the same charts on a page of their own, without
 * any of what follows.
 *
 * For the admin: the filters (Who, on a programme's survey: everybody or one
 * group; Came as, after an event: members, guests or both), held in the
 * address so the page, its "See who" and its files count the same answers;
 * "See who" behind each bar and "Whose is this?" beside each comment, which
 * open names only through the route that records each opening first, so
 * drawing this page names nobody and records nothing; and each question's
 * two downloads, neither of which names anybody.
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
  const one = (key: string) => (typeof query[key] === "string" ? query[key] : undefined);
  const event = isEventSurvey(page.survey);
  const chosen = await chosenAnswers(
    db,
    page.survey,
    readChoice({ who: one("who"), as: one("as"), beforeFirstSession: !event && one("before-first-session") === "1" }),
  );
  const { choice, filters } = chosen;
  const view = await resultsView(db, page.survey, choice.beforeFirstSession, { commentsInOrder: "words", only: chosen.only, keys: true });
  const admin: ResultsAdmin = {
    surveyName: page.survey.name,
    today: londonDateKey(new Date()),
    choice: { who: choice.who ?? "", as: choice.as ?? "", beforeFirstSession: choice.beforeFirstSession },
    commentKeys: view.commentKeys ?? {},
  };
  const above = (
    <div className={styles.section}>
      {(filters.who || filters.as) && (
        <ResultsFilters
          action={`/admin/surveys/${encodeURIComponent(page.survey.id)}/results`}
          who={filters.who}
          cameAs={filters.as}
          chosen={filters.chosen}
          beforeFirstSession={choice.beforeFirstSession}
        />
      )}
      {view.answers > 0 && <p className={charts.note}>{CHART_WORDS.namesNote}</p>}
    </div>
  );
  const tab = (
    <ResultsTab
      view={view}
      surveyId={page.survey.id}
      beforeFirstSession={choice.beforeFirstSession}
      ofAnswers={event || filters.narrowed !== ""}
      switches={!event}
      admin={admin}
      narrowed={filters.narrowed}
    />
  );

  // A survey after an event: its own numbers first, every rate of the answers, and who sees them
  // (admins only; the organiser is sent a summary).
  if (event && isEventSurvey(page.survey)) {
    const [head, who] = await Promise.all([eventResultsHead(db, page.survey), resultsWhoFor(db, page.survey)]);
    return (
      <AdminPage wide>
        <SurveyHead head={page.head} current="results" />
        <EventResultsHead head={head} />
        <EventResultsLayout who={who} download={null}>
          <div className={styles.main}>
            {above}
            {tab}
          </div>
        </EventResultsLayout>
      </AdminPage>
    );
  }
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="results" />
      <div className={styles.main}>
        {above}
        {tab}
      </div>
    </AdminPage>
  );
}
