import { own } from "@/lib/applications/keys";
import { isLinesQuestion, surveyQuestionsOf, type SurveyAnswer, type SurveyItem, type SurveyQuestion } from "./items";
import type { SurveyBlanksPress, SurveyBlanksLink } from "@/lib/firestore/surveys";
import { BLANKS_REFUSAL, BLANKS_WORDS, blanksAnsweredWords, blanksPressedWords, leftBlankWords } from "./words";

/**
 * THE QUESTIONS SOMEBODY LEFT BLANK, AND THE ANSWERS THEY SENT LATER
 * (docs/surveys.md, "Sending the questions left blank").
 *
 * Somebody who sent a survey with required questions left blank may be sent,
 * by an admin's press, a link of their own showing only those questions. What
 * they send through it is kept BESIDE their first answers, never over them:
 * the first send's `answers` are never written again, and each later send is
 * one entry of the answer's `fills`, oldest first.
 *
 * Rules a maintainer keeps:
 *
 *  - ONE MERGE. `mergedAnswers` is the only way the first send and the later
 *    ones become one set of answers, and the two answer normalisers in
 *    `src/lib/firestore/surveys.ts` call it, so every reader of a survey's
 *    answers (results, the lead's totals and comments, one person's page, the
 *    spreadsheet, the Kairos report, public numbers, This term in numbers,
 *    before and after) reads the same thing. `tests/surveys-blanks-merge.test.mjs`
 *    walks the tree for a read of the answers that goes round it.
 *  - NOTHING IS OVERWRITTEN. A later send only ever adds an answer to a
 *    question that is still blank. A "1 to 5 for each line" question merges
 *    line by line: a later send adds the lines that were blank and never
 *    changes a line already answered. The merge holds that whatever is
 *    stored, and the route that keeps a later send refuses anything else.
 *  - A CONSENT BOX IS NEVER A BLANK. It is not a question (`kind: "consent"`),
 *    and the Kairos choice and the quote tick are not questions either.
 *
 * Pure: no server import, so the routes, the pages and the tests ask the same
 * functions of the same shapes.
 */

/** Answers, as a survey keeps them: question id to answer. */
export type SurveyAnswers = Record<string, SurveyAnswer>;

/**
 * Every answer somebody has given to one survey: their first send's, then
 * each later send's, in the order they came, each adding only to what was
 * still blank. Nothing a send holds is ever replaced by a later one.
 */
export function mergedAnswers(first: Readonly<SurveyAnswers>, fills: readonly { answers: Readonly<SurveyAnswers> }[]): SurveyAnswers {
  const out: SurveyAnswers = { ...first };
  for (const fill of fills) {
    for (const [id, answer] of Object.entries(fill.answers)) {
      const held = own(out, id);
      if (held === undefined) {
        out[id] = answer;
        continue;
      }
      // A lines question takes the lines that were blank, and keeps every line it had.
      if (held.type === "lines" && answer.type === "lines") {
        const values = { ...held.values };
        for (const [line, value] of Object.entries(answer.values)) {
          if (own(values, line) === undefined) values[line] = value;
        }
        out[id] = { type: "lines", values };
      }
    }
  }
  return out;
}

/** Whether a question must be answered. The rule is passed in, so the one definition of "required" decides. */
export type RequiredRule = (question: SurveyQuestion) => boolean;

/**
 * STAND-IN until the survey's own Required switch reaches this code: every
 * question is required, and a consent box, never a question, never is.
 * Replaced by `isQuestionRequired` from `./items` when that lands.
 */
export const EVERY_QUESTION_REQUIRED: RequiredRule = () => true;

/** The rule every caller of this file asks, so the survey's own definition of "required" is swapped in once. */
export const IS_REQUIRED: RequiredRule = EVERY_QUESTION_REQUIRED;

/** One question still blank: its id, and for a "1 to 5 for each line" question the lines still blank. */
export type SurveyBlank = { id: string; lines: string[] | null };

/** The lines of a lines question the person is shown: all but those hidden from them. */
function shownLines(question: SurveyQuestion, hiddenLines: readonly string[]): string[] {
  return isLinesQuestion(question) ? question.lines.map((line) => line.id).filter((id) => !hiddenLines.includes(id)) : [];
}

/**
 * Whether one answer answers its question: a choice picked, at least one tick,
 * a number, words other than spaces, and for a lines question every line the
 * person is shown.
 */
function isAnswered(question: SurveyQuestion, answer: SurveyAnswer | undefined, hiddenLines: readonly string[]): boolean {
  if (!answer) return false;
  switch (answer.type) {
    case "choice":
      return Boolean(answer.optionId);
    case "choices":
      return answer.optionIds.length > 0;
    case "text":
      return answer.text.trim().length > 0;
    case "rating":
    case "scale":
    case "percent":
    case "number":
      return Number.isFinite(answer.value);
    case "lines":
      return shownLines(question, hiddenLines).every((line) => own(answer.values, line) !== undefined);
    default:
      return false;
  }
}

/**
 * THE QUESTIONS STILL BLANK: every question of the survey's items as they are
 * now that the rule says is required and the answers (merged, `mergedAnswers`)
 * leave blank, in the survey's order. A lines question with some lines
 * answered is blank in the lines that are not; a line hidden from the person
 * (`hiddenLinesFor`) is never theirs to answer, so never blank.
 */
