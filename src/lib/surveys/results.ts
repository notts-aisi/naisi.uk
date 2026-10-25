import { aggregateQuestion, type RespondentAnswer } from "@/features/worksheets/aggregate";
import type { WorksheetAnswer } from "@/lib/firestore/worksheets";
import { own } from "@/lib/applications/keys";
import { isLinesQuestion, questionNumbers, surveyQuestionsOf, type SurveyAnswer, type SurveyItem, type SurveyLinesQuestion } from "./items";

/**
 * A SURVEY'S RESULTS: totals and comments, made on the server, never a name.
 *
 * Every question's totals are counted here from the stored answers and only
 * the numbers (and the words of any comment) leave for the page. Choice,
 * rating and text questions are counted by Worksheets' own `aggregateQuestion`,
 * which the circulation page uses; a "1 to 5 for each line" question is
 * counted line by line, each on its scale.
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
    }
  | {
      kind: "scale";
      id: string;
      number: number;
      title: string;
      minLabel: string;
      maxLabel: string;
      /** One row per line; a rating question is one row of its own. */
      rows: { label: string; respondents: number; counts: number[]; mean: number | null }[];
    }
  | { kind: "comments"; id: string; number: number; title: string; respondents: number; comments: string[] };

/** One person's answers, as results read them: no person, just the answers. */
export type AnswerSet = { answers: Record<string, SurveyAnswer> };

function linesResult(question: SurveyLinesQuestion, number: number, sets: readonly AnswerSet[]): QuestionResult {
  const max = question.scale.max;
  const rows = question.lines.map((line) => {
    const counts = new Array<number>(max).fill(0);
    let respondents = 0;
    let total = 0;
    for (const set of sets) {
      const answer = own(set.answers, question.id);
      if (!answer || answer.type !== "lines") continue;
      const value = own(answer.values, line.id);
      if (typeof value !== "number" || value < 1 || value > max) continue;
      counts[value - 1] += 1;
      respondents += 1;
      total += value;
    }
    return { label: line.label, respondents, counts, mean: respondents > 0 ? total / respondents : null };
  });
  return {
    kind: "scale",
    id: question.id,
    number,
    title: question.title,
    minLabel: question.scale.minLabel,
    maxLabel: question.scale.maxLabel,
    rows,
  };
}

export function surveyResults(items: readonly SurveyItem[], sets: readonly AnswerSet[]): QuestionResult[] {
  const numbers = questionNumbers(items);
  const out: QuestionResult[] = [];
  for (const question of surveyQuestionsOf(items)) {
    const number = numbers.get(question.id) ?? 0;
    if (isLinesQuestion(question)) {
      out.push(linesResult(question, number, sets));
      continue;
    }
    // Worksheets' counting asks for a uid beside each answer; results never
    // carry one, so none is handed over.
    const answers: RespondentAnswer[] = sets.map((set) => {
      const answer = own(set.answers, question.id);
      return { uid: "", answer: answer && answer.type !== "lines" ? (answer as WorksheetAnswer) : undefined };
    });
    const total = aggregateQuestion(question, answers);
    switch (total.kind) {
      case "options":
        out.push({
          kind: "options",
          id: question.id,
          number,
          title: question.title,
          multiple: question.type === "multipleChoice",
          respondents: total.respondents,
          options: total.options.map((option) => ({ label: option.label, count: option.count, percent: option.percent })),
        });
        break;
      case "rating":
        out.push({
          kind: "scale",
          id: question.id,
          number,
          title: question.title,
          minLabel: question.rating?.minLabel ?? "",
          maxLabel: question.rating?.maxLabel ?? "",
          rows: [{ label: "", respondents: total.respondents, counts: total.bands.map((band) => band.count), mean: total.mean }],
        });
        break;
      case "text":
        out.push({
          kind: "comments",
          id: question.id,
          number,
          title: question.title,
          respondents: total.respondents,
          comments: total.texts.map((text) => text.text),
        });
        break;
      case "images":
        // A survey asks no image question (`SURVEY_WORKSHEET_TYPES`).
        break;
    }
  }
  return out;
}
