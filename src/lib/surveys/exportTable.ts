import { own } from "@/lib/applications/keys";
import type { SurveyAnswerVia } from "@/lib/firestore/surveys";
import { isChoiceOrTextQuestion, isLinesQuestion, questionNumbers, surveyQuestionsOf, type SurveyAnswer, type SurveyItem } from "./items";

/**
 * THE SPREADSHEET OF A SURVEY'S ANSWERS, WITH NAMES, for admins: one row per
 * person who answered, one column per question (a "1 to 5 for each line"
 * question gets a column per line). It is a download the site logs
 * (`dataExports`, kind `survey-answers`) before it is handed over.
 *
 * Names only, never an email address. An answer whose name has come off is a
 * row without one. Choices are written as their words, several picks joined
 * by "; ", and "which mattered most" gets a column of its own; a scale, a
 * percentage or a number is written as the number given. Dates are the
 * London day and time.
 *
 * Pure: the route reads, this lays out.
 */

export type ExportRow = {
  /** The person's name, or null once it has come off. */
  name: string | null;
  sentAt: Date | null;
  via: SurveyAnswerVia;
  afterFirstSession: boolean;
  answers: Record<string, SurveyAnswer>;
};

export const NAME_TAKEN_OFF = "(name taken off)";

function when(at: Date | null): string {
  if (!at) return "";
  const parts: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * One column of the answers, as the spreadsheet and the Answers tab both lay
 * it out: its question's id, its heading, and how one person's answers fill
 * it. One function, so the tab an admin reads is the file they download.
 */
export type AnswerColumn = { questionId: string; header: string; cell: (answers: Record<string, SurveyAnswer>) => string };

export function answerColumns(items: readonly SurveyItem[]): AnswerColumn[] {
  const numbers = questionNumbers(items);
  const columns: AnswerColumn[] = [];
  for (const question of surveyQuestionsOf(items)) {
    const number = numbers.get(question.id) ?? 0;
    if (isLinesQuestion(question)) {
      for (const line of question.lines) {
        columns.push({
          questionId: question.id,
          header: `${number}. ${question.title}: ${line.label}`,
          cell: (answers) => {
            const answer = own(answers, question.id);
            const value = answer && answer.type === "lines" ? own(answer.values, line.id) : undefined;
            return typeof value === "number" ? String(value) : "";
          },
        });
      }
      continue;
    }
    if (!isChoiceOrTextQuestion(question)) {
      // A scale, a percentage or a number: the number given.
      columns.push({
        questionId: question.id,
        header: `${number}. ${question.title}`,
        cell: (answers) => {
          const answer = own(answers, question.id);
          return answer && (answer.type === "scale" || answer.type === "percent" || answer.type === "number") ? String(answer.value) : "";
        },
      });
      continue;
    }
    const labelOf = (id: string) => question.options?.find((option) => option.id === id)?.label ?? "";
    columns.push({
      questionId: question.id,
      header: `${number}. ${question.title}`,
      cell: (answers) => {
        const answer = own(answers, question.id);
        if (!answer) return "";
        switch (answer.type) {
          case "choice":
            return labelOf(answer.optionId);
          case "choices":
            return answer.optionIds.map(labelOf).filter(Boolean).join("; ");
          case "rating":
            return String(answer.value);
          case "text":
            return answer.text;
          default:
            return "";
        }
      },
    });
    if (question.type === "multipleChoice" && question.most) {
      columns.push({
        questionId: question.id,
        header: `${number}. ${question.title}: ${question.most}`,
        cell: (answers) => {
          const answer = own(answers, question.id);
          return answer && answer.type === "choices" && answer.most ? labelOf(answer.most) : "";
        },
      });
    }
  }
  return columns;
}

export function surveyExportTable(items: readonly SurveyItem[], rows: readonly ExportRow[]): { header: string[]; rows: string[][] } {
  const columns = answerColumns(items);
  const header = ["Name", "Sent", "How", "After their first session", ...columns.map((column) => column.header)];
  const sorted = [...rows].sort(
    (a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿", "en") || (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0),
  );
  return {
    header,
    rows: sorted.map((row) => [
      row.name ?? NAME_TAKEN_OFF,
      when(row.sentAt),
      row.via === "signed-in" ? "Signed in" : "Personal link",
      row.afterFirstSession ? "Yes" : "No",
      ...columns.map((column) => column.cell(row.answers)),
    ]),
  };
}

/** "agi-strategy-before-answers-2026-11-05.csv". */
export function exportFilename(name: string, today: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "survey"}-answers-${today}.csv`;
}