export function blanksOf(
  items: readonly SurveyItem[],
  answers: Readonly<SurveyAnswers>,
  options: { isRequired: RequiredRule; hiddenLines?: readonly string[] },
): SurveyBlank[] {
  const hidden = options.hiddenLines ?? [];
  const out: SurveyBlank[] = [];
  for (const question of surveyQuestionsOf(items)) {
    if (!options.isRequired(question)) continue;
    const answer = own(answers, question.id);
    if (isAnswered(question, answer, hidden)) continue;
    if (isLinesQuestion(question)) {
      const lines = shownLines(question, hidden).filter((line) => !(answer?.type === "lines" && own(answer.values, line) !== undefined));
      // A lines question every line of which is hidden from the person asks them nothing.
      if (lines.length > 0) out.push({ id: question.id, lines });
      continue;
    }
    out.push({ id: question.id, lines: null });
  }
  return out;
}

/**
 * The questions a link of blanks shows, in the survey's order: each blank
 * question as the survey holds it, and a lines question with only its blank
 * lines. No section, page break or consent block: only the questions.
 */
export function blankItemsOf(items: readonly SurveyItem[], blanks: readonly SurveyBlank[]): SurveyQuestion[] {
  const out: SurveyQuestion[] = [];
  for (const question of surveyQuestionsOf(items)) {
    const blank = blanks.find((each) => each.id === question.id);
    if (!blank) continue;
    if (isLinesQuestion(question) && blank.lines) {
      out.push({ ...question, lines: question.lines.filter((line) => blank.lines!.includes(line.id)) });
      continue;
    }
    out.push(question);
  }
  return out;
}

/**
 * What a later send may not hold, in a sentence, or null: an answer to a
 * question that was not blank, or a line of a lines question that was not.
 * The route asks this before it reads the answers against their questions.
 */
export function outsideBlanks(raw: Readonly<Record<string, unknown>>, blanks: readonly SurveyBlank[]): string | null {
  for (const [id, value] of Object.entries(raw)) {
    const blank = blanks.find((each) => each.id === id);
    if (!blank) return BLANKS_REFUSAL.notBlank;
    if (!blank.lines || !value || typeof value !== "object") continue;
    const values = (value as { values?: unknown }).values;
    if (!values || typeof values !== "object") continue;
    for (const line of Object.keys(values)) {
      if (!blank.lines.includes(line)) return BLANKS_REFUSAL.notBlank;
    }
  }
  return null;
}

/**
 * What came later, and when: for each later send, the questions it answered
 * (by question id) and, on a lines question, each line it added (by
 * `<question id>.<line id>`), with the time of the send that added it. A
 * lines question some of whose lines came later is listed too. One person's
 * page marks those answers as sent later.
 */
export function laterAnswersOf(
  first: Readonly<SurveyAnswers>,
  fills: readonly { answers: Readonly<SurveyAnswers>; sentAt: Date | null }[],
): Map<string, Date | null> {
  const out = new Map<string, Date | null>();
  const mark = (key: string, at: Date | null) => {
    if (!out.has(key)) out.set(key, at);
  };
  let held: SurveyAnswers = { ...first };
  for (const fill of fills) {
    const next = mergedAnswers(held, [fill]);
    for (const [id, after] of Object.entries(next)) {
      const before = own(held, id);
      if (before === undefined) {
        mark(id, fill.sentAt);
        if (after.type === "lines") for (const line of Object.keys(after.values)) mark(`${id}.${line}`, fill.sentAt);
        continue;
      }
      if (before.type !== "lines" || after.type !== "lines") continue;
      const added = Object.keys(after.values).filter((line) => own(before.values, line) === undefined);
      if (added.length === 0) continue;
      mark(id, fill.sentAt);
      for (const line of added) mark(`${id}.${line}`, fill.sentAt);
    }
    held = next;
  }
  return out;
}

/**
 * Beside one person on the admins' pages: how many questions they left blank,
 * the last press and what became of it, and whether the button can be pressed
 * now (only while the survey takes answers, and only for blanks that remain).
 * Null when there is nothing to say: nothing blank, and nothing ever pressed.
 */
export type BlanksRow = {
  /** "Left 3 blank", or "" when nothing is. */
  marker: string;
  count: number;
  /** "Sent Fri 30 Oct, 2:05pm by Zach Levin", "Answered the blanks Fri 30 Oct, 3pm", or "". */
  pressed: string;
  /** Whether the button is drawn to be pressed. */
  can: boolean;
  /** Why the button cannot be pressed, said beside it, or "". */
  why: string;
};

export function blanksRowOf(input: {
  count: number;
  open: boolean;
  link: SurveyBlanksLink | null;
  presses: readonly SurveyBlanksPress[];
  /** A presser's whole name, by uid, or "" when their account is gone. */
  nameOf: (uid: string) => string;
}): BlanksRow | null {
  const last = input.presses[input.presses.length - 1] ?? null;
  if (input.count === 0 && !last) return null;
  let pressed = "";
  if (input.link?.spentAt) pressed = blanksAnsweredWords(input.link.spentAt);
  else if (last) pressed = blanksPressedWords({ at: last.at, by: input.nameOf(last.byUid), delivery: input.link?.delivery ?? null });
  return {
    marker: input.count > 0 ? leftBlankWords(input.count) : "",
    count: input.count,
    pressed,
    can: input.count > 0 && input.open,
    why: input.count > 0 && !input.open ? BLANKS_WORDS.closed : "",
  };
}
