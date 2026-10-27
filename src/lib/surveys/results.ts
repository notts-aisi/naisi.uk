import { aggregateQuestion, type RespondentAnswer } from "@/features/worksheets/aggregate";
import type { WorksheetAnswer } from "@/lib/firestore/worksheets";
import { own } from "@/lib/applications/keys";
import {
  isLinesQuestion,
  isNumberQuestion,
  isPercentQuestion,
  isScaleQuestion,
  questionNumbers,
  scoreOf,
  surveyQuestionsOf,
  type SurveyAnswer,
  type SurveyChoiceQuestion,
  type SurveyItem,
  type SurveyLinesQuestion,
  type SurveyNumberQuestion,
  type SurveyPercentQuestion,
  type SurveyQuestion,
  type SurveyScaleQuestion,
} from "./items";

/**
 * A SURVEY'S RESULTS: totals and comments, made on the server, never a name.
 *
 * Every question's totals are counted here from the stored answers and only
 * the numbers (and the words of any comment) leave for the page. Choice,
 * rating and text questions are counted by Worksheets' own `aggregateQuestion`,
 * which the circulation page uses; the survey's own questions are counted
 * here: a "1 to 5 for each line" question line by line, each on its scale, a
 * scale point by point, and a percentage or a number by its average, its
 * middle value and its spread.
 *
 * Results show from the first answer: there is no floor below which a total
 * is held back (Zach, 25 Oct 2026). Who answered what is the export's and the
 * Who answered tab's, for admins, never this.
 *
 * Every percentage is of the people who answered THAT question (or line),
 * the Worksheets rule, and the count travels beside it.
 *
 * Pure: no reads and no clock.
 */

export type OptionResult = { label: string; count: number; percent: number };

/** A spread of values in bands: "0 to 19%", or "3 to 5". */
export type BandResult = { label: string; count: number };

export type ScaleRow = { label: string; respondents: number; counts: number[]; mean: number | null; median: number | null };

export type QuestionResult =
  | {
      kind: "options";
      id: string;
      number: number;
      title: string;
      /** Pick any: the percentages can add up to more than 100. */
      multiple: boolean;
      respondents: number;
      options: OptionResult[];
      /** Pick any, then the one that mattered most: how often each was picked as that. */
      most: { title: string; respondents: number; options: OptionResult[] } | null;
      /** An answer that counts as a number: the total and the average of those numbers. */
      scored: { total: number; mean: number | null; unit: string } | null;
    }
  | {
      kind: "scale";
      id: string;
      number: number;
      title: string;
      /** The bottom of the scale, 0 or 1; `counts[0]` is that point. */
      min: number;
      minLabel: string;
      maxLabel: string;
      /** One row per line; a rating or a scale question is one row of its own. */
      rows: ScaleRow[];
      /** 0 to 10 only: the share at 9 or 10 less the share at 0 to 6, in points. */
      promoterScore: number | null;
    }
  | {
      kind: "value";
      id: string;
      number: number;
      title: string;
      /** "%" for a percentage, "" for a number. */
      unit: string;
      respondents: number;
      mean: number | null;
      median: number | null;
      lowest: number | null;
      highest: number | null;
      bands: BandResult[];
    }
  | { kind: "comments"; id: string; number: number; title: string; respondents: number; comments: string[] };

/** One person's answers, as results read them: no person, just the answers. */
export type AnswerSet = { answers: Record<string, SurveyAnswer> };

/** The middle value of some numbers, or null for none. */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function meanOf(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const percentOf = (count: number, of: number) => (of > 0 ? Math.round((count / of) * 100) : 0);

/** The value a person gave a numbered question (a scale, a percentage, a number), or null. */
export function valueOf(question: SurveyQuestion, answer: SurveyAnswer | undefined): number | null {
  if (!answer) return null;
  if (isScaleQuestion(question) && answer.type === "scale") return answer.value;
  if (isPercentQuestion(question) && answer.type === "percent") return answer.value;
  if (isNumberQuestion(question) && answer.type === "number") return answer.value;
  if (question.type === "rating" && answer.type === "rating") return answer.value;
  if (question.type === "singleChoice" && answer.type === "choice") return scoreOf(question, answer.optionId) ?? null;
  return null;
}

function scaleRow(label: string, values: readonly number[], min: number, max: number): ScaleRow {
  const counts = new Array<number>(max - min + 1).fill(0);
  for (const value of values) if (value >= min && value <= max) counts[value - min] += 1;
  return { label, respondents: values.length, counts, mean: meanOf(values), median: medianOf(values) };
}

function linesResult(question: SurveyLinesQuestion, number: number, sets: readonly AnswerSet[]): QuestionResult {
  const max = question.scale.max;
  const rows = question.lines.map((line) => {
    const values: number[] = [];
    for (const set of sets) {
      const answer = own(set.answers, question.id);
      if (!answer || answer.type !== "lines") continue;
      const value = own(answer.values, line.id);
      if (typeof value === "number" && value >= 1 && value <= max) values.push(value);
    }
    return scaleRow(line.label, values, 1, max);
  });
  return {
    kind: "scale",
    id: question.id,
    number,
    title: question.title,
    min: 1,
    minLabel: question.scale.points?.[0] ?? question.scale.minLabel,
    maxLabel: question.scale.points?.[max - 1] ?? question.scale.maxLabel,
    rows,
    promoterScore: null,
  };
}

/** The share at 9 or 10 less the share at 0 to 6, in whole points, of people who answered 0 to 10. */
export function promoterScoreOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const promoters = values.filter((value) => value >= 9).length;
  const detractors = values.filter((value) => value <= 6).length;
  return Math.round(((promoters - detractors) / values.length) * 100);
}

