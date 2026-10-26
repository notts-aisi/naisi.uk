import { own } from "@/lib/applications/keys";
import {
  isLinesQuestion,
  type SurveyAnswer,
  type SurveyLinesQuestion,
  type SurveyQuestion,
} from "./items";
import { meanOf, medianOf, valueOf } from "./results";

/**
 * HOW ANSWERS CHANGED, PERSON BY PERSON, for admins: one question asked at
 * two stages of a programme (before and at the end, or before and in a
 * follow-up), or asked now and looked back on in the same survey ("Looking
 * back, which best described you before?"). Only people who answered it both
 * times are counted, and the count travels with every number.
 *
 * What is compared, by kind:
 *  - A number on a scale, a percentage, a whole number, or an answer that
 *    stands for a number (a stage, a share of working time): the average and
 *    the middle value at each end, and how many moved up, stayed and moved
 *    down.
 *  - "1 to 5 for each line": each line's average at each end, and how many
 *    moved up on it.
 *  - Choose one with no numbers, and pick any: how many picked each answer
 *    at each end.
 *  - A text answer is not compared.
 *
 * Totals only, never a person: a person is paired by their uid here and the
 * uid goes no further. Pure: no reads and no clock.
 */

/** One person's answers to one survey, as the pairing reads them. */
export type PairedAnswers = { uid: string; answers: Record<string, SurveyAnswer> };

export type ValueChange = {
  kind: "values";
  /** The survey (or the question) compared with: "AGI Strategy: before", "Looking back". */
  against: string;
  both: number;
  before: { mean: number | null; median: number | null };
  after: { mean: number | null; median: number | null };
  up: number;
  same: number;
  down: number;
  /** "%" for a percentage, the scored answers' unit ("FTE"), or "". */
  unit: string;
};

export type LinesChange = {
  kind: "lines";
  against: string;
  rows: { label: string; both: number; before: number | null; after: number | null; up: number }[];
};

export type OptionsChange = {
  kind: "options";
  against: string;
  both: number;
  /** Pick any: the counts can add up to more than `both`. */
  multiple: boolean;
  options: { label: string; before: number; after: number }[];
};

export type ChangeResult = ValueChange | LinesChange | OptionsChange;

function unitOf(question: SurveyQuestion): string {
  if (question.type === "percent") return "%";
  if (question.type === "singleChoice") return question.look === "points" ? "" : (question.scoreUnit ?? "");
  return "";
}

/** Whether a question's answers are compared as numbers. */
function comparedAsValues(question: SurveyQuestion): boolean {
  if (question.type === "scale" || question.type === "percent" || question.type === "number" || question.type === "rating") return true;
  return question.type === "singleChoice" && question.scores !== undefined;
}

/** Pairs of answers, by person, for people who gave both. */
function pairsOf<T>(
  earlier: readonly PairedAnswers[],
  later: readonly PairedAnswers[],
  read: (answers: Record<string, SurveyAnswer>, side: "earlier" | "later") => T | null,
): [T, T][] {
  const first = new Map<string, T>();
  for (const set of earlier) {
    const value = read(set.answers, "earlier");
    if (value !== null && set.uid) first.set(set.uid, value);
  }
  const out: [T, T][] = [];
  for (const set of later) {
    const before = first.get(set.uid);
    const after = read(set.answers, "later");
    if (before !== undefined && after !== null) out.push([before, after]);
  }
  return out;
}

function valueChange(against: string, pairs: [number, number][], unit: string): ValueChange {
  const before = pairs.map(([value]) => value);
  const after = pairs.map(([, value]) => value);
  return {
    kind: "values",
    against,
    both: pairs.length,
    before: { mean: meanOf(before), median: medianOf(before) },
    after: { mean: meanOf(after), median: medianOf(after) },
    up: pairs.filter(([was, now]) => now > was).length,
    same: pairs.filter(([was, now]) => now === was).length,
    down: pairs.filter(([was, now]) => now < was).length,
    unit,
  };
}

