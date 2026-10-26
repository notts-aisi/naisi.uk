import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import NewSurveyForm, { type ProgrammeOption } from "@/features/surveys/admin/NewSurveyForm";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { listProgrammeChoices } from "@/lib/surveys/create";
import { surveyQuestionsOf } from "@/lib/surveys/items";
import { listSurveys } from "@/lib/surveys/repo";
import { INCUBATOR_STRANDS, STRAND_WORDS, SURVEY_TEMPLATES, stageAsksStrand, templateItems, templateMinutes, type SurveyTemplate } from "@/lib/surveys/templates";
import { LIST_WORDS, STAGE_WORDS, minutesWords, questionsWords, strandWords } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/** "14 questions for a fellowship, 17 for an incubator · about 5 minutes". */
function sizeOf(stage: SurveyTemplate): string {
  const fellowship = surveyQuestionsOf(templateItems(stage, "fellowship", null)).length;
  const incubator = surveyQuestionsOf(templateItems(stage, "incubator", "alignment")).length;
  const questions = fellowship === incubator ? questionsWords(fellowship) : `${questionsWords(fellowship)} for a fellowship, ${incubator} for an incubator`;
  return `${questions} · ${minutesWords(templateMinutes(stage))}`;
}

/**
 * New survey (sv-new): a programme's survey at each stage, made from the
 * programme impact questionnaire's templates, and its leaving survey (Q46).
 * Admins only, by the `(admin-only)` group's layout. The board's other
 * templates (after a social, a blank survey, copying a past one) come with
 * the surveys they make, and are not offered here until then.
 */
export default async function NewSurveyPage() {
  const db = getAdminDb();
  const surveys = db ? await listSurveys(db) : [];
  const cards = await Promise.all(
    SURVEY_TEMPLATES.map(async (stage) => ({
      stage,
      programmes: (db ? await listProgrammeChoices(db, surveys, stage) : []).map(
        (choice): ProgrammeOption => ({
          roundId: choice.roundId,
          programmeId: choice.programmeId,
          name: choice.name,
          formName: choice.formName,
          kind: choice.kind,
          blocked: choice.blocked,
        }),
      ),
    })),
  );
  const today = londonDateKey(new Date());
  return (
    <AdminPage>
      <PageHead
        crumb={<Link href="/admin/surveys">{LIST_WORDS.title}</Link>}
        title="New survey"
        description="Start from a template. You can change any question before you send it."
      />
      {cards.map(({ stage, programmes }) => (
        <NewSurveyForm
          key={stage}
          stage={stage}
          heading={STAGE_WORDS[stage].card}
          line={STAGE_WORDS[stage].cardLine}
          size={sizeOf(stage)}
          programmes={programmes}
          strands={stageAsksStrand(stage) ? INCUBATOR_STRANDS.map((strand) => ({ value: strand, words: strandWords(strand, STRAND_WORDS[strand].line) })) : []}
          today={today}
          closes={stage !== "leaving"}
        />
      ))}
    </AdminPage>
  );
}
