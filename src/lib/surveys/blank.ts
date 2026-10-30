import { missingRequired, questionNumbers, type SurveyItem } from "./items";
import { missingWords } from "./words";

/**
 * REQUIRED QUESTIONS LEFT BLANK, as an answer route refuses them (Zach, 30
 * Oct 2026: every survey question is required unless marked optional): a 400
 * naming them by number in words ("Question 3 still needs an answer.") and by
 * id for the form (`missing`, in the survey's order), or null when every
 * required question is answered.
 *
 * Asked of the answers as they will be kept, before anything is written, by
 * both writers: `recordAnswer` (a programme's surveys and the leaving survey)
 * and `recordEventAnswer` (a survey after an event). `hiddenLines` are the
 * grid lines the person was not shown (`hiddenLinesFor`).
 *
 * Pure: the answer form says the same words before it sends.
 */
export type BlankRefusal = { ok: false; status: 400; error: string; missing: string[] };

export function blankRefusal(items: readonly SurveyItem[], answers: unknown, hiddenLines: readonly string[] = []): BlankRefusal | null {
  const missing = missingRequired(items, answers, { hiddenLines });
  if (missing.length === 0) return null;
  const numbers = questionNumbers(items);
  return { ok: false, status: 400, error: missingWords(missing.map((id) => numbers.get(id) ?? 0)), missing };
}
