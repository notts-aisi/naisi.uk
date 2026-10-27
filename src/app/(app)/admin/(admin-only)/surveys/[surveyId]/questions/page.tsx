import { AdminPage } from "@/features/admin/adminList";
import QuestionsEditor from "@/features/surveys/admin/QuestionsEditor";
import QuestionsList from "@/features/surveys/admin/QuestionsList";
import SurveyHead from "@/features/surveys/admin/SurveyHead";
import SurveyMissing from "@/features/surveys/admin/SurveyMissing";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { surveyPage } from "@/lib/surveys/adminView";
import { isEventSurvey } from "@/lib/firestore/surveys";
import { LOCK_WORDS } from "@/lib/surveys/events/words";
import { TEMPLATE_MEASURES } from "@/lib/surveys/templates";

export const dynamic = "force-dynamic";

/**
 * A survey's Questions tab (sv-edit): its words and questions, changed here
 * until it is first sent and read here after. Admins only, by the
 * `(admin-only)` group's layout.
 */
export default async function SurveyQuestionsPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const db = getAdminDb();
  const now = new Date();
  const page = db ? await surveyPage(db, surveyId, now) : null;
  if (!page) {
    return (
      <AdminPage>
        <SurveyMissing />
      </AdminPage>
    );
  }
  const { survey, head } = page;
  // A survey after an event locks when it opens, at the event or with its email.
  const event = isEventSurvey(survey);
  return (
    <AdminPage wide>
      <SurveyHead head={head} current="questions" />
      {survey.firstSentAt ? (
        <QuestionsList items={survey.items} measures={TEMPLATE_MEASURES} intro={survey.intro} title={survey.title} {...(event ? { lockNote: LOCK_WORDS.fixed } : {})} />
      ) : (
        <QuestionsEditor
          surveyId={survey.id}
          measures={TEMPLATE_MEASURES}
          today={londonDateKey(now)}
          closes={survey.kind !== "leaving"}
          {...(event ? { lockNote: LOCK_WORDS.editing } : {})}
          initial={{
            title: survey.title,
            intro: survey.intro,
            minutes: survey.minutes,
            closesOn: survey.closesAt ? londonDateKey(survey.closesAt) : "",
            items: survey.items,
          }}
        />
      )}
    </AdminPage>
  );
}
