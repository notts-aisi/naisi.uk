// No imports: `src/lib/firestore/courses.ts` reads this module, and every
// reader of that file (some suites' own loaders included) resolves it
// without the "@/" alias. Keep it that way, or make any import relative.

/**
 * SEALED PREDICTIONS: A COURSE'S CREDENCE CARD, AS A RECORD (Zach's extra
 * (d), "build them all"; listed as optional in both fellowships' course maps).
 *
 * On paper, each fellow fills in a credence card in session 1, seals it in an
 * envelope, and opens it in session 6 after filling in the same card again,
 * so the old numbers do not sway the new ones. On the site the card is a
 * record on the COURSE (`CourseDoc.predictionCard`), set by an admin in the
 * course's details, so every run of the course asks the same questions in
 * the week it is sealed in and again in the week it opens in.
 *
 * THE SHAPE. The card's heading as printed (`title`), its opening line when it
 * has one (`intro`, "Put a number on each, from 0% to 100%."), the week it is
 * filled in and sealed in, the week it opens in, and its questions in order.
 * A question is a statement with one of three kinds of answer:
 *  - `percent`: a percentage, 0 to 100;
 *  - `scale`: a number from 0 to the scale's own top, with words for its two
 *    ends ("0 = not at all, 10 = completely");
 *  - `sentence`: a sentence, in words.
 * A number answer may carry one decimal place ("0.5%"): a credence can be
 * small. Each question keeps the number it was printed with ("3"), or none.
 *
 * QUESTION IDS ARE PLACES ON THE CARD ("q1" to "q12"). A person's own card
 * keeps a copy of the questions from their first answer on
 * (`src/lib/firestore/coursePredictions.ts`), so an admin changing the course's
 * card later changes nothing anybody has started: their answers stay beside
 * the questions they answered, and the week it opens in asks them again.
 *
 * Every week number, heading and question is data: nothing about a course or
 * a term is in code.
 *
 * Pure: the course editor's card, the week page, the routes and their tests
 * read it alike. The pasted text is read and written in `cardText.ts`.
 */

/** The three kinds of answer, in the order the editor names them. */
export const PREDICTION_KINDS = ["percent", "scale", "sentence"] as const;
export type PredictionKind = (typeof PREDICTION_KINDS)[number];

/** Every cap, in one place. A paste over one is refused with a sentence, never cut short. */
export const PREDICTION_LIMITS = {
  title: 160,
  intro: 300,
  statement: 400,
  /** The number a question was printed with: "1" to "999". */
  number: 3,
  /** Each end of a scale in words. */
  endLabel: 60,
  maxQuestions: 12,
  /** The highest top a scale may have. A percentage's top is 100. */
  scaleTop: 100,
  /** One sentence answer. */
  sentence: 300,
  /** A whole pasted card, before it is read. */
  textChars: 8000,
  /** The rules' and the plan's bound on a week number. */
  maxWeek: 60,
} as const;

export type PredictionQuestion = {
  /** Its place on the card: "q1" for the first. */
  id: string;
  /** The number it was printed with ("1"), or "" for a line printed without one. */
  number: string;
  kind: PredictionKind;
  /** The question as printed, without its blank and, for a scale, without its ends. */
  statement: string;
  /** The top of a number answer: 100 for a percentage, the scale's own top, 0 for a sentence. */
  max: number;
  /** A scale's two ends in words ("not at all", "completely"); "" otherwise. */
  lowLabel: string;
  highLabel: string;
};

/** What a person is asked: the card's words and questions, without its weeks. */
export type PredictionQuestions = {
  title: string;
  intro: string;
  questions: PredictionQuestion[];
};

/** A course's card. */
export type PredictionCard = PredictionQuestions & {
  /** The week it is filled in and sealed in. */
  sealWeek: number;
  /** The week it opens in, beside the same questions asked again. Always after `sealWeek`. */
  openWeek: number;
};

/** One answer: a number for a percentage or a scale, words for a sentence. */
export type PredictionAnswer = number | string;
/** A card's answers by question id. A question with no answer has no key. */
export type PredictionAnswers = Record<string, PredictionAnswer>;

type Raw = Record<string, unknown>;

const isRaw = (value: unknown): value is Raw => value !== null && typeof value === "object" && !Array.isArray(value);

