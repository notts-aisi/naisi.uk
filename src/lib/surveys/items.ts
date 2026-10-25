import { own } from "@/lib/applications/keys";
import {
  answerIsEmpty,
  newItemId,
  sanitizeItems,
  validateAnswer,
  validateWorksheetItems,
  WORKSHEET_LIMITS,
  type WorksheetAnswer,
  type WorksheetItem,
  type WorksheetOption,
  type WorksheetQuestion,
  type WorksheetQuestionType,
} from "@/lib/firestore/worksheets";

/**
 * A SURVEY'S QUESTIONS: Worksheets' item model, and the one question a survey
 * needs that Worksheets lacks.
 *
 * A survey reuses the worksheet item shapes as they are (sections, page
 * breaks, the choice and text questions, a rating) with their sanitiser and
 * their validation, imported from `@/lib/firestore/worksheets`. Nothing here
 * changes Worksheets: the one addition, "1 to 5 for each line" (a numbered
 * question with several lines, each answered on the same scale), is defined
 * in this file and handled before the worksheet code is asked about the rest.
 *
 * Rules a maintainer keeps:
 *
 *  - NO QUESTION IS REQUIRED. Every question in a survey can be skipped, so a
 *    stored `required: true` is a problem the validator names, and the
 *    template writes none.
 *  - OPTION AND LINE IDS ARE STABLE. Answers store ids, never labels, so
 *    rewording an option or a line keeps every answer given to it. The
 *    template's ids are fixed strings: every programme's before survey asks
 *    the same change questions under the same ids, and the after survey copies
 *    them, so answers pair by person and compare across programmes.
 *  - THE SHAPE OF THE CHANGE QUESTIONS IS FIXED once a survey exists: an edit
 *    may reword, add or remove options and lines and change the order, but
 *    the questions themselves and their types stay (`sameQuestions`).
 *
 * Pure: no server import, so the answer page, the editor and the routes all
 * ask the same functions of the same shapes.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One line of a "1 to 5 for each line" question. */
export type SurveyLine = { id: string; label: string };

/**
 * "1 to 5 for each line": one numbered question with several lines, each
 * answered on one scale with words at both ends ("Not at all" to "Very").
 */
export type SurveyLinesQuestion = {
  kind: "question";
  id: string;
  type: "lines";
  title: string;
  lines: SurveyLine[];
  scale: { max: number; minLabel: string; maxLabel: string };
};

/**
 * A worksheet question as a survey asks it. `look: "agree"` marks a single
 * choice drawn from "Strongly disagree" to "Strongly agree", so the editor
 * can name its type as the board does ("Agree or disagree"). It changes
 * nothing about how it is answered or stored.
 */
export type SurveyChoiceQuestion = WorksheetQuestion & { look?: "agree" };

export type SurveyQuestion = SurveyChoiceQuestion | SurveyLinesQuestion;

export type SurveyItem = Exclude<WorksheetItem, WorksheetQuestion> | SurveyQuestion;

/** The answer to a lines question: line id to the number chosen on the scale. */
export type SurveyLinesAnswer = { type: "lines"; values: Record<string, number> };

export type SurveyAnswer = WorksheetAnswer | SurveyLinesAnswer;

/**
 * The worksheet question types a survey may ask. A poll shows people each
 * other's answers and an image upload stores files, so neither is a survey
 * question.
 */
export const SURVEY_WORKSHEET_TYPES: readonly WorksheetQuestionType[] = [
  "singleChoice",
  "multipleChoice",
  "rating",
  "shortText",
  "longText",
];

export const SURVEY_ITEM_LIMITS = {
  minLines: 1,
  maxLines: 10,
  lineLabel: 120,
  scaleLabel: 40,
} as const;

/** The scale every lines question in the template uses. */
export const LINES_SCALE = { max: 5, minLabel: "Not at all", maxLabel: "Very" } as const;

// ---------------------------------------------------------------------------
// Reading what is stored
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isLinesShape(raw: Raw): boolean {
  return raw.kind === "question" && raw.type === "lines" && typeof raw.id === "string" && raw.id.length > 0;
}

function readLines(raw: Raw): SurveyLinesQuestion {
  const lines: SurveyLine[] = [];
  for (const entry of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!isRaw(entry) || typeof entry.id !== "string" || entry.id.length === 0) continue;
    lines.push({ id: entry.id, label: str(entry.label) });
  }
  const scale = isRaw(raw.scale) ? raw.scale : {};
  const max = typeof scale.max === "number" && Number.isFinite(scale.max) ? scale.max : LINES_SCALE.max;
  return {
    kind: "question",
    id: raw.id as string,
    type: "lines",
    title: str(raw.title),
    lines,
    scale: {
      max,
      minLabel: typeof scale.minLabel === "string" ? scale.minLabel : LINES_SCALE.minLabel,
      maxLabel: typeof scale.maxLabel === "string" ? scale.maxLabel : LINES_SCALE.maxLabel,
    },
  };
}

