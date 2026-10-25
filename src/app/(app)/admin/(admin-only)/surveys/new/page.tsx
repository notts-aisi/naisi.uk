import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import NewSurveyForm, { type ProgrammeOption } from "@/features/surveys/admin/NewSurveyForm";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { listProgrammeChoices, TEMPLATE_LINE_COUNT } from "@/lib/surveys/create";
import { CHANGE_QUESTION_IDS } from "@/lib/surveys/items";
import { listSurveys } from "@/lib/surveys/repo";
import { BEFORE_MINUTES, LIST_WORDS, sizeWords } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * New survey (sv-new): the before survey of a programme, made from its
 * template. Admins only, by the `(admin-only)` group's layout. The other
 * templates the board draws (after a social, leaving a programme, a blank
 * survey, copying a past one) come with the surveys they make, and are not
 * offered here until then.
 */
export default async function NewSurveyPage() {
  const db = getAdminDb();
  const programmes: ProgrammeOption[] = db ? await listProgrammeChoices(db, await listSurveys(db)) : [];
  return (
    <AdminPage>
      <PageHead
        crumb={<Link href="/admin/surveys">{LIST_WORDS.title}</Link>}
        title="New survey"
        description="Start from a template. You can change any question before you send it."
      />
      <NewSurveyForm
        programmes={programmes}
        lineCount={TEMPLATE_LINE_COUNT}
        size={sizeWords(CHANGE_QUESTION_IDS.length, BEFORE_MINUTES)}
        today={londonDateKey(new Date())}
      />
    </AdminPage>
  );
}