/** One line of plain text: spaces collapsed, ends trimmed, cut at `max` on read. */
function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/** A whole week number from 1 to the plan's bound, or null. */
export function weekNumberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= PREDICTION_LIMITS.maxWeek ? value : null;
}

/** The id of the question in place `index` (from 0). */
export function questionIdAt(index: number): string {
  return `q${index + 1}`;
}

/** Whether a string is a question id at all: "q1" to "q99". */
export function isQuestionId(value: unknown): value is string {
  return typeof value === "string" && /^q[1-9]\d?$/.test(value);
}

/** A stored question, or null for one that cannot be read whole. */
function readQuestion(value: unknown, index: number): PredictionQuestion | null {
  if (!isRaw(value)) return null;
  const kind = PREDICTION_KINDS.includes(value.kind as PredictionKind) ? (value.kind as PredictionKind) : null;
  const statement = oneLine(value.statement, PREDICTION_LIMITS.statement);
  if (!kind || !statement) return null;
  const number = typeof value.number === "string" && /^\d{1,3}$/.test(value.number) ? value.number : "";
  if (kind === "scale") {
    const max = value.max;
    if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > PREDICTION_LIMITS.scaleTop) return null;
    return {
      id: questionIdAt(index),
      number,
      kind,
      statement,
      max,
      lowLabel: oneLine(value.lowLabel, PREDICTION_LIMITS.endLabel),
      highLabel: oneLine(value.highLabel, PREDICTION_LIMITS.endLabel),
    };
  }
  return { id: questionIdAt(index), number, kind, statement, max: kind === "percent" ? 100 : 0, lowLabel: "", highLabel: "" };
}

/**
 * The card's words and questions as stored, or null for none. The ids are
 * the places the questions are stored in, so a stored list read twice gives
 * the same ids. A question that cannot be read whole is left out, and the
 * questions after it keep their own ids, so no answer moves to another
 * question.
 */
export function normalizePredictionQuestions(raw: unknown): PredictionQuestions | null {
  if (!isRaw(raw) || !Array.isArray(raw.questions)) return null;
  const questions: PredictionQuestion[] = [];
  raw.questions.slice(0, PREDICTION_LIMITS.maxQuestions).forEach((value, index) => {
    const question = readQuestion(value, index);
    if (question) questions.push(question);
  });
  if (questions.length === 0) return null;
  return {
    title: oneLine(raw.title, PREDICTION_LIMITS.title),
    intro: oneLine(raw.intro, PREDICTION_LIMITS.intro),
    questions,
  };
}

/** A course's card as stored, or null for a course with none, or one that cannot be read. */
export function normalizePredictionCard(raw: unknown): PredictionCard | null {
  const read = normalizePredictionQuestions(raw);
  if (!read || !isRaw(raw)) return null;
  const sealWeek = weekNumberOf(raw.sealWeek);
  const openWeek = weekNumberOf(raw.openWeek);
  if (sealWeek === null || openWeek === null || openWeek <= sealWeek) return null;
  return { ...read, sealWeek, openWeek };
}

/**
 * What would stop a card being saved, each a sentence that says what to
 * change. Empty when it can be saved.
 */
