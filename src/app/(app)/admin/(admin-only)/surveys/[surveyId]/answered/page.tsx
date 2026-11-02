import { AdminPage } from "@/features/admin/adminList";
import AnswersTab from "@/features/surveys/admin/AnswersTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { surveyPage } from "@/lib/surveys/adminView";

export const dynamic = "force-dynamic";

/**
 * A survey's Answers tab: every answer in one table, with names,
 * for admins only, by the `(admin-only)` group's layout, and closed in a
 * view-as session with the rest of the admin area.
 *
 * This page reads the survey and how many have answered, for its head, and
 * nothing of anybody: the table comes from the route that records the
 * opening of the tab first (`POST /api/surveys/[surveyId]/answers`), which
 * the tab asks once it is open in the admin's browser. So a prefetch or a
 * preview of this address records nothing and shows nothing of anybody.
 */
export default async function SurveyAnsweredPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const db = getAdminDb();
  const page = db ? await surveyPage(db, surveyId, new Date()) : null;
  if (!db || !page) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="answered" />
      <AnswersTab surveyId={page.survey.id} />
    </AdminPage>
  );
}