function scaleResult(question: SurveyScaleQuestion, number: number, sets: readonly AnswerSet[]): QuestionResult {
  const values = sets.map((set) => valueOf(question, own(set.answers, question.id))).filter((value): value is number => value !== null);
  const words = new Map(question.anchors.map((anchor) => [anchor.at, anchor.label]));
  return {
    kind: "scale",
    id: question.id,
    number,
    title: question.title,
    min: question.min,
    minLabel: words.get(question.min) ?? "",
    maxLabel: words.get(question.max) ?? "",
    rows: [scaleRow("", values, question.min, question.max)],
    promoterScore: question.min === 0 && question.max === 10 ? promoterScoreOf(values) : null,
  };
}

/** Bands for a spread: fifths of 0 to 100 for a percentage; 0, 1 to 2, 3 to 5, 6 to 10 and more for a number. */
function bandsOf(question: SurveyPercentQuestion | SurveyNumberQuestion, values: readonly number[]): BandResult[] {
  const ranges: [number, number, string][] = isPercentQuestion(question)
    ? [
        [0, 19, "0 to 19%"],
        [20, 39, "20 to 39%"],
        [40, 59, "40 to 59%"],
        [60, 79, "60 to 79%"],
        [80, 100, "80 to 100%"],
      ]
    : [
        [0, 0, "0"],
        [1, 2, "1 to 2"],
        [3, 5, "3 to 5"],
        [6, 10, "6 to 10"],
        [11, Number.POSITIVE_INFINITY, "More than 10"],
      ];
  return ranges.map(([low, high, label]) => ({ label, count: values.filter((value) => value >= low && value <= high).length }));
}

function valueResult(question: SurveyPercentQuestion | SurveyNumberQuestion, number: number, sets: readonly AnswerSet[]): QuestionResult {
  const values = sets.map((set) => valueOf(question, own(set.answers, question.id))).filter((value): value is number => value !== null);
  return {
    kind: "value",
    id: question.id,
    number,
    title: question.title,
    unit: isPercentQuestion(question) ? "%" : "",
    respondents: values.length,
    mean: meanOf(values),
    median: medianOf(values),
    lowest: values.length > 0 ? Math.min(...values) : null,
    highest: values.length > 0 ? Math.max(...values) : null,
    bands: bandsOf(question, values),
  };
}

function choiceResult(question: SurveyChoiceQuestion, number: number, sets: readonly AnswerSet[]): QuestionResult | null {
  // Worksheets' counting asks for a uid beside each answer; results never
  // carry one, so none is handed over.
  const answers: RespondentAnswer[] = sets.map((set) => {
    const answer = own(set.answers, question.id);
    return { uid: "", answer: answer && answer.type !== "lines" ? (answer as WorksheetAnswer) : undefined };
  });
  const total = aggregateQuestion(question, answers);
  switch (total.kind) {
    case "options": {
      let most: Extract<QuestionResult, { kind: "options" }>["most"] = null;
      if (question.type === "multipleChoice" && question.most) {
        const picked = sets.flatMap((set) => {
          const answer = own(set.answers, question.id);
          return answer && answer.type === "choices" && answer.most ? [answer.most] : [];
        });
        most = {
          title: question.most,
          respondents: picked.length,
          options: (question.options ?? []).map((option) => {
            const count = picked.filter((id) => id === option.id).length;
            return { label: option.label, count, percent: percentOf(count, picked.length) };
          }),
        };
      }
      let scored: Extract<QuestionResult, { kind: "options" }>["scored"] = null;
      if (question.type === "singleChoice" && question.scores) {
        const values = sets.map((set) => valueOf(question, own(set.answers, question.id))).filter((value): value is number => value !== null);
        scored = { total: values.reduce((sum, value) => sum + value, 0), mean: meanOf(values), unit: question.look === "points" ? "" : (question.scoreUnit ?? "") };
      }
      return {
        kind: "options",
        id: question.id,
        number,
        title: question.title,
        multiple: question.type === "multipleChoice",
        respondents: total.respondents,
        options: total.options.map((option) => ({ label: option.label, count: option.count, percent: option.percent })),
        most,
        scored,
      };
    }
    case "rating":
      return {
        kind: "scale",
        id: question.id,
        number,
        title: question.title,
        min: 1,
        minLabel: question.rating?.minLabel ?? "",
        maxLabel: question.rating?.maxLabel ?? "",
        rows: [
          {
            label: "",
            respondents: total.respondents,
            counts: total.bands.map((band) => band.count),
            mean: total.mean,
            median: medianOf(sets.flatMap((set) => {
              const answer = own(set.answers, question.id);
              return answer && answer.type === "rating" ? [answer.value] : [];
            })),
          },
        ],
        promoterScore: null,
      };
    case "text":
      return {
        kind: "comments",
        id: question.id,
        number,
        title: question.title,
        respondents: total.respondents,
        comments: total.texts.map((text) => text.text),
      };
    case "images":
      // A survey asks no image question (`SURVEY_WORKSHEET_TYPES`).
      return null;
  }
}

export function surveyResults(items: readonly SurveyItem[], sets: readonly AnswerSet[]): QuestionResult[] {
  const numbers = questionNumbers(items);
  const out: QuestionResult[] = [];
  for (const question of surveyQuestionsOf(items)) {
    const number = numbers.get(question.id) ?? 0;
    if (isLinesQuestion(question)) out.push(linesResult(question, number, sets));
    else if (isScaleQuestion(question)) out.push(scaleResult(question, number, sets));
    else if (isPercentQuestion(question) || isNumberQuestion(question)) out.push(valueResult(question, number, sets));
    else {
      const result = choiceResult(question, number, sets);
      if (result) out.push(result);
    }
  }
  return out;
}