/**
 * Every item a stored survey holds, in order. A worksheet item goes through
 * Worksheets' own sanitiser (`clampLimits` as it takes it); a lines question
 * is read here. An item that is neither is dropped, as Worksheets drops one.
 */
export function sanitizeSurveyItems(raw: unknown, options: { clampLimits?: boolean } = {}): SurveyItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SurveyItem[] = [];
  for (const entry of raw) {
    if (!isRaw(entry)) continue;
    if (isLinesShape(entry)) {
      out.push(readLines(entry));
      continue;
    }
    const [item] = sanitizeItems([entry], options);
    if (!item) continue;
    if (item.kind === "question" && item.type === "singleChoice" && entry.look === "agree") {
      out.push({ ...item, look: "agree" });
    } else {
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Questions and pages
// ---------------------------------------------------------------------------

export function isLinesQuestion(item: SurveyItem): item is SurveyLinesQuestion {
  return item.kind === "question" && item.type === "lines";
}

/** The questions, in order. Their place in this list, from 1, is the number a person sees. */
export function surveyQuestionsOf(items: readonly SurveyItem[]): SurveyQuestion[] {
  return items.filter((item): item is SurveyQuestion => item.kind === "question");
}

/** Each question's number, as the answer page and the editor show it. */
export function questionNumbers(items: readonly SurveyItem[]): Map<string, number> {
  return new Map(surveyQuestionsOf(items).map((question, index) => [question.id, index + 1]));
}

/**
 * The items split into pages at each page break. A break is a separator, so a
 * break first, last or twice in a row makes no empty page: the same rule as
 * Worksheets' `pagesOf`, for the survey's own item union.
 */
export function surveyPagesOf(items: readonly SurveyItem[]): SurveyItem[][] {
  const pages: SurveyItem[][] = [];
  let current: SurveyItem[] = [];
  for (const item of items) {
    if (item.kind === "pageBreak") {
      if (current.length > 0) pages.push(current);
      current = [];
      continue;
    }
    current.push(item);
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type SurveyItemProblem = { itemId: string; message: string };

function linesProblems(question: SurveyLinesQuestion): SurveyItemProblem[] {
  const problems: SurveyItemProblem[] = [];
  const say = (message: string) => problems.push({ itemId: question.id, message });
  if (question.title.trim().length === 0) say("This question needs its words.");
  else if (question.title.length > WORKSHEET_LIMITS.questionTitle) {
    say(`This question’s words are over the ${WORKSHEET_LIMITS.questionTitle}-character limit.`);
  }
  if (question.lines.length < SURVEY_ITEM_LIMITS.minLines) say("This question needs at least one line.");
  if (question.lines.length > SURVEY_ITEM_LIMITS.maxLines) {
    say(`This question has ${question.lines.length} lines. The limit is ${SURVEY_ITEM_LIMITS.maxLines}.`);
  }
  const seen = new Set<string>();
  for (const line of question.lines) {
    if (seen.has(line.id)) {
      say("Two lines share an id. Take one out and add it again.");
      break;
    }
    seen.add(line.id);
  }
  if (question.lines.some((line) => line.label.trim().length === 0)) say("Every line needs its words.");
  if (question.lines.some((line) => line.label.length > SURVEY_ITEM_LIMITS.lineLabel)) {
    say(`A line is over the ${SURVEY_ITEM_LIMITS.lineLabel}-character limit.`);
  }
  const { max, minLabel, maxLabel } = question.scale;
  if (!Number.isInteger(max) || max < WORKSHEET_LIMITS.ratingScaleMin || max > WORKSHEET_LIMITS.ratingScaleMax) {
    say(`The scale runs 1 to ${max}. It must top out between ${WORKSHEET_LIMITS.ratingScaleMin} and ${WORKSHEET_LIMITS.ratingScaleMax}.`);
  }
  if (minLabel.length > SURVEY_ITEM_LIMITS.scaleLabel || maxLabel.length > SURVEY_ITEM_LIMITS.scaleLabel) {
    say(`The words at the ends of the scale are over the ${SURVEY_ITEM_LIMITS.scaleLabel}-character limit.`);
  }
  return problems;
}

/**
 * Everything wrong with a survey's items, naming the item at fault. Call it on
 * `sanitizeSurveyItems(raw, { clampLimits: false })`, as Worksheets' saving
 * route does, so a number out of range is reported rather than quietly moved.
 */
export function validateSurveyItems(items: readonly SurveyItem[]): SurveyItemProblem[] {
  const worksheetItems = items.filter((item): item is WorksheetItem => !(item.kind === "question" && item.type === "lines"));
  const problems: SurveyItemProblem[] = validateWorksheetItems(worksheetItems).map((problem) => ({
    itemId: problem.itemId,
    message: problem.message,
  }));
  for (const item of items) {
    if (item.kind !== "question") continue;
    if (isLinesQuestion(item)) {
      problems.push(...linesProblems(item));
      continue;
    }
    if (!SURVEY_WORKSHEET_TYPES.includes(item.type)) {
      problems.push({ itemId: item.id, message: "A survey can’t ask this kind of question." });
    }
    if (item.required) {
      problems.push({ itemId: item.id, message: "Every question in a survey can be skipped, so none is required." });
    }
  }
  if (surveyQuestionsOf(items).length === 0) {
    problems.push({ itemId: items[0]?.id ?? "", message: "A survey needs at least one question." });
  }
  return problems;
}

/**
 * Whether two lists of items ask the same questions, of the same types, in any
 * order. The editor rewords, reorders and changes options and lines; it never
 * adds, removes or retypes a question, and the saving route holds it to that.
 */
export function sameQuestions(before: readonly SurveyItem[], after: readonly SurveyItem[]): boolean {
  const shape = (items: readonly SurveyItem[]) =>
    surveyQuestionsOf(items)
      .map((question) => `${question.id}:${question.type}`)
      .sort()
      .join("|");
  return shape(before) === shape(after);
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type SurveyAnswerProblem = { questionId: string; message: string };

function readLinesAnswer(question: SurveyLinesQuestion, raw: Raw): { answer: SurveyLinesAnswer | null; problem: string | null } {
  const values = isRaw(raw.values) ? raw.values : null;
  if (raw.type !== "lines" || !values) return { answer: null, problem: "That answer is not in a shape this question understands." };
  const out: Record<string, number> = {};
  for (const [lineId, value] of Object.entries(values)) {
    if (!question.lines.some((line) => line.id === lineId)) return { answer: null, problem: "One of those lines is no longer on this question." };
    if (value === null || value === 0) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > question.scale.max) {
      return { answer: null, problem: `Each line takes a number from 1 to ${question.scale.max}.` };
    }
    out[lineId] = value;
  }
  return { answer: Object.keys(out).length > 0 ? { type: "lines", values: out } : null, problem: null };
}

/**
 * A person's answers, read from a request: only the survey's own questions,
 * each checked against its question, and nothing for one left blank. Every
 * question can be skipped, so an empty answer is no problem: it is simply not
 * kept.
 */
export function readSurveyAnswers(
  items: readonly SurveyItem[],
  raw: unknown,
): { answers: Record<string, SurveyAnswer>; problems: SurveyAnswerProblem[] } {
  const answers: Record<string, SurveyAnswer> = {};
  const problems: SurveyAnswerProblem[] = [];
  if (!isRaw(raw)) {
    return { answers, problems: [{ questionId: "", message: "Your answers did not arrive in a shape the survey understands." }] };
  }
  const questions = surveyQuestionsOf(items);
  for (const key of Object.keys(raw)) {
    if (!questions.some((question) => question.id === key)) {
      problems.push({ questionId: key, message: "One of those answers is to a question this survey doesn’t ask." });
    }
  }
  for (const question of questions) {
    const value = own(raw, question.id);
    if (value === undefined || value === null) continue;
    if (!isRaw(value)) {
      problems.push({ questionId: question.id, message: "That answer is not in a shape this question understands." });
      continue;
    }
    if (isLinesQuestion(question)) {
      const read = readLinesAnswer(question, value);
      if (read.problem) problems.push({ questionId: question.id, message: read.problem });
      else if (read.answer) answers[question.id] = read.answer;
      continue;
    }
    const answer = value as WorksheetAnswer;
    const message = validateAnswer(question, answer);
    if (message) {
      problems.push({ questionId: question.id, message });
      continue;
    }
    if (!answerIsEmpty(answer)) answers[question.id] = cleanWorksheetAnswer(answer);
  }
  return { answers, problems };
}

/** Only the fields an answer of its type carries, so nothing else a request sent is kept. */
function cleanWorksheetAnswer(answer: WorksheetAnswer): WorksheetAnswer {
  switch (answer.type) {
    case "text":
      return { type: "text", text: answer.text };
    case "choice":
      return { type: "choice", optionId: answer.optionId };
    case "choices":
      return { type: "choices", optionIds: [...answer.optionIds] };
    case "rating":
      return { type: "rating", value: answer.value };
    case "images":
      return { type: "images", images: answer.images.map((image) => ({ url: image.url, storagePath: image.storagePath })) };
  }
}

/** Stored answers, read back for a survey's own questions only. */
export function storedSurveyAnswers(items: readonly SurveyItem[], raw: unknown): Record<string, SurveyAnswer> {
  return readSurveyAnswers(items, isRaw(raw) ? filterKnown(items, raw) : {}).answers;
}

function filterKnown(items: readonly SurveyItem[], raw: Raw): Raw {
  const out: Raw = {};
  for (const question of surveyQuestionsOf(items)) {
    const value = own(raw, question.id);
    if (value !== undefined) out[question.id] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The template: the before survey's six change questions, as drawn
// ---------------------------------------------------------------------------

/** The sections of the template, each the measure it asks about (sv-edit). */
export const TEMPLATE_SECTIONS = {
  beliefs: "s_beliefs",
  explain: "s_explain",
  plans: "s_plans",
} as const;

/** The six change questions' ids, the same in every programme's before and after survey. */
export const CHANGE_QUESTION_IDS = [
  "q_catastrophe",
  "q_when",
  "q_important",
  "q_explain",
  "q_where",
  "q_next12",
] as const;

const option = (id: string, label: string): WorksheetOption => ({ id, label });

function choice(id: string, title: string, options: WorksheetOption[], type: "singleChoice" | "multipleChoice" = "singleChoice"): SurveyChoiceQuestion {
  return { kind: "question", id, type, title, body: [], required: false, options };
}

/** How many lines the template's question 4 has: one per week from 2 to 6. */
export const TEMPLATE_LINE_COUNT = 5;

/**
 * The before survey's items: six questions on three pages, worded as the
 * board draws them. `lines` are the five things question 4 asks about,
 * typed per programme when the survey is made.
 */
export function beforeSurveyItems(lines: readonly string[]): SurveyItem[] {
  return [
    { kind: "section", id: TEMPLATE_SECTIONS.beliefs, heading: "What you think about AI", body: [] },
    choice("q_catastrophe", "How likely is it that advanced AI causes a catastrophe for humanity this century?", [
      option("o_under1", "Under 1%"),
      option("o_1to10", "1 to 10%"),
      option("o_10to25", "10 to 25%"),
      option("o_25to50", "25 to 50%"),
      option("o_over50", "Over 50%"),
      option("o_notsure", "Not sure"),
    ]),
    choice("q_when", "When do you think AI will be able to do most work done at a computer as well as a skilled person?", [
      option("o_before2030", "Before 2030"),
      option("o_2030to2035", "2030 to 2035"),
      option("o_2036to2045", "2036 to 2045"),
      option("o_after2045", "After 2045"),
      option("o_never", "Never"),
      option("o_notsure", "Not sure"),
    ]),
    {
      ...choice("q_important", "Making AI go well is one of the most important problems of our time.", [
        option("o_sdisagree", "Strongly disagree"),
        option("o_disagree", "Disagree"),
        option("o_neither", "Neither"),
        option("o_agree", "Agree"),
        option("o_sagree", "Strongly agree"),
      ]),
      look: "agree",
    },
    { kind: "pageBreak", id: "pb_1" },
    { kind: "section", id: TEMPLATE_SECTIONS.explain, heading: "What you could explain", body: [] },
    {
      kind: "question",
      id: "q_explain",
      type: "lines",
      title: "How confident would you be explaining these to a friend?",
      lines: lines.map((label, index) => ({ id: `l${index + 1}`, label })),
      scale: { ...LINES_SCALE },
    },
    { kind: "pageBreak", id: "pb_2" },
    { kind: "section", id: TEMPLATE_SECTIONS.plans, heading: "Your plans", body: [] },
    choice("q_where", "Which is closest to where you are with working on making AI go well?", [
      option("o_notconsidering", "It’s not something I’m considering"),
      option("o_curious", "Curious, not sure yet"),
      option("o_considering", "Considering it seriously"),
      option("o_planning", "Planning to: applying or preparing"),
      option("o_doing", "Already doing it: a job, research or study"),
    ]),
    choice(
      "q_next12",
      "In the next 12 months, which of these might you do?",
      [
        option("o_apply", "Apply to a research programme or incubator"),
        option("o_project", "Do a research project on AI safety"),
        option("o_job", "Apply for a job or internship in AI safety or policy"),
        option("o_modules", "Choose modules or a dissertation on it"),
        option("o_course", "Take another AI safety course"),
        option("o_none", "None of these yet"),
      ],
      "multipleChoice",
    ),
  ];
}

/** A new option or line id, in the shape Worksheets mints one. */
export function newSurveyId(prefix: "o" | "l"): string {
  return newItemId(prefix);
}
