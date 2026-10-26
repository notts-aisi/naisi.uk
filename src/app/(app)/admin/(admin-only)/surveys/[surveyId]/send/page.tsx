import { AdminPage } from "@/features/admin/adminList";
import SendTab from "@/features/surveys/admin/SendTab";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { sendView, surveyPage } from "@/lib/surveys/adminView";

export const dynamic = "force-dynamic";

/**
 * A survey's Send tab (sv-send-programme): the email, its test and the
 * buttons that send it, to everybody holding a place, then to whoever joins
 * since, and the reminder. Each email is signed by the admin looking at it,
 * who is the one who would press. Admins only, by the `(admin-only)` group's
 * layout (`requireAdminPage()`); the session is read here for the signature.
 */
export default async function SurveySendPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const admin = await getCurrentUser();
  const db = getAdminDb();
  const now = new Date();
  const page = db && admin ? await surveyPage(db, surveyId, now) : null;
  if (!db || !admin || !page) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  const view = await sendView(db, page.survey, admin.uid, now);
  return (
    <AdminPage wide>
      <SurveyHead head={page.head} current="send" />
      <SendTab surveyId={page.survey.id} view={view} />
    </AdminPage>
  );
}
