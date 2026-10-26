import { redirect } from "next/navigation";
import { AdminPage } from "@/features/admin/adminList";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { surveyTabHref } from "@/features/surveys/admin/SurveyHead";
import { getAdminDb } from "@/lib/firebase/admin";
import { readSurvey } from "@/lib/surveys/repo";

export const dynamic = "force-dynamic";

/**
 * A survey's own address: a draft opens on its questions, a sent survey on
 * its results. Admins only, by the `(admin-only)` group's layout.
 */
export default async function SurveyPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const db = getAdminDb();
  const survey = db ? await readSurvey(db, surveyId) : null;
  if (survey) redirect(surveyTabHref(survey.id, survey.firstSentAt ? "results" : "questions"));
  return (
    <AdminPage>
      <SurveyMissing />
    </AdminPage>
  );
}
