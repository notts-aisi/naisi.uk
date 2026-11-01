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
  type WorksheetQuestion,
  type WorksheetQuestionType,
} from "@/lib/firestore/worksheets";

/**
 * A SURVEY'S QUESTIONS: Worksheets' item model, and the questions a survey
 * needs that Worksheets lacks.
 *
 * A survey reuses the worksheet item shapes as they are (sections, page
 * breaks, the choice and text questions, a rating) with their sanitiser and
 * their validation, imported from `@/lib/firestore/worksheets`. Nothing here
 * changes Worksheets. What a survey adds is defined in this file and handled
 * before the worksheet code is asked about the rest:
 *
 *  - "1 to 5 for each line" (`lines`): several lines, each on one scale. An
 *    agreement grid gives every point its words; a grid of a programme's
 *    parts gives words at its ends.
 *  - a 0 to 100% answer (`percent`), a whole number (`number`), and a scale
 *    with words at chosen points (`scale`, 1 to 7 or 0 to 10);
 *  - on a worksheet choice question, survey-only settings: every option a
 *    described point with its number (`look: "points"`), a number each option
 *    stands for (`scores`), drawn as a menu (`look: "menu"`) and offered from
 *    the person's profile (`profile`), pick up to some number (`maxPicks`),
 *    then "which mattered most" among those ticked (`most`);
 *  - on any question: a line under it (`hint`), the question it looks back
 *    on (`lookBackOf`), and the person's own earlier answer shown above it
 *    (`pipe`);
 *  - a consent block (`kind: "consent"`): a statement shown as text and boxes
 *    a person ticks, unticked until they tick them. It is not a question: what
 *    is ticked is kept on the person's row, where they can change it later,
 *    never among the answers;
 *  - the box under a long answer, "You can quote this, without my name"
 *    (`isQuotable`): unticked until the person ticks it, and kept with the
 *    answer it is under (`quote: true` on its text answer), because it is
 *    about those words and nothing else.
 *
 * Rules a maintainer keeps:
 *
 *  - EVERY QUESTION IS REQUIRED unless it is marked optional (Zach, 30 Oct
 *    2026): `isQuestionRequired` is the one rule, `missingRequired` the one
 *    check of what was left blank, asked by the answer form, the answer
 *    routes and the resend of blank questions alike. A question's own
 *    `optional` wins; with none, only the template questions that do not
 *    apply to everybody (`NOT_FOR_EVERYBODY`) are optional. Worksheets'
 *    `required` field is not read: surveys stored before this rule carry
 *    `required: false` on every choice and text question, and it means
 *    nothing. A consent block is no question, so it is never required, and
 *    a box in it starts unticked: consent is freely given.
 *  - OPTION AND LINE IDS ARE STABLE. Answers store ids, never labels, so
 *    rewording an option or a line keeps every answer given to it. The
 *    templates' ids are fixed strings, the same in every programme and at
 *    every stage, so answers pair by person and compare across programmes.
 *  - THE SHAPE OF THE QUESTIONS IS FIXED once a survey exists: an edit may
 *    reword, add or remove options and lines and change the order, but the
 *    questions themselves and their types stay (`sameQuestions`). An option
 *    that stands for a number is reworded, never added or taken out.
 *
 * Pure: no server import, so the answer page, the editor and the routes all
 * ask the same functions of the same shapes.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Settings any survey question may carry. */
export type SurveyQuestionExtras = {
  /** A line under the question's words. */
  hint?: string;
  /**
   * The question this one asks about again, looking back: "Looking back, which
   * best described you before the programme?" looks back on "Which best
   * describes you right now?". Results set the two side by side.
   */
  lookBackOf?: string;
  /**
   * The person's own answer to a text question of an earlier survey of the
   * same programme, shown above this one ("At the start you said: ...").
   */
  pipe?: SurveyPipe;
  /**
   * The editor's Required switch, turned off (`true`) or on (`false`). Absent
   * on a survey stored before the switch existed: `isQuestionRequired` then
   * decides by the question's id.
   */
  optional?: boolean;
};

/** Where a piped answer comes from, and the words before it. */
export type SurveyPipe = { from: string; words: string };

/** One line of a "1 to 5 for each line" question. */
export type SurveyLine = { id: string; label: string };

/**
 * "1 to 5 for each line": one numbered question with several lines, each
 * answered on one scale. `points`, when present, gives every point its words
 * (an agreement grid); otherwise there are words at the two ends.
 */
export type SurveyLinesQuestion = SurveyQuestionExtras & {
  kind: "question";
  id: string;
  type: "lines";
  title: string;
  lines: SurveyLine[];
  scale: { max: number; minLabel: string; maxLabel: string; points?: string[] };
};

/** A share from 0 to 100%, typed or slid. */
export type SurveyPercentQuestion = SurveyQuestionExtras & {
  kind: "question";
  id: string;
  type: "percent";
  title: string;
  /** Words at 0% and at 100%, or "" for none. */
  ends: { min: string; max: string };
};

/** A whole number from 0. */
export type SurveyNumberQuestion = SurveyQuestionExtras & {
  kind: "question";
  id: string;
  type: "number";
  title: string;
  max: number;
};

/** Words at one point of a scale. */
export type SurveyAnchor = { at: number; label: string };

/** A scale from `min` (0 or 1) to `max`, with words at some of its points. */
export type SurveyScaleQuestion = SurveyQuestionExtras & {
  kind: "question";
  id: string;
  type: "scale";
  title: string;
  min: number;
  max: number;
  anchors: SurveyAnchor[];
};

