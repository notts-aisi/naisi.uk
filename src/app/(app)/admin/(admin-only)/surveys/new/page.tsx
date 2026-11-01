import Link from "next/link";
import PageHead from "@/components/ui/PageHead";
import { AdminPage } from "@/features/admin/adminList";
import EventSurveyForm from "@/features/surveys/admin/EventSurveyForm";
import NewSurveyForm, { type ProgrammeOption } from "@/features/surveys/admin/NewSurveyForm";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { getAdminDb } from "@/lib/firebase/admin";
import { listProgrammeChoices } from "@/lib/surveys/create";
import { minutesFor } from "@/lib/surveys/events/after";
import { listEventChoices } from "@/lib/surveys/events/create";
import { eventTemplateItems } from "@/lib/surveys/events/template";
import { eventLine } from "@/lib/surveys/events/words";
import { surveyQuestionsOf } from "@/lib/surveys/items";
import { eventStandardItems } from "@/lib/surveys/questionSetsStore";
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
 * programme impact questionnaire's templates, its leaving survey (Q46), and
 * the survey after an event ("After a social"), which `?event=<id>` starts on
 * that event. Admins only, by the `(admin-only)` group's layout. The board's
 * other templates (a blank survey, copying a past one) come with the surveys
 * they make, and are not offered here until then.
 */
export default async function NewSurveyPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const query = (await searchParams) ?? {};
  const db = getAdminDb();
  const now = new Date();
  const surveys = db ? await listSurveys(db) : [];
  const events = db ? await listEventChoices(db, surveys, now) : [];
  const picked = typeof query.event === "string" ? query.event : null;
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
  const today = londonDateKey(now);
  // After a social starts from the question set an admin keeps for it, else the code's.
  const eventQuestions = surveyQuestionsOf(db ? await eventStandardItems(db) : eventTemplateItems()).length;
  const eventSize = `${questionsWords(eventQuestions)} · ${minutesWords(minutesFor(eventQuestions))}`;
  return (
    <AdminPage>
      <PageHead
        crumb={<Link href="/admin/surveys">{LIST_WORDS.title}</Link>}
        title="New survey"
        description="Start from a template. You can change any question before you send it."
      />
      {cards.map(({ stage, programmes }) => [
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
        />,
        // sv-new draws "After a social" second, after the programme's first survey.
        stage === "before" ? (
          <EventSurveyForm
            key="event"
            size={eventSize}
            events={events.map((event) => ({ eventId: event.eventId, label: eventLine(event.title, event.startAt), noSignup: event.noSignup, blocked: event.blocked }))}
            picked={picked}
            today={today}
          />
        ) : null,
      ])}
    </AdminPage>
  );
}