export function predictionCardProblems(card: PredictionCard): string[] {
  const out: string[] = [];
  if (!card.title.trim()) out.push("Start with the card’s heading, as printed.");
  if (card.title.length > PREDICTION_LIMITS.title) out.push(`The heading is longer than ${PREDICTION_LIMITS.title} characters.`);
  if (card.intro.length > PREDICTION_LIMITS.intro) out.push(`The line under the heading is longer than ${PREDICTION_LIMITS.intro} characters.`);
  if (weekNumberOf(card.sealWeek) === null) out.push("Say the week the card is filled in and sealed in.");
  if (weekNumberOf(card.openWeek) === null) out.push("Say the week the card opens in.");
  if (weekNumberOf(card.sealWeek) !== null && weekNumberOf(card.openWeek) !== null && card.openWeek <= card.sealWeek) {
    out.push("The card has to open in a later week than the one it’s sealed in.");
  }
  if (card.questions.length === 0) out.push("There are no questions on the card.");
  if (card.questions.length > PREDICTION_LIMITS.maxQuestions) {
    out.push(`There are ${card.questions.length} questions; the most is ${PREDICTION_LIMITS.maxQuestions}.`);
  }
  card.questions.forEach((question, index) => {
    const name = question.number ? `Question ${question.number}` : `Line ${index + 1}`;
    if (!question.statement.trim()) out.push(`${name} has no words.`);
    if (question.statement.length > PREDICTION_LIMITS.statement) {
      out.push(`${name} is longer than ${PREDICTION_LIMITS.statement} characters.`);
    }
    if (question.kind === "scale") {
      if (!Number.isInteger(question.max) || question.max < 1 || question.max > PREDICTION_LIMITS.scaleTop) {
        out.push(`${name}’s scale has to run from 0 to a whole number up to ${PREDICTION_LIMITS.scaleTop}.`);
      }
      if (!question.lowLabel.trim() || !question.highLabel.trim()) {
        out.push(`${name}’s scale needs words for both ends, like “(0 = not at all, 10 = completely)”.`);
      }
      if (question.lowLabel.length > PREDICTION_LIMITS.endLabel || question.highLabel.length > PREDICTION_LIMITS.endLabel) {
        out.push(`${name}’s words for the ends of its scale are longer than ${PREDICTION_LIMITS.endLabel} characters.`);
      }
    }
  });
  return out;
}

/** A number with at most one decimal place, as an answer keeps it. */
function toTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

export type AnswerRead = { ok: true; value: PredictionAnswer | null } | { ok: false; error: string };

/**
 * What one answer stores, or why it cannot. A value of null, or an empty
 * box, takes the answer away (`value: null`). A number is kept to one
 * decimal place; words are kept as typed, ends trimmed.
 */
export function readAnswer(question: PredictionQuestion, value: unknown): AnswerRead {
  if (value === null || value === "") return { ok: true, value: null };
  if (question.kind === "sentence") {
    if (typeof value !== "string") return { ok: false, error: "Send your answer to that one as words." };
    const words = value.replace(/\s+/g, " ").trim();
    if (!words) return { ok: true, value: null };
    if (words.length > PREDICTION_LIMITS.sentence) {
      return { ok: false, error: `Keep it to one sentence: under ${PREDICTION_LIMITS.sentence} characters.` };
    }
    return { ok: true, value: words };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, error: "Send your answer to that one as a number." };
  if (value < 0 || value > question.max) {
    return {
      ok: false,
      error: question.kind === "percent" ? "Give a percentage from 0 to 100." : `Give a number from 0 to ${question.max}.`,
    };
  }
  return { ok: true, value: toTenths(value) };
}

/**
 * Stored answers, kept only where they answer a question on `questions` in
 * that question's own kind and range. Anything else reads as no answer.
 */
export function normalizeAnswers(raw: unknown, questions: readonly PredictionQuestion[]): PredictionAnswers {
  const out: PredictionAnswers = {};
  if (!isRaw(raw)) return out;
  for (const question of questions) {
    if (!Object.hasOwn(raw, question.id)) continue;
    const read = readAnswer(question, raw[question.id]);
    if (read.ok && read.value !== null) out[question.id] = read.value;
  }
  return out;
}

/** How many of the card's questions have an answer. */
export function answeredCount(questions: readonly PredictionQuestion[], answers: PredictionAnswers): number {
  return questions.filter((question) => Object.hasOwn(answers, question.id)).length;
}

/** The card's words and questions alone, as a person's own card keeps them. */
export function questionsOf(card: PredictionQuestions): PredictionQuestions {
  return {
    title: card.title,
    intro: card.intro,
    questions: card.questions.map((question) => ({ ...question })),
  };
}

/** A card's words and questions as stored: every field written out, never the request's own object. */
export function storedQuestions(card: PredictionQuestions): Raw {
  return {
    title: card.title,
    intro: card.intro,
    questions: card.questions.map((question) => ({
      number: question.number,
      kind: question.kind,
      statement: question.statement,
      max: question.max,
      lowLabel: question.lowLabel,
      highLabel: question.highLabel,
    })),
  };
}

/** A course's card as stored. */
export function storedCard(card: PredictionCard): Raw {
  return { ...storedQuestions(card), sealWeek: card.sealWeek, openWeek: card.openWeek };
}