/** What a box in a consent block is for. Each purpose is kept on the person's row. */
export type SurveyConsentPurpose = "followUps";

export const CONSENT_PURPOSES: readonly SurveyConsentPurpose[] = ["followUps"];

export type SurveyConsentBox = { purpose: SurveyConsentPurpose; label: string };

/**
 * A consent block: a statement shown as text, then boxes a person ticks, each
 * unticked until it is ticked. Not a question, so not numbered and never among
 * the answers.
 */
export type SurveyConsentItem = {
  kind: "consent";
  id: string;
  statement: string;
  boxes: SurveyConsentBox[];
};

/** A profile value a menu question can be offered from. */
export type SurveyProfileField = "level" | "subject";

/**
 * A worksheet question as a survey asks it, with the survey-only settings a
 * choice question may carry. None of them changes how a single choice is
 * answered or stored but `maxPicks` and `most`, which belong to pick any.
 */
export type SurveyChoiceQuestion = WorksheetQuestion &
  SurveyQuestionExtras & {
    /**
     * "agree": drawn from "Strongly disagree" to "Strongly agree", so the editor
     * can name it as the board does. "points": every option is a described
     * point, shown with its number (`scores`). "menu": drawn as a menu.
     */
    look?: "agree" | "points" | "menu";
    /** The number each option stands for, by option id: a stage, or a share of working time. */
    scores?: Record<string, number>;
    /** What those numbers are counted in, as the results total them ("FTE"), or absent. */
    scoreUnit?: string;
    /** Pick any: at most this many. */
    maxPicks?: number;
    /** Pick any: the options that mean none of the others. */
    noneIds?: string[];
    /** Pick any, then this question's second part: one of those ticked. */
    most?: string;
    /** A menu offered from this profile value, when the profile holds it. */
    profile?: SurveyProfileField;
  };

export type SurveyQuestion =
  | SurveyChoiceQuestion
  | SurveyLinesQuestion
  | SurveyPercentQuestion
  | SurveyNumberQuestion
  | SurveyScaleQuestion;

export type SurveyItem = Exclude<WorksheetItem, WorksheetQuestion> | SurveyQuestion | SurveyConsentItem;

/** The answer to a lines question: line id to the number chosen on the scale. */
export type SurveyLinesAnswer = { type: "lines"; values: Record<string, number> };

/** Pick any, with the one that mattered most when the question asks for it. */
export type SurveyChoicesAnswer = { type: "choices"; optionIds: string[]; most?: string };

/** A percentage, a whole number or a point on a scale. */
export type SurveyValueAnswer = { type: "percent" | "number" | "scale"; value: number };

/**
 * A short or long answer in words. Under a long answer the person may tick
 * "You can quote this, without my name" (`isQuotable`), and the tick is kept
 * with the answer it is under, as `quote: true`, and nowhere else. An answer
 * left unticked carries no `quote` at all. Nothing but this tick ever makes a
 * comment one that may be quoted.
 */
export type SurveyTextAnswer = { type: "text"; text: string; quote?: true };

export type SurveyAnswer =
  | Exclude<WorksheetAnswer, { type: "choices" | "text" }>
  | SurveyTextAnswer
  | SurveyChoicesAnswer
  | SurveyLinesAnswer
  | SurveyValueAnswer;

/** What a person ticked in a survey's consent blocks, by purpose. */
export type SurveyConsents = Partial<Record<SurveyConsentPurpose, boolean>>;

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

/** The question types a survey defines for itself. */
export type SurveyOwnType = "lines" | "percent" | "number" | "scale";

const OWN_TYPES: readonly string[] = ["lines", "percent", "number", "scale"];

export const SURVEY_ITEM_LIMITS = {
  minLines: 1,
  maxLines: 10,
  lineLabel: 120,
  scaleLabel: 40,
  hint: 300,
  anchorLabel: 80,
  /** A scale's points: 0 or 1 at the bottom, up to 10 at the top. */
  scaleTop: 10,
  minScalePoints: 3,
  /** The largest whole number a number question takes. */
  maxNumber: 10000,
  statement: 400,
  boxLabel: 200,
  maxBoxes: 3,
  pipeWords: 120,
  /** Every item a survey holds, and every question, as Worksheets caps a worksheet. */
  maxItems: WORKSHEET_LIMITS.maxItems,
  maxQuestions: WORKSHEET_LIMITS.maxQuestions,
} as const;

/** The scale every lines question uses unless it says otherwise. */
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

function int(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The settings any question carries, read from what is stored. Nothing is written as undefined. */
function readExtras(raw: Raw): SurveyQuestionExtras {
  const out: SurveyQuestionExtras = {};
  if (typeof raw.hint === "string" && raw.hint.trim()) out.hint = raw.hint;
  if (typeof raw.lookBackOf === "string" && raw.lookBackOf) out.lookBackOf = raw.lookBackOf;
  if (isRaw(raw.pipe) && typeof raw.pipe.from === "string" && raw.pipe.from) {
    out.pipe = { from: raw.pipe.from, words: str(raw.pipe.words) };
  }
  if (typeof raw.optional === "boolean") out.optional = raw.optional;
  return out;
}

function hasId(raw: Raw): boolean {
  return typeof raw.id === "string" && raw.id.length > 0;
}

function readLines(raw: Raw): SurveyLinesQuestion {
  const lines: SurveyLine[] = [];
  for (const entry of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!isRaw(entry) || typeof entry.id !== "string" || entry.id.length === 0) continue;
    lines.push({ id: entry.id, label: str(entry.label) });
  }
  const scale = isRaw(raw.scale) ? raw.scale : {};
  const max = int(scale.max, LINES_SCALE.max);
  const out: SurveyLinesQuestion = {
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
    ...readExtras(raw),
  };
  if (Array.isArray(scale.points) && scale.points.every((point) => typeof point === "string")) {
    out.scale.points = [...(scale.points as string[])];
  }
  return out;
}

