import { AdminPage } from "@/features/admin/adminList";
import PersonAnswers from "@/features/surveys/admin/PersonAnswers";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { getAdminDb } from "@/lib/firebase/admin";
import { readSurvey } from "@/lib/surveys/repo";

export const dynamic = "force-dynamic";

/**
 * One person's answers (sv-person), opened from a survey's Who answered tab:
 * admins only, by the `(admin-only)` group's layout, and closed in a view-as
 * session with the rest of the admin area.
 *
 * This page reads the survey's name and nothing of the person: their name,
 * their answers and who has opened them come from the route that records the
 * opening first (`POST /api/surveys/[surveyId]/people/[who]`), which the page
 * asks once it is open in the admin's browser. So a prefetch or a preview of
 * this address records nothing and shows nothing of anybody.
 */
export default async function PersonAnswersPage({ params }: { params: Promise<{ surveyId: string; who: string }> }) {
  const { surveyId, who } = await params;
  const db = getAdminDb();
  const survey = db ? await readSurvey(db, surveyId) : null;
  if (!survey) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  return (
    <AdminPage wide>
      <PersonAnswers surveyId={survey.id} surveyName={survey.name} who={who} />
    </AdminPage>
  );
}
