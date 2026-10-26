import { AdminPage } from "@/features/admin/adminList";
import AnsweredTab from "@/features/surveys/admin/AnsweredTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { answeredView, surveyPage } from "@/lib/surveys/adminView";

export const dynamic = "force-dynamic";

/**
 * A survey's Who answered tab: names, for admins only, by the `(admin-only)`
 * group's layout. Nobody else is shown who has answered.
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
  const view = await answeredView(db, page.survey);
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="answered" />
      <AnsweredTab surveyId={page.survey.id} rows={view.rows} answered={view.answered} sent={view.sent} />
    </AdminPage>
  );
}
