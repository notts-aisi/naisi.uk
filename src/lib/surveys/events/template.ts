import type { WorksheetOption } from "@/lib/firestore/worksheets";
import { markNotForEverybody, type SurveyChoiceQuestion, type SurveyItem } from "../items";

/**
 * THE STANDARD QUESTIONS AFTER AN EVENT ("After a social" on New survey, and
 * what the event editor's Survey after step starts from). Five questions,
 * about a minute, every one required but "Anything we should change?", a
 * catch-all (`NOT_FOR_EVERYBODY` in `../items`). In the step, an event's
 * organiser rewords, moves or removes any of them and adds their own, until
 * the survey opens (`./after.ts`); a standard question is never retyped. An
 * admin rewords a survey's questions on its Questions tab until it opens, and
 * adds or removes none there (`sameQuestions`).
 *
 * THE IDS ARE FIXED STRINGS, the same for every event, so answers to one
 * question compare across events. Change the words freely; never an id. A
 * question that changes its type takes a new id: "What should we run next?"
 * was a pick-any (`q_ev_next`, still on every survey made before November
 * 2026) and is a short answer since (`q_ev_next_text`), so the old answers
 * still compare with each other.
 *
 * Beside them, THE ONE QUESTION FOR PEOPLE WHO HAD A PLACE AND DIDN'T COME
 * (`missedTemplateItems`), sent instead when the step asks for it.
 *
 * Pure: words and shapes only.
 */

const option = (id: string, label: string): WorksheetOption => ({ id, label });

function base(id: string, title: string): Pick<SurveyChoiceQuestion, "kind" | "id" | "title" | "body" | "required"> {
  return { kind: "question", id, title, body: [], required: false };
}

const HOW: SurveyChoiceQuestion = {
  ...base("q_ev_how", "How was it?"),
  type: "rating",
  rating: { max: 5, minLabel: "Not good", maxLabel: "Great" },
};

const AGAIN: SurveyChoiceQuestion = {
  ...base("q_ev_again", "Would you come to another?"),
  type: "singleChoice",
  options: [option("o_ev_yes", "Yes"), option("o_ev_maybe", "Maybe"), option("o_ev_no", "No")],
};

const NEXT: SurveyChoiceQuestion = {
  ...base("q_ev_next_text", "What should we run next?"),
  type: "shortText",
  limit: { unit: "characters", max: 200 },
};

const HEARD: SurveyChoiceQuestion = {
  ...base("q_ev_heard", "How did you hear about it?"),
  type: "singleChoice",
  options: [
    option("o_ev_friend", "A friend"),
    option("o_ev_instagram", "Instagram"),
    option("o_ev_emails", "Our emails"),
    option("o_ev_fair", "The freshers’ fair"),
    option("o_ev_poster", "A poster"),
    option("o_ev_other", "Something else"),
  ],
};

const CHANGE: SurveyChoiceQuestion = {
  ...base("q_ev_change", "Anything we should change?"),
  type: "longText",
  limit: { unit: "characters", max: 2000 },
};

/** The template's questions, fresh each time. */
export function eventTemplateItems(): SurveyItem[] {
  return markNotForEverybody(structuredClone<SurveyItem[]>([HOW, AGAIN, NEXT, HEARD, CHANGE]));
}

/** About how long it takes, as the board says: about a minute. The editor changes it. */
export const EVENT_TEMPLATE_MINUTES = 1;

/** The ids of the standard questions, in their order: a question with one of these is standard, and keeps its type. */
export const STANDARD_QUESTION_IDS: readonly string[] = [HOW, AGAIN, NEXT, HEARD, CHANGE].map((question) => question.id);

const MISSED_WHY: SurveyChoiceQuestion = {
  ...base("q_ev_missed_why", "What stopped you coming?"),
  type: "longText",
  limit: { unit: "characters", max: 1000 },
};

/**
 * The one question for people who had a place and weren't checked in, fresh
 * each time. Required: it is all the survey asks, and somebody who would
 * rather not say leaves the email unanswered.
 */
export function missedTemplateItems(): SurveyItem[] {
  return structuredClone<SurveyItem[]>([MISSED_WHY]);
}
