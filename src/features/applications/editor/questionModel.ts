import { APPLICATION_LIMITS, type QuestionType } from "@/lib/applications/model";
import type { QuestionSetView, QuestionView } from "@/lib/applications/editor/views";
import type { QuestionPatch } from "./editorClient";

/**
 * The question list as the editor holds it while somebody is typing.
 *
 * A question on screen is not always a question the server has: one just
 * added has no id yet, and one half typed has no text. So each carries a
 * `key` of the editor's own that never changes, and its `id` is whatever the
 * server last said, or null. The whole set is sent on each save, and the
 * server's answer is matched back to these by position.
 *
 * `firstProblem` is the same reading the route gives a body, done first in
 * the browser, so a question nobody has finished writing is held back with a
 * sentence instead of being sent to be refused.
 *
 * Pure: no React and no fetch, so the rules can be read in one place.
 */

export type LocalQuestion = Omit<QuestionView, "id"> & {
  /** The editor's own handle. Stable for as long as the page is open. */
  key: string;
  /** The stored id, or null until the server has stored it. */
  id: string | null;
};

export type LocalSet = Omit<QuestionSetView, "questions"> & { questions: LocalQuestion[] };

let nextKey = 0;

/** A handle for a question made on this page, which no stored question can have. */
function newKey(): string {
  nextKey += 1;
  return `new:${nextKey}`;
}

/**
 * A stored question's handle comes from its ids, so the server's render and
 * the browser's first render give the same question the same handle.
 */
export function toLocalSet(set: QuestionSetView): LocalSet {
  return {
    ...set,
    questions: set.questions.map((question) => ({
      ...question,
      key: `${set.id}/${question.id}`,
    })),
  };
}

/** A blank question for a set, scored the way the set is. */
export function blankQuestion(scored: boolean): LocalQuestion {
  return {
    key: newKey(),
    id: null,
    text: "",
    help: "",
    type: "long",
    options: [],
    optionsFromRanking: false,
    wordLimit: null,
    required: true,
    scored,
  };
}

/** A copy of a question, to sit beneath it. The server gives it its own id. */
export function duplicateQuestion(question: LocalQuestion): LocalQuestion {
  return { ...question, key: newKey(), id: null, options: [...question.options] };
}

export function takesOptions(type: QuestionType): boolean {
  return type === "choice" || type === "multi" || type === "scale";
}

export function takesWordLimit(type: QuestionType): boolean {
  return type === "short" || type === "long";
}

/** What a question is sent as: only what its type uses. */
export function toPatch(question: LocalQuestion): QuestionPatch {
  const fromRanking = question.type === "choice" && question.optionsFromRanking;
  return {
    id: question.id,
    text: question.text.trim(),
    help: question.help.trim(),
    type: question.type,
    options:
      takesOptions(question.type) && !fromRanking
        ? question.options.map((option) => option.trim()).filter(Boolean)
        : [],
    optionsFromRanking: fromRanking,
    wordLimit: takesWordLimit(question.type) ? question.wordLimit : null,
    required: question.required,
    scored: question.scored,
  };
}

/**
 * What stops this list being saved, as a sentence, or null. The same checks
 * the route makes, in the same words.
 */
export function firstProblem(questions: readonly LocalQuestion[]): string | null {
  const L = APPLICATION_LIMITS;
  for (const [at, question] of questions.entries()) {
    const name = `Question ${at + 1}`;
    const patch = toPatch(question);
    if (!patch.text) return `${name} needs its text.`;
    if (patch.text.length > L.questionText) {
      return `${name} is ${patch.text.length - L.questionText} characters over its limit of ${L.questionText}.`;
    }
    if (takesOptions(patch.type) && !patch.optionsFromRanking) {
      if (patch.options.length < 2) return `${name} needs at least 2 options.`;
      const repeated = patch.options.find((option, index) => patch.options.indexOf(option) !== index);
      if (repeated) return `${name} lists “${repeated}” twice.`;
    }
    if (
      patch.wordLimit !== null &&
      (!Number.isInteger(patch.wordLimit) || patch.wordLimit < 1 || patch.wordLimit > L.maxWordLimit)
    ) {
      return `${name}’s word limit must be a whole number between 1 and ${L.maxWordLimit}.`;
    }
  }
  return null;
}

/** A list with one item moved from one place to another. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
