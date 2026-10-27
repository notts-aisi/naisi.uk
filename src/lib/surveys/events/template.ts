import type { WorksheetOption } from "@/lib/firestore/worksheets";
import type { SurveyChoiceQuestion, SurveyItem } from "../items";

/**
 * "AFTER A SOCIAL" (sv-new, sv-social-phone): the template a survey after an
 * event is made from. Five questions, about a minute, every one of which can
 * be skipped. An admin rewords any of them, and their options, for each event
 * until the survey opens; the questions themselves stay (`sameQuestions`).
 *
 * THE IDS ARE FIXED STRINGS, the same for every event, so answers to one
 * question compare across events. Change the words freely; never an id.
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
  ...base("q_ev_again", "Would you come to another NAISI social?"),
  type: "singleChoice",
  options: [option("o_ev_yes", "Yes"), option("o_ev_maybe", "Maybe"), option("o_ev_no", "No")],
};

const NEXT: SurveyChoiceQuestion = {
  ...base("q_ev_next", "What should we run next?"),
  type: "multipleChoice",
  options: [
    option("o_ev_games", "Another games night"),
    option("o_ev_film", "A film night"),
    option("o_ev_quiz", "A quiz"),
    option("o_ev_talk", "A talk with food"),
    option("o_ev_else", "Something else"),
  ],
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
  return structuredClone<SurveyItem[]>([HOW, AGAIN, NEXT, HEARD, CHANGE]);
}

/** About how long it takes, as the board says: about a minute. The editor changes it. */
export const EVENT_TEMPLATE_MINUTES = 1;
