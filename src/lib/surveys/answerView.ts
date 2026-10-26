import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { answerLimitOf, ratingScaleOf } from "@/lib/firestore/worksheets";
import type { SurveyDoc } from "@/lib/firestore/surveys";
import {
  isLinesQuestion,
  isNumberQuestion,
  isPercentQuestion,
  isScaleQuestion,
  questionNumbers,
  scoreOf,
  surveyPagesOf,
  type SurveyChoiceQuestion,
  type SurveyConsentPurpose,
  type SurveyItem,
} from "./items";
import { confidentialFactsFor } from "./personFacts";
import { offerFromProfile, profileFactsOf } from "./profileOffer";
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
 * Two things on it are the person's own, read for them alone: the answer a
 * menu question starts on, from their profile where it holds it, and an
 * answer of theirs to an earlier survey of the programme that a question
 * shows above itself.
 *
 * Reading this page writes nothing: no record that it was opened, ever.
 */

type Base = {
  id: string;
  number: number;
  title: string;
  /** A line under the words, or "". */
  hint: string;
  /** The person's own earlier answer shown above the question, in words, or "". */
  piped: string;
};

export type AnswerOption = { id: string; label: string; /** "0" to "5" for a described point, or "". */ point: string };

export type AnswerQuestion =
  | (Base & {
      kind: "choice";
      multiple: boolean;
      /** "rows": a ticked row each; "points": each row shows its number; "menu": one menu. */
      look: "rows" | "points" | "menu";
      options: AnswerOption[];
      /** Pick any: at most this many, or 0 for no limit. */
      maxPicks: number;
      /** Pick any, then one of those ticked: the words of that second part, or "". */
      most: string;
      /** The option a menu starts on, from the person's profile, or "". */
      offered: string;
    })
  | (Base & { kind: "lines"; max: number; minLabel: string; maxLabel: string; points: string[]; lines: { id: string; label: string }[] })
  | (Base & { kind: "rating"; max: number; minLabel: string; maxLabel: string })
  | (Base & { kind: "scale"; min: number; max: number; anchors: { at: number; label: string }[] })
  | (Base & { kind: "percent"; minLabel: string; maxLabel: string })
  | (Base & { kind: "number"; max: number })
  | (Base & { kind: "text"; long: boolean; maxLength: number });

/** A consent block as the page draws it: its statement, then its boxes, unticked. */
export type AnswerConsent = { id: string; statement: string; boxes: { purpose: SurveyConsentPurpose; label: string }[] };

export type AnswerPage = { heading: string; questions: AnswerQuestion[]; consents: AnswerConsent[] };

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

/** What the page shows that is the person's own: a menu's offer by question id, and earlier answers in words. */
export type PersonalFacts = { offered: Record<string, string>; piped: Record<string, string> };

export const NO_PERSONAL_FACTS: PersonalFacts = { offered: {}, piped: {} };

function choiceQuestion(base: Base, item: SurveyChoiceQuestion, offered: string): AnswerQuestion {
  const multiple = item.type === "multipleChoice";
  const look = !multiple && item.look === "points" ? "points" : !multiple && item.look === "menu" ? "menu" : "rows";
  const options = (item.options ?? []).map((option) => {
    const score = scoreOf(item, option.id);
    return { id: option.id, label: option.label, point: look === "points" && score !== undefined ? String(score) : "" };
  });
  return {
    ...base,
    kind: "choice",
    multiple,
    look,
    options,
    maxPicks: multiple && item.maxPicks ? item.maxPicks : 0,
    most: multiple && item.most ? item.most : "",
    offered: look === "menu" && options.some((option) => option.id === offered) ? offered : "",
  };
}

