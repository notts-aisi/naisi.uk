import { AdminPage } from "@/features/admin/adminList";
import AnsweredTab from "@/features/surveys/admin/AnsweredTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { answeredView, surveyPage } from "@/lib/surveys/adminView";
import { eventAnsweredView } from "@/lib/surveys/events/adminView";

export const dynamic = "force-dynamic";

/**
 * A survey's Who answered tab: names, for admins only, by the `(admin-only)`
 * group's layout. Nobody else is shown who has answered. The session is read
 * here for the names rule (`nameForViewer`): each name as the admin looking
 * is shown it.
 */
export default async function SurveyAnsweredPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const [db, viewer] = [getAdminDb(), await getCurrentUser()];
  const page = db ? await surveyPage(db, surveyId, new Date()) : null;
  if (!db || !page) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  // A survey after an event names its guests too, and how each answered.
  const view: { rows: Awaited<ReturnType<typeof answeredView>>["rows"]; answered: number; sent: number; heading?: string } = isEventSurvey(page.survey)
    ? await eventAnsweredView(db, page.survey, viewer)
    : await answeredView(db, page.survey, viewer);
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="answered" />
      <AnsweredTab surveyId={page.survey.id} rows={view.rows} answered={view.answered} sent={view.sent} heading={view.heading} />
    </AdminPage>
  );
}
