/**
 * The AI at Nottingham survey's totals: for each question and each line, how
 * many chose each answer.
 *
 * Pure. Given the answer sets and the definition it returns numbers and
 * nothing else: no answer set, no comment, nothing that could be one person.
 *
 * THE DENOMINATORS, because every share on the page depends on which one it
 * is:
 *  - a count is out of the answer sets that SAVED THE QUESTION'S PAGE. Somebody
 *    who stopped at page 3 is not counted as having skipped page 9;
 *  - a SHARE on an agree or support scale is out of the people WHO GAVE A VIEW
 *    on that line: "Don't know" and "Don't know enough" sit outside the scale
 *    and are left out, and so are blanks. The number with a view is always
 *    shown beside the share, so a share of a handful is seen to be one.
 *
 * No floor is applied. These totals are for the one account that also holds
 * the export; a floor belongs on a page that is published.
 */
import { own } from "@/lib/applications/keys";
import { AI_SURVEY } from "./definition";
import type { AiSurveyAnswerSet, AiSurveyDefinition, AiSurveyPageAnswers } from "./types";

export type Count = { id: string; label: string; count: number };

export type LineTotals = {
  id: string;
  label: string;
  counts: Count[];
  /** How many chose an answer ON the scale. */
  withAView: number;
  /** The top two answers of the scale, among those with a view: agree, or support. */
  inFavour: number;
  /** The bottom two: disagree, or oppose. */
  against: number;
};

export type QuestionTotals =
  | { kind: "options"; id: string; text: string; multi: boolean; answered: number; counts: Count[] }
  | { kind: "lines"; id: string; text: string | null; scale: string; twoSided: boolean; lines: LineTotals[] }
  | { kind: "comments"; id: string; text: string; written: number }
  | { kind: "tick"; id: string; text: string; ticked: number };

export type PageTotals = { id: string; heading: string; saved: number; questions: QuestionTotals[] };

export type SurveyTotals = { started: number; finished: number; pages: PageTotals[] };

export function surveyTotals(sets: readonly AiSurveyAnswerSet[], def: AiSurveyDefinition = AI_SURVEY): SurveyTotals {
  const pages: PageTotals[] = def.pages.map((page) => {
    const saved = sets.map((set) => set.pages[page.id]).filter((answers): answers is AiSurveyPageAnswers => Boolean(answers));
    const tally = (code: string, ids: string[]) => {
      const counts = new Map(ids.map((id) => [id, 0]));
      let answered = 0;
      for (const answers of saved) {
        const value = own(answers, code);
        const chosen = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
        if (chosen.length > 0) answered += 1;
        for (const id of chosen) if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      return { counts, answered };
    };

    const questions: QuestionTotals[] = page.questions.map((question): QuestionTotals => {
      switch (question.type) {
        case "single":
        case "multi": {
          const { counts, answered } = tally(question.id, question.options.map((o) => o.id));
          return {
            kind: "options",
            id: question.id,
            text: question.text,
            multi: question.type === "multi",
            answered,
            counts: question.options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 })),
          };
        }
        case "select": {
          const options = [...question.optionGroups.flatMap((g) => g.options), ...(question.extraOptions ?? [])];
          const { counts, answered } = tally(question.id, options.map((o) => o.id));
          return {
            kind: "options",
            id: question.id,
            text: question.text,
            multi: false,
            answered,
            counts: options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 })),
          };
        }
        case "mostOf": {
          const source = page.questions.find((q) => q.id === question.linesFrom);
          const lines = source && source.type === "lines" ? source.lines : [];
          const options = [...lines.map((l) => ({ id: l.id, label: l.short ?? l.text })), ...question.extraOptions];
          const { counts, answered } = tally(question.id, options.map((o) => o.id));
          return {
            kind: "options",
            id: question.id,
            text: question.text,
            multi: false,
            answered,
            counts: options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) ?? 0 })),
          };
        }
        case "lines": {
          const scale = def.scales[question.scale] ?? [];
          const onScale = scale.filter((a) => !a.outsideScale).map((a) => a.id);
          // A five-point scale has two answers either side of its middle. A
          // yes, no, not sure scale has no sides, so it gets counts alone.
          const twoSided = onScale.length === 5;
          return {
            kind: "lines",
            id: question.id,
            text: question.text,
            scale: question.scale,
            twoSided,
            lines: question.lines.map((line) => {
              const { counts } = tally(line.id, scale.map((a) => a.id));
              const of = (ids: string[]) => ids.reduce((n, id) => n + (counts.get(id) ?? 0), 0);
              return {
                id: line.id,
                label: line.short ?? line.text,
                counts: scale.map((a) => ({ id: a.id, label: a.label, count: counts.get(a.id) ?? 0 })),
                withAView: of(onScale),
                inFavour: twoSided ? of(onScale.slice(0, 2)) : 0,
                against: twoSided ? of(onScale.slice(3)) : 0,
              };
            }),
          };
        }
        case "text":
          return {
            kind: "comments",
            id: question.id,
            text: question.text,
            written: saved.filter((answers) => typeof own(answers, question.id) === "string").length,
          };
        case "tick":
          return {
            kind: "tick",
            id: question.id,
            text: question.text,
            ticked: saved.filter((answers) => own(answers, question.id) === true).length,
          };
      }
    });
    return { id: page.id, heading: page.heading, saved: saved.length, questions };
  });

  return { started: sets.length, finished: sets.filter((set) => set.finished).length, pages };
}

/** A share as a whole percentage, or null when there is nobody to take a share of. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