function readPercent(raw: Raw): SurveyPercentQuestion {
  const ends = isRaw(raw.ends) ? raw.ends : {};
  return {
    kind: "question",
    id: raw.id as string,
    type: "percent",
    title: str(raw.title),
    ends: { min: str(ends.min), max: str(ends.max) },
    ...readExtras(raw),
  };
}

function readNumber(raw: Raw): SurveyNumberQuestion {
  return {
    kind: "question",
    id: raw.id as string,
    type: "number",
    title: str(raw.title),
    max: int(raw.max, 100),
    ...readExtras(raw),
  };
}

function readScale(raw: Raw): SurveyScaleQuestion {
  const anchors: SurveyAnchor[] = [];
  for (const entry of Array.isArray(raw.anchors) ? raw.anchors : []) {
    if (!isRaw(entry) || typeof entry.at !== "number") continue;
    anchors.push({ at: entry.at, label: str(entry.label) });
  }
  return {
    kind: "question",
    id: raw.id as string,
    type: "scale",
    title: str(raw.title),
    min: int(raw.min, 1),
    max: int(raw.max, 5),
    anchors,
    ...readExtras(raw),
  };
}

function readConsent(raw: Raw): SurveyConsentItem {
  const boxes: SurveyConsentBox[] = [];
  for (const entry of Array.isArray(raw.boxes) ? raw.boxes : []) {
    if (!isRaw(entry) || !CONSENT_PURPOSES.includes(entry.purpose as SurveyConsentPurpose)) continue;
    boxes.push({ purpose: entry.purpose as SurveyConsentPurpose, label: str(entry.label) });
  }
  return { kind: "consent", id: raw.id as string, statement: str(raw.statement), boxes };
}

/** The survey-only settings of a choice question, read from what is stored. */
function readChoiceExtras(raw: Raw, question: WorksheetQuestion): Partial<SurveyChoiceQuestion> {
  const out: Partial<SurveyChoiceQuestion> = readExtras(raw);
  const ids = new Set((question.options ?? []).map((option) => option.id));
  const single = question.type === "singleChoice";
  const multiple = question.type === "multipleChoice";
  if (single && (raw.look === "agree" || raw.look === "points" || raw.look === "menu")) out.look = raw.look;
  if (single && isRaw(raw.scores)) {
    const scores: Record<string, number> = {};
    for (const [id, value] of Object.entries(raw.scores)) {
      if (ids.has(id) && typeof value === "number" && Number.isFinite(value)) scores[id] = value;
    }
    if (Object.keys(scores).length > 0) out.scores = scores;
    if (typeof raw.scoreUnit === "string" && raw.scoreUnit.trim()) out.scoreUnit = raw.scoreUnit;
  }
  if (single && (raw.profile === "level" || raw.profile === "subject")) out.profile = raw.profile;
  if (multiple) {
    if (typeof raw.maxPicks === "number" && Number.isFinite(raw.maxPicks)) out.maxPicks = raw.maxPicks;
    if (Array.isArray(raw.noneIds)) {
      const none = raw.noneIds.filter((id): id is string => typeof id === "string" && ids.has(id));
      if (none.length > 0) out.noneIds = none;
    }
    if (typeof raw.most === "string" && raw.most.trim()) out.most = raw.most;
  }
  return out;
}

/**
 * Every item a stored survey holds, in order. A worksheet item goes through
 * Worksheets' own sanitiser (`clampLimits` as it takes it) and gets its
 * survey-only settings back; a survey's own question or a consent block is
 * read here. An item that is none of these is dropped, as Worksheets drops one.
 */
