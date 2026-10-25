import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { answerLimitOf, ratingScaleOf } from "@/lib/firestore/worksheets";
import type { SurveyDoc } from "@/lib/firestore/surveys";
import { isLinesQuestion, questionNumbers, surveyPagesOf } from "./items";
import { confidentialFactsFor } from "./personFacts";
import { closedOn, isOpen } from "./repo";
import {
  BEFORE_WEEK,
  CONFIDENTIAL_HEADING,
  STATE_WORDS,
  closingWords,
  confidentialPoints,
  paragraphsOf,
  programmeLine,
} from "./words";

/**
 * WHAT THE ANSWER PAGE IS HANDED (sv-before-phone), built on the server for
 * one person: the survey's words and questions as plain values, the
 * confidential box with the names it gives, and where "Send my answers"
 * goes. Never a stored document, never a secret but the person's own (the
 * one already in their address), and nothing about anybody else.
 *
 * Reading this page writes nothing: no record that it was opened, ever.
 */

export type AnswerQuestion =
  | { kind: "choice"; id: string; number: number; title: string; multiple: boolean; options: { id: string; label: string }[] }
  | { kind: "lines"; id: string; number: number; title: string; max: number; minLabel: string; maxLabel: string; lines: { id: string; label: string }[] }
  | { kind: "rating"; id: string; number: number; title: string; max: number; minLabel: string; maxLabel: string }
  | { kind: "text"; id: string; number: number; title: string; long: boolean; maxLength: number };

export type AnswerPage = { heading: string; questions: AnswerQuestion[] };

/** Where the answers go: the person's own link, their own session, or nowhere (a test). */
export type AnswerSubmit = { kind: "link"; token: string } | { kind: "signed-in"; surveyId: string } | { kind: "test" };

export type AnswerSurvey = {
  /** "Fellowship: AGI Strategy", "Week 1". */
  eyebrow: string[];
  title: string;
  intro: string[];
  box: { heading: string; points: string[]; note: string };
  pages: AnswerPage[];
  /** "It closes on Wed 4 Nov. Once sent, your answers can’t change." */
  closing: string;
  submit: AnswerSubmit;
};

export type AnswerScreen =
  | { state: "open"; survey: AnswerSurvey }
  | { state: "message"; title: string; body: string };

/** The survey's questions, page by page, as the form draws them. */
export function answerPagesOf(survey: Pick<SurveyDoc, "items">): AnswerPage[] {
  const numbers = questionNumbers(survey.items);
  return surveyPagesOf(survey.items).map((items) => {
    const section = items.find((item) => item.kind === "section");
    const questions: AnswerQuestion[] = [];
    for (const item of items) {
      if (item.kind !== "question") continue;
      const number = numbers.get(item.id) ?? 0;
      if (isLinesQuestion(item)) {
        questions.push({
          kind: "lines",
          id: item.id,
          number,
          title: item.title,
          max: item.scale.max,
          minLabel: item.scale.minLabel,
          maxLabel: item.scale.maxLabel,
          lines: item.lines.map((line) => ({ id: line.id, label: line.label })),
        });
      } else if (item.type === "singleChoice" || item.type === "multipleChoice") {
        questions.push({
          kind: "choice",
          id: item.id,
          number,
          title: item.title,
          multiple: item.type === "multipleChoice",
          options: (item.options ?? []).map((option) => ({ id: option.id, label: option.label })),
        });
      } else if (item.type === "rating") {
        const max = ratingScaleOf(item);
        questions.push({
          kind: "rating",
          id: item.id,
          number,
          title: item.title,
          max,
          minLabel: item.rating?.minLabel ?? "",
          maxLabel: item.rating?.maxLabel ?? "",
        });
      } else if (item.type === "shortText" || item.type === "longText") {
        const limit = answerLimitOf(item);
        questions.push({
          kind: "text",
          id: item.id,
          number,
          title: item.title,
          long: item.type === "longText",
          maxLength: limit.unit === "characters" ? limit.max : limit.max * 12,
        });
      }
    }
    return { heading: section && section.kind === "section" ? section.heading : "", questions };
  });
}

/**
 * The page for one person, or a message instead of it. `uid` is the person
 * the box is about: theirs on a personal link or signed in, the presser's on
 * a test.
 */
export async function answerScreenFor(
  db: Firestore,
  survey: SurveyDoc,
  input: { uid: string | null; answered: boolean; answeredAt: Date | null; submit: AnswerSubmit; now: Date },
): Promise<AnswerScreen> {
  if (input.answered) return { state: "message", ...STATE_WORDS.answered(input.answeredAt) };
  const test = input.submit.kind === "test";
  if (!test && !isOpen(survey, input.now)) {
    const on = closedOn(survey);
    return on ? { state: "message", ...STATE_WORDS.closed(on) } : { state: "message", ...STATE_WORDS.noSurvey };
  }
  if (!survey.closesAt || !survey.namesOffOn) return { state: "message", ...STATE_WORDS.noSurvey };
  const facts = await confidentialFactsFor(db, survey, input.uid);
  const box = confidentialPoints(facts);
  return {
    state: "open",
    survey: {
      eyebrow: [programmeLine(survey.programmeKind, survey.programmeName), BEFORE_WEEK],
      title: survey.title,
      intro: paragraphsOf(survey.intro),
      box: { heading: CONFIDENTIAL_HEADING, points: box.points, note: box.note },
      pages: answerPagesOf(survey),
      closing: closingWords(survey.closesAt),
      submit: input.submit,
    },
  };
}