function linesChange(
  against: string,
  earlierQuestion: SurveyLinesQuestion,
  laterQuestion: SurveyLinesQuestion,
  earlier: readonly PairedAnswers[],
  later: readonly PairedAnswers[],
): LinesChange {
  const rows = laterQuestion.lines
    .filter((line) => earlierQuestion.lines.some((each) => each.id === line.id))
    .map((line) => {
      const valueIn = (question: SurveyLinesQuestion) => (answers: Record<string, SurveyAnswer>) => {
        const answer = own(answers, question.id);
        const value = answer && answer.type === "lines" ? own(answer.values, line.id) : undefined;
        return typeof value === "number" ? value : null;
      };
      const pairs = pairsOf(earlier, later, (answers, side) => valueIn(side === "earlier" ? earlierQuestion : laterQuestion)(answers));
      return {
        label: line.label,
        both: pairs.length,
        before: meanOf(pairs.map(([value]) => value)),
        after: meanOf(pairs.map(([, value]) => value)),
        up: pairs.filter(([was, now]) => now > was).length,
      };
    });
  return { kind: "lines", against, rows };
}

function picksOf(question: SurveyQuestion, answers: Record<string, SurveyAnswer>): string[] | null {
  const answer = own(answers, question.id);
  if (!answer) return null;
  if (answer.type === "choice") return [answer.optionId];
  if (answer.type === "choices") return answer.optionIds;
  return null;
}

function optionsChange(
  against: string,
  earlierQuestion: SurveyQuestion,
  laterQuestion: SurveyQuestion,
  earlier: readonly PairedAnswers[],
  later: readonly PairedAnswers[],
): OptionsChange {
  const pairs = pairsOf(earlier, later, (answers, side) => picksOf(side === "earlier" ? earlierQuestion : laterQuestion, answers));
  const options = laterQuestion.kind === "question" && "options" in laterQuestion ? (laterQuestion.options ?? []) : [];
  return {
    kind: "options",
    against,
    both: pairs.length,
    multiple: laterQuestion.type === "multipleChoice",
    options: options.map((option) => ({
      label: option.label,
      before: pairs.filter(([was]) => was.includes(option.id)).length,
      after: pairs.filter(([, now]) => now.includes(option.id)).length,
    })),
  };
}

/**
 * How one question changed between two answers sets, for people in both: an
 * earlier survey's (`earlierQuestion`, `earlier`) and this one's. The two
 * questions must be of one kind; a text answer is not compared.
 */
export function changeBetween(
  against: string,
  earlierQuestion: SurveyQuestion,
  laterQuestion: SurveyQuestion,
  earlier: readonly PairedAnswers[],
  later: readonly PairedAnswers[],
): ChangeResult | null {
  if (earlierQuestion.type !== laterQuestion.type) return null;
  if (isLinesQuestion(earlierQuestion) && isLinesQuestion(laterQuestion)) {
    return linesChange(against, earlierQuestion, laterQuestion, earlier, later);
  }
  if (comparedAsValues(laterQuestion)) {
    const pairs = pairsOf(earlier, later, (answers, side) => {
      const question = side === "earlier" ? earlierQuestion : laterQuestion;
      return valueOf(question, own(answers, question.id));
    });
    return valueChange(against, pairs, unitOf(laterQuestion));
  }
  if (laterQuestion.type === "singleChoice" || laterQuestion.type === "multipleChoice") {
    return optionsChange(against, earlierQuestion, laterQuestion, earlier, later);
  }
  return null;
}

/**
 * A question beside the one that looks back on it, in the same survey, for
 * people who answered both: the look-back is the "before", the question
 * itself the "after".
 */
export function lookBackBetween(question: SurveyQuestion, back: SurveyQuestion, sets: readonly PairedAnswers[], against: string): ChangeResult | null {
  return changeBetween(against, back, question, sets, sets);
}
