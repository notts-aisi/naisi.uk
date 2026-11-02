/**
 * `surveyQuestionSets/{kind}`: THE QUESTIONS EACH KIND OF SURVEY STARTS WITH,
 * as an admin changed them on Run NAISI › Surveys › Question sets
 * (docs/surveys.md, "Question sets"). One document per kind, and only while
 * the set differs from the code's: with none, every reader takes the code's
 * own (`src/lib/surveys/templates.ts`, `src/lib/surveys/events/template.ts`,
 * `src/lib/surveys/checkIns/template.ts` and the session report's words in
 * `src/lib/courses/sessionReports/words.ts`).
 *
 * TWO SHAPES, BY KIND:
 *
 *  - WORDS ONLY: before a programme, its end, leaving it, the weekly check-in
 *    and the facilitator's session report. `words` holds only the words an
 *    admin changed, each under its place in the set (`q_c1:title`,
 *    `q_c1:option:o_stage0`, `how:low`), and nothing else: every question's
 *    id, kind, answers and order stay the code's, because a programme's
 *    stages pair answers by question id, and check-ins and reports are read
 *    by id for the facilitators' totals and the Surveys tab.
 *  - WHOLE: the survey after an event. `items` holds the set's questions,
 *    which may be added to, removed, retyped and reworded.
 *
 * A CHANGE REACHES SURVEYS MADE AFTER IT, NEVER ONE ALREADY MADE. Every survey
 * copies its questions when it is made, so nothing here is read again for one
 * that exists. A session report keeps its answers by question, so its form
 * asks in the words of the day it is drawn.
 *
 * WRITTEN ONLY by `PUT /api/surveys/question-sets/[kind]`, an admin's, through
 * `saveQuestionSet` (`src/lib/surveys/questionSetsStore.ts`), and read only
 * on the server: the rules block is deny-all, admins included. It holds no
 * answer and names nobody but the admin who last changed it.
 *
 * Pure, with no imports: `items` is survey items as stored, read by survey
 * code (`sanitizeSurveyItems`), never here.
 */

export const SURVEY_QUESTION_SETS_COLLECTION = "surveyQuestionSets";

/** The kinds of question set, each a document id and the last part of its page's address. */
export type QuestionSetKind = "event" | "check-in" | "session-report" | "before" | "after" | "leaving";

/** Every kind, in the order Run NAISI › Surveys lists them. */
export const QUESTION_SET_KINDS: readonly QuestionSetKind[] = ["event", "check-in", "session-report", "before", "after", "leaving"];

export function isQuestionSetKind(value: unknown): value is QuestionSetKind {
  return typeof value === "string" && (QUESTION_SET_KINDS as readonly string[]).includes(value);
}

export type SurveyQuestionSetDoc = {
  kind: QuestionSetKind;
  /** A words-only set's changed words, by their place in the set; empty for the survey after an event. */
  words: Record<string, string>;
  /** The survey after an event's questions as stored; null for every other kind. */
  items: unknown[] | null;
  updatedAt: Date | null;
  /** The admin who last changed it. */
  updatedByUid: string | null;
};

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/**
 * A set as stored, read strictly: only string words, only for a words-only
 * kind, and items only for the survey after an event.
 */
export function normalizeQuestionSet(kind: QuestionSetKind, data: Raw): SurveyQuestionSetDoc {
  const words: Record<string, string> = {};
  if (kind !== "event" && data.words && typeof data.words === "object" && !Array.isArray(data.words)) {
    for (const [key, text] of Object.entries(data.words as Raw)) {
      if (typeof text === "string") words[key] = text;
    }
  }
  return {
    kind,
    words,
    items: kind === "event" && Array.isArray(data.items) ? [...data.items] : null,
    updatedAt: tsToDate(data.updatedAt),
    updatedByUid: typeof data.updatedByUid === "string" && data.updatedByUid ? data.updatedByUid : null,
  };
}
