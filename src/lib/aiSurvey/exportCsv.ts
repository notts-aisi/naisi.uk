/**
 * The AI at Nottingham survey's export: one row for each answer set, rows in
 * a random order, no ids and no times.
 *
 * Pure. The route hands it the answer sets and a source of randomness, and
 * gets the file's text back.
 *
 * What a cell holds:
 *  - a page the person never reached: `not_seen` in every one of its columns;
 *  - a question skipped on a page that was saved: an empty cell;
 *  - a multi-choice question: one column for each option, 1 or 0, and empty
 *    cells when the whole question was skipped;
 *  - a tick: 1 when ticked, empty when not;
 *  - "Don't know" and "Don't know enough": their own value, `dk`, never a
 *    sixth point of the scale.
 *
 * The order each person was shown the proposal pages is kept on the answer
 * set and NOT exported, and the rows are shuffled, so neither a row's place
 * nor anything in it says when it was written.
 */
import { toCSV } from "@/lib/csv";
import { answerColumns, AI_SURVEY } from "./definition";
import type { AiSurveyAnswerSet, AiSurveyDefinition } from "./types";

/** A whole number in [0, n), from a cryptographic source in production. */
export type RandomBelow = (n: number) => number;

/** Fisher-Yates, on a copy. */
export function shuffled<T>(items: readonly T[], randomBelow: RandomBelow): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function exportHeader(def: AiSurveyDefinition = AI_SURVEY): string[] {
  return ["finished", ...answerColumns(def).map((c) => c.name)];
}

export function exportRow(set: AiSurveyAnswerSet, def: AiSurveyDefinition = AI_SURVEY): string[] {
  const row: string[] = [set.finished ? "1" : "0"];
  for (const column of answerColumns(def)) {
    const page = set.pages[column.pageId];
    if (!page) {
      row.push(def.export.notReached);
      continue;
    }
    const value = page[column.code];
    if (column.kind === "multiOption") {
      row.push(Array.isArray(value) ? (value.includes(column.optionId) ? "1" : "0") : def.export.skipped);
    } else if (column.kind === "tick") {
      row.push(value === true ? "1" : def.export.skipped);
    } else {
      row.push(typeof value === "string" ? value : def.export.skipped);
    }
  }
  return row;
}

export function buildExport(
  sets: readonly AiSurveyAnswerSet[],
  randomBelow: RandomBelow,
  def: AiSurveyDefinition = AI_SURVEY,
): string {
  const rows = shuffled(sets, randomBelow).map((set) => exportRow(set, def));
  return `${toCSV(exportHeader(def), rows)}\n`;
}