export function sanitizeSurveyItems(raw: unknown, options: { clampLimits?: boolean } = {}): SurveyItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SurveyItem[] = [];
  for (const entry of raw) {
    if (!isRaw(entry) || !hasId(entry)) continue;
    if (entry.kind === "consent") {
      out.push(readConsent(entry));
      continue;
    }
    if (entry.kind === "question" && typeof entry.type === "string" && OWN_TYPES.includes(entry.type)) {
      if (entry.type === "lines") out.push(readLines(entry));
      else if (entry.type === "percent") out.push(readPercent(entry));
      else if (entry.type === "number") out.push(readNumber(entry));
      else out.push(readScale(entry));
      continue;
    }
    const [item] = sanitizeItems([entry], options);
    if (!item) continue;
    if (item.kind === "question") {
      out.push({ ...item, ...readChoiceExtras(entry, item) });
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

export function isPercentQuestion(item: SurveyItem): item is SurveyPercentQuestion {
  return item.kind === "question" && item.type === "percent";
}

export function isNumberQuestion(item: SurveyItem): item is SurveyNumberQuestion {
  return item.kind === "question" && item.type === "number";
}

export function isScaleQuestion(item: SurveyItem): item is SurveyScaleQuestion {
  return item.kind === "question" && item.type === "scale";
}

/** A survey's own question type, rather than one of Worksheets'. */
export function isOwnQuestion(
  item: SurveyItem,
): item is SurveyLinesQuestion | SurveyPercentQuestion | SurveyNumberQuestion | SurveyScaleQuestion {
  return item.kind === "question" && OWN_TYPES.includes(item.type);
}

/** A worksheet question as the survey asks it: a choice, a rating or a text. */
export function isChoiceOrTextQuestion(item: SurveyItem): item is SurveyChoiceQuestion {
  return item.kind === "question" && !OWN_TYPES.includes(item.type);
}

export function isConsentItem(item: SurveyItem): item is SurveyConsentItem {
  return item.kind === "consent";
}

/**
 * Whether a question's answer carries the box "You can quote this, without
 * my name": a long answer does, on a survey that asks for the tick
 * (`asksQuotes` in `@/lib/firestore/surveys`). A short answer never does.
 */
export function isQuotable(question: SurveyQuestion): boolean {
  return question.type === "longText";
}

/** The questions, in order. Their place in this list, from 1, is the number a person sees. */
export function surveyQuestionsOf(items: readonly SurveyItem[]): SurveyQuestion[] {
  return items.filter((item): item is SurveyQuestion => item.kind === "question");
}

/** The consent blocks, in order. */
export function consentItemsOf(items: readonly SurveyItem[]): SurveyConsentItem[] {
  return items.filter(isConsentItem);
}

/** The purposes a survey's consent blocks ask about. */
export function consentPurposesOf(items: readonly SurveyItem[]): SurveyConsentPurpose[] {
  const out: SurveyConsentPurpose[] = [];
  for (const item of consentItemsOf(items)) {
    for (const box of item.boxes) if (!out.includes(box.purpose)) out.push(box.purpose);
  }
  return out;
}

/** Each question's number, as the answer page and the editor show it. */
export function questionNumbers(items: readonly SurveyItem[]): Map<string, number> {
  return new Map(surveyQuestionsOf(items).map((question, index) => [question.id, index + 1]));
}

// ---------------------------------------------------------------------------
// Required questions
// ---------------------------------------------------------------------------

/**
 * THE TEMPLATE QUESTIONS THAT DO NOT APPLY TO EVERYBODY, by id, each with why.
 * The site cannot show a question only to some people, so a question here is
 * optional unless an admin switches it on. Everything else is required: every
 * choice, scale, number, percentage and grid, and every text question that
 * anybody can answer ("What do you most want to get out of this programme?",
 * "Did the programme have any negative effect on you or your plans?", "What
 * would have helped you stay?").
 *
 * Surveys stored before the Required switch existed carry no `optional`, so
 * this list decides for them, the moment the code is live; a survey made from
 * a template since writes `optional: true` on these (`markNotForEverybody`).
 * An id here is a template's fixed id, the same in every programme.
 */
export const NOT_FOR_EVERYBODY: Readonly<Record<string, string>> = {
  q_i4_links: "Links to what your team produced: a team with nothing finished, or nothing public, has none.",
  q_i4_when: "If nothing is finished yet, when do you expect it to be?: only for a team with nothing finished.",
  q_f1_where: "The organisation or course: somebody doing independent work has none.",
  q_f3: "What is that work?: only for somebody whose working time goes on AI safety.",
  q_f4_applied: "Since the programme, which programmes or jobs have you applied to?: not everybody has applied.",
  q_f4_accepted: "Which of those accepted you?: only for somebody who applied and was accepted.",
  q_f7: "Anything else that happened partly because of NAISI?: a catch-all.",
  q_ev_change: "Anything we should change?: a catch-all, after an event.",
  q_ci_better: "What could have gone better?: a catch-all, at the end of a session.",
};

/** The ids `NOT_FOR_EVERYBODY` names. */
export const NOT_FOR_EVERYBODY_IDS: readonly string[] = Object.keys(NOT_FOR_EVERYBODY);

/**
 * Whether a question must be answered before a survey can be sent. The
 * question's own `optional` wins (true optional, false required); with none,
 * it is optional only when its id is on `NOT_FOR_EVERYBODY`. Worksheets'
 * `required` field is never read. Anything that is not a question (a
 * section, a page break, a consent block) is never required.
 */
export function isQuestionRequired(item: SurveyItem): boolean {
  if (item.kind !== "question") return false;
  if (item.optional === true) return false;
  if (item.optional === false) return true;
  return own(NOT_FOR_EVERYBODY, item.id) === undefined;
}

/** The required questions, in order. */
export function requiredQuestionsOf(items: readonly SurveyItem[]): SurveyQuestion[] {
  return surveyQuestionsOf(items).filter(isQuestionRequired);
}

/**
 * A template's items with every question on `NOT_FOR_EVERYBODY` written as
 * optional, and nothing written on the rest, so the editor's switch starts
 * where the list says.
 */
export function markNotForEverybody(items: SurveyItem[]): SurveyItem[] {
  return items.map((item) =>
    item.kind === "question" && own(NOT_FOR_EVERYBODY, item.id) !== undefined ? { ...item, optional: true } : item,
  );
}

/**
 * What answering one required question takes. `lines` is null for every
 * question but an agreement grid, where it names each line the person is
 * shown, every one of which needs a point.
 */
export type RequiredNeed = { id: string; lines: string[] | null };

/**
 * What answering a required question takes, for a person who is not shown
 * `hiddenLines` (the Facilitator line, for somebody who facilitates).
 *
 * A grid whose every point has words is an agreement grid: every line is a
 * statement anybody can agree or disagree with, so every line it shows needs
 * a point. A grid with words only at its ends rates a programme's parts, and
 * its own line says to leave a part blank you didn't have, so any one line
 * answers it.
 */
export function requiredNeedOf(question: SurveyQuestion, hiddenLines: readonly string[] = []): RequiredNeed {
  if (isLinesQuestion(question) && question.scale.points !== undefined) {
    return { id: question.id, lines: question.lines.map((line) => line.id).filter((id) => !hiddenLines.includes(id)) };
  }
  return { id: question.id, lines: null };
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Whether an answer, in the shape the routes read or keep, says something:
 * one option picked; at least one ticked (a "none of these" counts); a value
 * on a scale, a percentage or a number (0 included); words that are more than
 * spaces; and for a grid, a point on every line `lines` names, or on any one
 * line when it names none.
 */
export function answerFills(answer: unknown, lines: readonly string[] | null = null): boolean {
  if (!isRaw(answer)) return false;
  switch (answer.type) {
    case "choice":
      return typeof answer.optionId === "string" && answer.optionId.length > 0;
    case "choices":
      return Array.isArray(answer.optionIds) && answer.optionIds.some((id) => typeof id === "string" && id.length > 0);
    case "rating":
      return isWhole(answer.value) && answer.value > 0;
    case "scale":
    case "percent":
    case "number":
      return isWhole(answer.value);
    case "text":
      return typeof answer.text === "string" && answer.text.trim().length > 0;
    case "lines": {
      const values = isRaw(answer.values) ? answer.values : {};
      const point = (id: string) => {
        const value = own(values, id);
        return isWhole(value) && value >= 1;
      };
      return lines === null ? Object.keys(values).some(point) : lines.every(point);
    }
    default:
      return false;
  }
}

/** The ids of the needs `answers` leaves blank, in order. The one check the form and `missingRequired` share. */
export function missingOf(needs: readonly RequiredNeed[], answers: unknown): string[] {
  const given = isRaw(answers) ? answers : {};
  return needs.filter((need) => !answerFills(own(given, need.id), need.lines)).map((need) => need.id);
}

/**
 * The ids of the required questions `answers` leaves blank, in the survey's
 * order. `answers` is by question id, in the shapes the answer routes read
 * or keep. `hiddenLines` are the grid lines the person was not shown, which
 * nobody needs to answer.
 */
export function missingRequired(
  items: readonly SurveyItem[],
  answers: unknown,
  options: { hiddenLines?: readonly string[] } = {},
): string[] {
  return missingOf(
    requiredQuestionsOf(items).map((question) => requiredNeedOf(question, options.hiddenLines ?? [])),
    answers,
  );
}

/** The number each option of a scored question stands for, or undefined. */
export function scoreOf(question: SurveyQuestion, optionId: string): number | undefined {
  if (question.kind !== "question" || question.type !== "singleChoice") return undefined;
  const scores = (question as SurveyChoiceQuestion).scores;
  return scores ? own(scores, optionId) : undefined;
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

/** A question stored both as required (Worksheets' field) and optional (the survey's switch). */
export const REQUIRED_CONTRADICTION = "This question is marked both required and optional. Turn its Required switch on or off to settle it.";

function titleProblems(question: { id: string; title: string }, say: (message: string) => void): void {
  if (question.title.trim().length === 0) say("This question needs its words.");
  else if (question.title.length > WORKSHEET_LIMITS.questionTitle) {
    say(`This question’s words are over the ${WORKSHEET_LIMITS.questionTitle}-character limit.`);
  }
}

function extrasProblems(question: SurveyQuestion, all: readonly SurveyQuestion[], say: (message: string) => void): void {
  if (question.hint !== undefined && question.hint.length > SURVEY_ITEM_LIMITS.hint) {
    say(`The line under this question is over the ${SURVEY_ITEM_LIMITS.hint}-character limit.`);
  }
  if (question.lookBackOf !== undefined) {
    const of = all.find((each) => each.id === question.lookBackOf);
    if (!of || of.id === question.id || of.type !== question.type) {
      say("This question looks back on a question this survey doesn’t ask in the same way.");
    }
  }
  if (question.pipe !== undefined) {
    if (!question.pipe.from) say("This question shows an earlier answer, but doesn’t say which.");
    if (question.pipe.words.length > SURVEY_ITEM_LIMITS.pipeWords) {
      say(`The words before an earlier answer are over the ${SURVEY_ITEM_LIMITS.pipeWords}-character limit.`);
    }
  }
}

function linesProblems(question: SurveyLinesQuestion, say: (message: string) => void): void {
  titleProblems(question, say);
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
  const { max, minLabel, maxLabel, points } = question.scale;
  if (!Number.isInteger(max) || max < WORKSHEET_LIMITS.ratingScaleMin || max > WORKSHEET_LIMITS.ratingScaleMax) {
    say(`The scale runs 1 to ${max}. It must top out between ${WORKSHEET_LIMITS.ratingScaleMin} and ${WORKSHEET_LIMITS.ratingScaleMax}.`);
  }
  if (minLabel.length > SURVEY_ITEM_LIMITS.scaleLabel || maxLabel.length > SURVEY_ITEM_LIMITS.scaleLabel) {
    say(`The words at the ends of the scale are over the ${SURVEY_ITEM_LIMITS.scaleLabel}-character limit.`);
  }
  if (points !== undefined) {
    if (points.length !== max) say(`Every point of the scale needs its words: ${max} of them.`);
    if (points.some((point) => point.trim().length === 0)) say("Every point of the scale needs its words.");
    if (points.some((point) => point.length > SURVEY_ITEM_LIMITS.scaleLabel)) {
      say(`A point’s words are over the ${SURVEY_ITEM_LIMITS.scaleLabel}-character limit.`);
    }
  }
}

function percentProblems(question: SurveyPercentQuestion, say: (message: string) => void): void {
  titleProblems(question, say);
  if (question.ends.min.length > SURVEY_ITEM_LIMITS.anchorLabel || question.ends.max.length > SURVEY_ITEM_LIMITS.anchorLabel) {
    say(`The words at 0% or 100% are over the ${SURVEY_ITEM_LIMITS.anchorLabel}-character limit.`);
  }
}

function numberProblems(question: SurveyNumberQuestion, say: (message: string) => void): void {
  titleProblems(question, say);
  if (!Number.isInteger(question.max) || question.max < 1 || question.max > SURVEY_ITEM_LIMITS.maxNumber) {
    say(`The largest number this takes must be a whole number from 1 to ${SURVEY_ITEM_LIMITS.maxNumber}.`);
  }
}

function scaleProblems(question: SurveyScaleQuestion, say: (message: string) => void): void {
  titleProblems(question, say);
  const { min, max } = question;
  if (min !== 0 && min !== 1) say("A scale starts at 0 or at 1.");
  if (!Number.isInteger(max) || max > SURVEY_ITEM_LIMITS.scaleTop || max - min + 1 < SURVEY_ITEM_LIMITS.minScalePoints) {
    say(`The scale runs ${min} to ${max}. It needs at least ${SURVEY_ITEM_LIMITS.minScalePoints} points and tops out by ${SURVEY_ITEM_LIMITS.scaleTop}.`);
  }
  const seen = new Set<number>();
  for (const anchor of question.anchors) {
    if (!Number.isInteger(anchor.at) || anchor.at < min || anchor.at > max) {
      say(`Words sit at a point the scale doesn’t have: ${anchor.at}.`);
      break;
    }
    if (seen.has(anchor.at)) {
      say("Two sets of words sit at the same point.");
      break;
    }
    seen.add(anchor.at);
  }
  if (question.anchors.some((anchor) => anchor.label.trim().length === 0)) say("Every point with words needs them.");
  if (question.anchors.some((anchor) => anchor.label.length > SURVEY_ITEM_LIMITS.anchorLabel)) {
    say(`A point’s words are over the ${SURVEY_ITEM_LIMITS.anchorLabel}-character limit.`);
  }
}

function choiceProblems(question: SurveyChoiceQuestion, say: (message: string) => void): void {
  const options = question.options ?? [];
  if (question.look === "points" && !question.scores) say("Each answer of this question needs its number.");
  if (question.scores) {
    if (options.some((option) => own(question.scores ?? {}, option.id) === undefined)) {
      say("Each answer of this question stands for a number, so answers can be reworded but not added.");
    }
  }
  if (question.maxPicks !== undefined) {
    if (!Number.isInteger(question.maxPicks) || question.maxPicks < 1 || question.maxPicks > options.length) {
      say(`The most people can pick has to be a whole number from 1 to ${options.length}.`);
    }
  }
  if (question.scoreUnit !== undefined && question.scoreUnit.length > SURVEY_ITEM_LIMITS.scaleLabel) {
    say(`What this question’s numbers are counted in is over the ${SURVEY_ITEM_LIMITS.scaleLabel}-character limit.`);
  }
  if (question.most !== undefined && question.most.length > WORKSHEET_LIMITS.questionTitle) {
    say(`This question’s second part is over the ${WORKSHEET_LIMITS.questionTitle}-character limit.`);
  }
}

function consentProblems(item: SurveyConsentItem, say: (message: string) => void): void {
  if (item.statement.trim().length === 0) say("The consent needs its statement.");
  if (item.statement.length > SURVEY_ITEM_LIMITS.statement) {
    say(`The consent statement is over the ${SURVEY_ITEM_LIMITS.statement}-character limit.`);
  }
  if (item.boxes.length > SURVEY_ITEM_LIMITS.maxBoxes) say(`A consent has at most ${SURVEY_ITEM_LIMITS.maxBoxes} boxes.`);
  if (item.boxes.some((box) => box.label.trim().length === 0)) say("Every box needs its words.");
  if (item.boxes.some((box) => box.label.length > SURVEY_ITEM_LIMITS.boxLabel)) {
    say(`A box’s words are over the ${SURVEY_ITEM_LIMITS.boxLabel}-character limit.`);
  }
  const purposes = item.boxes.map((box) => box.purpose);
  if (new Set(purposes).size !== purposes.length) say("Two boxes ask the same thing.");
}

/**
 * Everything wrong with a survey's items, naming the item at fault. Call it on
 * `sanitizeSurveyItems(raw, { clampLimits: false })`, as Worksheets' saving
 * route does, so a number out of range is reported rather than quietly moved.
 */
export function validateSurveyItems(items: readonly SurveyItem[]): SurveyItemProblem[] {
  const worksheetItems = items.filter(
    (item): item is WorksheetItem => item.kind !== "consent" && !(item.kind === "question" && OWN_TYPES.includes(item.type)),
  );
  const problems: SurveyItemProblem[] = validateWorksheetItems(worksheetItems).map((problem) => ({
    itemId: problem.itemId,
    message: problem.message,
  }));
  const questions = surveyQuestionsOf(items);
  if (items.length > SURVEY_ITEM_LIMITS.maxItems) {
    problems.push({ itemId: "", message: `A survey holds at most ${SURVEY_ITEM_LIMITS.maxItems} items.` });
  }
  if (questions.length > SURVEY_ITEM_LIMITS.maxQuestions) {
    problems.push({ itemId: "", message: `A survey asks at most ${SURVEY_ITEM_LIMITS.maxQuestions} questions.` });
  }
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) problems.push({ itemId: item.id, message: "Two items share an id." });
    ids.add(item.id);
  }
  const purposes = new Set<string>();
  for (const item of items) {
    const say = (message: string) => problems.push({ itemId: item.id, message });
    if (item.kind === "consent") {
      consentProblems(item, say);
      for (const box of item.boxes) {
        if (purposes.has(box.purpose)) say("Two boxes in this survey ask the same thing.");
        purposes.add(box.purpose);
      }
      continue;
    }
    if (item.kind !== "question") continue;
    extrasProblems(item, questions, say);
    if (isLinesQuestion(item)) linesProblems(item, say);
    else if (isPercentQuestion(item)) percentProblems(item, say);
    else if (isNumberQuestion(item)) numberProblems(item, say);
    else if (isScaleQuestion(item)) scaleProblems(item, say);
    else {
      if (!SURVEY_WORKSHEET_TYPES.includes(item.type)) say("A survey can’t ask this kind of question.");
      // Worksheets' own field means nothing here (`isQuestionRequired`), so
      // it only ever disagrees: a question it marks required that the survey
      // holds optional is named, never quietly read one way or the other.
      if (item.required && !isQuestionRequired(item)) say(REQUIRED_CONTRADICTION);
      choiceProblems(item, say);
    }
  }
  if (questions.length === 0) {
    problems.push({ itemId: items[0]?.id ?? "", message: "A survey needs at least one question." });
  }
  return problems;
}

/**
 * Whether two lists of items ask the same questions, of the same types, and
 * hold the same consent blocks, in any order. The editor rewords, reorders
 * and changes options and lines; it never adds, removes or retypes a question,
 * and the saving route holds it to that.
 */
export function sameQuestions(before: readonly SurveyItem[], after: readonly SurveyItem[]): boolean {
  const shape = (items: readonly SurveyItem[]) =>
    items
      .flatMap((item) =>
        item.kind === "question"
          ? [`${item.id}:${item.type}`]
          : item.kind === "consent"
            ? [`${item.id}:consent:${item.boxes.map((box) => box.purpose).join("+")}`]
            : [],
      )
      .sort()
      .join("|");
  return shape(before) === shape(after);
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type SurveyAnswerProblem = { questionId: string; message: string };

type Read = { answer: SurveyAnswer | null; problem: string | null };

const SHAPE = "That answer is not in a shape this question understands.";

function readLinesAnswer(question: SurveyLinesQuestion, raw: Raw): Read {
  const values = isRaw(raw.values) ? raw.values : null;
  if (raw.type !== "lines" || !values) return { answer: null, problem: SHAPE };
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

/** A value on a numbered question, from `min` to `max`. Nothing sent is nothing kept. */
function readValueAnswer(type: SurveyValueAnswer["type"], raw: Raw, min: number, max: number, problem: string): Read {
  if (raw.type !== type) return { answer: null, problem: SHAPE };
  if (raw.value === null || raw.value === undefined) return { answer: null, problem: null };
  const value = raw.value;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return { answer: null, problem };
  return { answer: { type, value }, problem: null };
}

function readChoicesAnswer(question: SurveyChoiceQuestion, raw: Raw): Read {
  const answer = raw as unknown as WorksheetAnswer;
  const message = validateAnswer(question, answer);
  if (message) return { answer: null, problem: message };
  if (answerIsEmpty(answer) || answer.type !== "choices") return { answer: null, problem: null };
  const optionIds = [...answer.optionIds];
  if (question.maxPicks !== undefined && optionIds.length > question.maxPicks) {
    return { answer: null, problem: `Pick up to ${question.maxPicks}.` };
  }
  const out: SurveyChoicesAnswer = { type: "choices", optionIds };
  if (question.most !== undefined && raw.most !== undefined && raw.most !== null && raw.most !== "") {
    if (typeof raw.most !== "string" || !optionIds.includes(raw.most)) {
      return { answer: null, problem: "Pick the one that mattered most from those you ticked." };
    }
    out.most = raw.most;
  }
  return { answer: out, problem: null };
}

const NO_QUOTE_BOX = "That answer has no box to tick for quoting.";

/**
 * A short or long answer, with the tick under it when there was one to tick.
 * `quotes` says whether the survey draws the box at all (`asksQuotes`); a
 * tick sent where no box was drawn is refused, so nothing but the person's
 * own tick under a long answer marks a comment as one that may be quoted. A
 * tick under an answer left blank keeps nothing: there is nothing to quote.
 */
function readTextAnswer(question: SurveyChoiceQuestion, raw: Raw, quotes: boolean): Read {
  const answer = raw as unknown as WorksheetAnswer;
  const message = validateAnswer(question, answer);
  if (message) return { answer: null, problem: message };
  const tick = raw.quote;
  if (tick !== undefined && tick !== null && typeof tick !== "boolean") return { answer: null, problem: SHAPE };
  if (tick === true && !(quotes && isQuotable(question))) return { answer: null, problem: NO_QUOTE_BOX };
  if (answerIsEmpty(answer) || answer.type !== "text") return { answer: null, problem: null };
  return { answer: tick === true ? { type: "text", text: answer.text, quote: true } : { type: "text", text: answer.text }, problem: null };
}

/** One answer, read against its question, or nothing for one left blank. */
function readOne(question: SurveyQuestion, raw: Raw, quotes: boolean): Read {
  if (isLinesQuestion(question)) return readLinesAnswer(question, raw);
  if (isPercentQuestion(question)) return readValueAnswer("percent", raw, 0, 100, "Give a number from 0 to 100.");
  if (isNumberQuestion(question)) {
    return readValueAnswer("number", raw, 0, question.max, `Give a whole number from 0 to ${question.max}.`);
  }
  if (isScaleQuestion(question)) {
    return readValueAnswer("scale", raw, question.min, question.max, `Pick a number from ${question.min} to ${question.max}.`);
  }
  if (question.type === "multipleChoice") return readChoicesAnswer(question, raw);
  if (question.type === "shortText" || question.type === "longText") return readTextAnswer(question, raw, quotes);
  const answer = raw as unknown as WorksheetAnswer;
  const message = validateAnswer(question, answer);
  if (message) return { answer: null, problem: message };
  return { answer: answerIsEmpty(answer) ? null : cleanWorksheetAnswer(answer), problem: null };
}

/**
 * Answers with the lines a person was not shown taken out: a line they never
 * saw says nothing for them. A lines answer left with no line is no answer.
 */
export function withoutLines(answers: Record<string, SurveyAnswer>, hidden: readonly string[]): Record<string, SurveyAnswer> {
  if (hidden.length === 0) return answers;
  const out: Record<string, SurveyAnswer> = {};
  for (const [id, answer] of Object.entries(answers)) {
    if (answer.type !== "lines") {
      out[id] = answer;
      continue;
    }
    const values = Object.fromEntries(Object.entries(answer.values).filter(([line]) => !hidden.includes(line)));
    if (Object.keys(values).length > 0) out[id] = { type: "lines", values };
  }
  return out;
}

/**
 * A person's answers, read from a request: only the survey's own questions,
 * each checked against its question, and nothing for one left blank. A blank
 * answer is simply not kept here; whether a blank was allowed is
 * `missingRequired`'s question, asked of what this returns. `quotes` is
 * whether the survey draws "You can quote this, without my name" under its
 * long answers (`asksQuotes`); without it, a tick is refused.
 */
export function readSurveyAnswers(
  items: readonly SurveyItem[],
  raw: unknown,
  options: { quotes?: boolean } = {},
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
      problems.push({ questionId: question.id, message: SHAPE });
      continue;
    }
    const read = readOne(question, value, options.quotes === true);
    if (read.problem) problems.push({ questionId: question.id, message: read.problem });
    else if (read.answer) answers[question.id] = read.answer;
  }
  return { answers, problems };
}

/** Only the fields an answer of its type carries, so nothing else a request sent is kept. */
function cleanWorksheetAnswer(answer: WorksheetAnswer): SurveyAnswer {
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

/**
 * Stored answers, read back for a survey's own questions only. A tick kept
 * under a long answer is read back with it: only the answer routes write
 * one, and only where the box was drawn.
 */
export function storedSurveyAnswers(items: readonly SurveyItem[], raw: unknown): Record<string, SurveyAnswer> {
  return readSurveyAnswers(items, isRaw(raw) ? filterKnown(items, raw) : {}, { quotes: true }).answers;
}

function filterKnown(items: readonly SurveyItem[], raw: Raw): Raw {
  const out: Raw = {};
  for (const question of surveyQuestionsOf(items)) {
    const value = own(raw, question.id);
    if (value !== undefined) out[question.id] = value;
  }
  return out;
}

/**
 * What a person ticked in the survey's consent blocks, read from a request:
 * a yes or no for each purpose the survey asks, and nothing it does not. A box
 * left unticked is a no; a survey with no consent block takes none.
 */
export function readSurveyConsents(
  items: readonly SurveyItem[],
  raw: unknown,
): { consents: SurveyConsents; problem: string | null } {
  const asked = consentPurposesOf(items);
  const consents: SurveyConsents = {};
  if (raw === undefined || raw === null) {
    for (const purpose of asked) consents[purpose] = false;
    return { consents, problem: null };
  }
  if (!isRaw(raw)) return { consents: {}, problem: "Your answers did not arrive in a shape the survey understands." };
  for (const key of Object.keys(raw)) {
    if (!asked.includes(key as SurveyConsentPurpose)) return { consents: {}, problem: "One of those boxes isn’t on this survey." };
    if (typeof raw[key] !== "boolean") return { consents: {}, problem: "Your answers did not arrive in a shape the survey understands." };
  }
  for (const purpose of asked) consents[purpose] = own(raw, purpose) === true;
  return { consents, problem: null };
}

/** A new option or line id, in the shape Worksheets mints one. */
export function newSurveyId(prefix: "o" | "l"): string {
  return newItemId(prefix);
}