/** The survey's questions and consent blocks, page by page, as the form draws them. */
export function answerPagesOf(survey: Pick<SurveyDoc, "items">, personal: PersonalFacts = NO_PERSONAL_FACTS): AnswerPage[] {
  const numbers = questionNumbers(survey.items);
  return surveyPagesOf(survey.items).map((items: SurveyItem[]) => {
    const section = items.find((item) => item.kind === "section");
    const questions: AnswerQuestion[] = [];
    const consents: AnswerConsent[] = [];
    for (const item of items) {
      if (item.kind === "consent") {
        consents.push({ id: item.id, statement: item.statement, boxes: item.boxes.map((box) => ({ purpose: box.purpose, label: box.label })) });
        continue;
      }
      if (item.kind !== "question") continue;
      const base: Base = {
        id: item.id,
        number: numbers.get(item.id) ?? 0,
        title: item.title,
        hint: item.hint ?? "",
        piped: personal.piped[item.id] ?? "",
      };
      if (isLinesQuestion(item)) {
        questions.push({
          ...base,
          kind: "lines",
          max: item.scale.max,
          minLabel: item.scale.points?.[0] ?? item.scale.minLabel,
          maxLabel: item.scale.points?.[item.scale.max - 1] ?? item.scale.maxLabel,
          points: item.scale.points ? [...item.scale.points] : [],
          lines: item.lines.map((line) => ({ id: line.id, label: line.label })),
        });
      } else if (isScaleQuestion(item)) {
        questions.push({ ...base, kind: "scale", min: item.min, max: item.max, anchors: item.anchors.map((anchor) => ({ ...anchor })) });
      } else if (isPercentQuestion(item)) {
        questions.push({ ...base, kind: "percent", minLabel: item.ends.min, maxLabel: item.ends.max });
      } else if (isNumberQuestion(item)) {
        questions.push({ ...base, kind: "number", max: item.max });
      } else if (item.type === "singleChoice" || item.type === "multipleChoice") {
        questions.push(choiceQuestion(base, item, personal.offered[item.id] ?? ""));
      } else if (item.type === "rating") {
        questions.push({
          ...base,
          kind: "rating",
          max: ratingScaleOf(item),
          minLabel: item.rating?.minLabel ?? "",
          maxLabel: item.rating?.maxLabel ?? "",
        });
      } else if (item.type === "shortText" || item.type === "longText") {
        const limit = answerLimitOf(item);
        questions.push({
          ...base,
          kind: "text",
          long: item.type === "longText",
          maxLength: limit.unit === "characters" ? limit.max : limit.max * 12,
        });
      }
    }
    return { heading: section && section.kind === "section" ? section.heading : "", questions, consents };
  });
}

/**
 * The answers a person's profile offers, for the survey's menu questions that
 * ask for them. Read for that person alone, and only the two values an offer
 * needs; a page with no such question reads nothing.
 */
export async function profileOffersFor(db: Firestore, survey: Pick<SurveyDoc, "items">, uid: string | null): Promise<Record<string, string>> {
  const asking = survey.items.filter(
    (item): item is SurveyChoiceQuestion => item.kind === "question" && item.type === "singleChoice" && (item as SurveyChoiceQuestion).profile !== undefined,
  );
  if (!uid || uid.includes("/") || asking.length === 0) return {};
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return {};
  const facts = profileFactsOf((snap.data() ?? {}) as Record<string, unknown>);
  const out: Record<string, string> = {};
  for (const question of asking) {
    const offered = offerFromProfile(question.profile!, facts, (question.options ?? []).map((option) => option.id));
    if (offered) out[question.id] = offered;
  }
  return out;
}

/**
 * The page for one person, or a message instead of it. `uid` is the person
 * the box is about: theirs on a personal link or signed in, nobody's on a
 * test.
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
  const [facts, offered] = await Promise.all([
    confidentialFactsFor(db, survey, input.uid),
    profileOffersFor(db, survey, input.uid),
  ]);
  const box = confidentialPoints(facts);
  return {
    state: "open",
    survey: {
      eyebrow: [programmeLine(survey.programmeKind, survey.programmeName), BEFORE_WEEK],
      title: survey.title,
      intro: paragraphsOf(survey.intro),
      box: { heading: CONFIDENTIAL_HEADING, points: box.points, note: box.note },
      pages: answerPagesOf(survey, { offered, piped: {} }),
      closing: closingWords(survey.closesAt),
      submit: input.submit,
    },
  };
}
