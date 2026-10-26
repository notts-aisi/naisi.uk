import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { own } from "@/lib/applications/keys";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import { answerLimitOf, ratingScaleOf } from "@/lib/firestore/worksheets";
import { asksKairos, asksQuotes, type SurveyDoc, type SurveyPersonDoc } from "@/lib/firestore/surveys";
import { kairosChoicesOf } from "@/lib/kairos/choice";
import { sharesWithKairos } from "@/lib/kairos/model";
import { consentSurveyIdFor, consentsAskedOf, followUpsHolderFor } from "./consent";
import {
  isLinesQuestion,
  isNumberQuestion,
  isPercentQuestion,
  isQuotable,
  isScaleQuestion,
  questionNumbers,
  scoreOf,
  surveyPagesOf,
  surveyQuestionsOf,
  type SurveyChoiceQuestion,
  type SurveyConsentPurpose,
  type SurveyItem,
} from "./items";
import { confidentialFactsFor, hiddenLinesFor } from "./personFacts";
import { offerFromProfile, profileFactsOf } from "./profileOffer";
import { chainOf, closedOn, isOpen, ownAnswerOf } from "./repo";
import {
  BEFORE_WEEK,
  CONFIDENTIAL_HEADING,
  CONSENT_WORDS,
  STATE_WORDS,
  closingWords,
  confidentialPoints,
  paragraphsOf,
  pipeTestWords,
  pipedWords,
  programmeLine,
  weekWords,
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
  | (Base & {
      kind: "text";
      long: boolean;
      maxLength: number;
      /** Whether "You can quote this, without my name" is drawn under it, unticked: a long answer on a survey that asks for the tick. */
      quote: boolean;
    });

/** A consent block as the page draws it: its statement, then its boxes, unticked. */
export type AnswerConsent = { id: string; statement: string; boxes: { purpose: SurveyConsentPurpose; label: string }[] };

export type AnswerPage = { heading: string; questions: AnswerQuestion[]; consents: AnswerConsent[] };

/** Where the answers go: the person's own link, their own session, or nowhere (a test). */
export type AnswerSubmit = { kind: "link"; token: string } | { kind: "signed-in"; surveyId: string } | { kind: "test" };

/**
 * The Kairos choice at the end of the form, starting where the person's own
 * record stands: "no" ticks "Don't share my details with Kairos" before they
 * touch it, "shared" leaves it unticked. A test starts as shared, the
 * default, and keeps nothing.
 */
export type AnswerKairos = { said: "shared" | "no" };

export type AnswerSurvey = {
  /** "Fellowship: AGI Strategy", "Week 1". */
  eyebrow: string[];
  title: string;
  intro: string[];
  box: { heading: string; points: string[]; note: string };
  pages: AnswerPage[];
  /** "It closes on Wed 4 Nov. Once sent, your answers can’t change.", the second sentence alone for a leaving survey. */
  closing: string;
  submit: AnswerSubmit;
  /** The Kairos choice the form ends with, on every programme survey; null on any other. */
  kairos: AnswerKairos | null;
};

/**
 * A consent the person can change on their own page: where it stands, the
 * button that changes it to `sets`, and the words once it has. Never shown on
 * a test link.
 */
export type ConsentPanel = {
  purpose: SurveyConsentPurpose;
  line: string;
  button: string;
  sets: boolean;
  /** The line once it has changed, and the button that changes it back. */
  after: { line: string; button: string; done: string };
  submit: { kind: "link"; token: string } | { kind: "signed-in"; surveyId: string };
};

export type AnswerScreen =
  | { state: "open"; survey: AnswerSurvey; consent: ConsentPanel | null }
  | { state: "message"; title: string; body: string; consent: ConsentPanel | null };

/**
 * What the page shows that is the person's own: a menu's offer by question
 * id, earlier answers in words, the consent boxes they are asked (the survey
 * at the end asks the follow-ups box only of somebody the before survey never
 * asked), and the lines they are not shown (the Facilitator line, to somebody
 * who facilitates a group of the run). `asked` absent means every box the
 * survey holds.
 */
export type PersonalFacts = {
  offered: Record<string, string>;
  piped: Record<string, string>;
  asked?: readonly SurveyConsentPurpose[];
  /** The lines of a lines question this person is not shown (`hiddenLinesFor`). Absent means none. */
  hiddenLines?: readonly string[];
};

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

/**
 * The survey's questions and consent blocks, page by page, as the form draws
 * them. Each long answer says whether the box "You can quote this, without
 * my name" goes under it: on every survey that asks for the tick
 * (`asksQuotes`), and on no other.
 */
export function answerPagesOf(survey: Pick<SurveyDoc, "items" | "kind">, personal: PersonalFacts = NO_PERSONAL_FACTS): AnswerPage[] {
  const quotes = asksQuotes(survey);
  const numbers = questionNumbers(survey.items);
  return surveyPagesOf(survey.items).map((items: SurveyItem[]) => {
    const section = items.find((item) => item.kind === "section");
    const questions: AnswerQuestion[] = [];
    const consents: AnswerConsent[] = [];
    for (const item of items) {
      if (item.kind === "consent") {
        const boxes = item.boxes.filter((box) => !personal.asked || personal.asked.includes(box.purpose));
        if (boxes.length > 0) consents.push({ id: item.id, statement: item.statement, boxes: boxes.map((box) => ({ purpose: box.purpose, label: box.label })) });
        continue;
      }
      if (item.kind !== "question") continue;
      const base: Base = {
        id: item.id,
        number: numbers.get(item.id) ?? 0,
        title: item.title,
        hint: item.hint ?? "",
        piped: own(personal.piped, item.id) ?? "",
      };
      if (isLinesQuestion(item)) {
        questions.push({
          ...base,
          kind: "lines",
          max: item.scale.max,
          minLabel: item.scale.points?.[0] ?? item.scale.minLabel,
          maxLabel: item.scale.points?.[item.scale.max - 1] ?? item.scale.maxLabel,
          points: item.scale.points ? [...item.scale.points] : [],
          lines: item.lines
            .filter((line) => !personal.hiddenLines?.includes(line.id))
            .map((line) => ({ id: line.id, label: line.label })),
        });
      } else if (isScaleQuestion(item)) {
        questions.push({ ...base, kind: "scale", min: item.min, max: item.max, anchors: item.anchors.map((anchor) => ({ ...anchor })) });
      } else if (isPercentQuestion(item)) {
        questions.push({ ...base, kind: "percent", minLabel: item.ends.min, maxLabel: item.ends.max });
      } else if (isNumberQuestion(item)) {
        questions.push({ ...base, kind: "number", max: item.max });
      } else if (item.type === "singleChoice" || item.type === "multipleChoice") {
        questions.push(choiceQuestion(base, item, own(personal.offered, item.id) ?? ""));
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
          quote: quotes && isQuotable(item),
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
 * Each question's earlier answer of the person's own, in words, for the
 * questions that show one: their answer to the question it names, on the
 * earliest survey of the programme that asks it. A test shows where it would
 * go. Read for that person alone.
 */
export async function pipedAnswersFor(db: Firestore, survey: SurveyDoc, uid: string | null, test: boolean): Promise<Record<string, string>> {
  const piping = surveyQuestionsOf(survey.items).filter((question) => question.pipe);
  if (piping.length === 0) return {};
  if (test) return Object.fromEntries(piping.map((question) => [question.id, pipeTestWords(question.pipe!.words)]));
  if (!uid) return {};
  const chain = await chainOf(db, survey);
  const out: Record<string, string> = {};
  for (const question of piping) {
    const pipe = question.pipe!;
    const source = chain.find((earlier) =>
      surveyQuestionsOf(earlier.items).some((asked) => asked.id === pipe.from && (asked.type === "shortText" || asked.type === "longText")),
    );
    if (!source) continue;
    const answers = (await ownAnswerOf(db, source, uid))?.answers;
    const answer = answers ? own(answers, pipe.from) : undefined;
    if (answer && answer.type === "text" && answer.text.trim()) out[question.id] = pipedWords(pipe.words, answer.text.trim());
  }
  return out;
}

/** The last teaching week of a run, from its week plan, or null. */
async function lastWeekOf(db: Firestore, runId: string): Promise<number | null> {
  if (!runId || runId.includes("/")) return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists) return null;
  const weeks = normalizeCourseRun(snap.id, snap.data() ?? {}).weekPlan.flatMap((entry) => (entry.kind === "week" ? [entry.weekNumber] : []));
  return weeks.length > 0 ? Math.max(...weeks) : null;
}

/** Beside the programme at the top: "Week 1" before it, its last week at its end, nothing on a follow-up. */
async function eyebrowFor(db: Firestore, survey: SurveyDoc): Promise<string[]> {
  const programme = programmeLine(survey.programmeKind, survey.programmeName);
  if (survey.kind === "before") return [programme, BEFORE_WEEK];
  if (survey.kind === "after") {
    const last = await lastWeekOf(db, survey.runId);
    return last ? [programme, weekWords(last)] : [programme];
  }
  return [programme];
}

/**
 * The follow-ups consent the person can change from this page, or null: on a
 * survey whose form asks them the box, once it can no longer be answered
 * there; on any other survey of the programme, always. Where it stands is
 * read from the one row that holds their word (`followUpsHolderFor`).
 */
async function consentPanelFor(
  db: Firestore,
  survey: SurveyDoc,
  person: SurveyPersonDoc | null,
  submit: AnswerSubmit,
  formShown: boolean,
  asked: readonly SurveyConsentPurpose[],
): Promise<ConsentPanel | null> {
  if (!person || submit.kind === "test") return null;
  if (!consentSurveyIdFor(survey, "followUps")) return null;
  // A form that asks the box shows the box while it can be answered.
  if (formShown && asked.includes("followUps")) return null;
  const holder = await followUpsHolderFor(db, survey, person.respondent);
  if (!holder) return null;
  const row = holder.row;
  const given = row.consents.followUps === true;
  const words = CONSENT_WORDS.followUps;
  const yes = { line: words.yes, button: words.stop, done: words.started };
  const no = { line: words.no, button: words.start, done: words.stopped };
  const now = given ? yes : no;
  const then = given ? no : yes;
  return {
    purpose: "followUps",
    line: now.line,
    button: now.button,
    sets: !given,
    after: { line: then.line, button: then.button, done: then.done },
    submit,
  };
}

/**
 * Where the Kairos choice starts for this person: their own record, read for
 * them alone through its one reader, on a programme survey. A test starts as
 * shared and reads nobody's.
 */
async function kairosFor(db: Firestore, survey: SurveyDoc, uid: string | null, submit: AnswerSubmit): Promise<AnswerKairos | null> {
  if (!asksKairos(survey)) return null;
  if (submit.kind === "test" || !uid) return { said: "shared" };
  const choice = (await kairosChoicesOf(db, [uid])).get(uid);
  return { said: sharesWithKairos(choice) ? "shared" : "no" };
}

/**
 * The page for one person, or a message instead of it. `uid` is the person
 * the box is about: theirs on a personal link or signed in, nobody's on a
 * test. `person` is their row on this survey, for what they can change here.
 */
export async function answerScreenFor(
  db: Firestore,
  survey: SurveyDoc,
  input: {
    uid: string | null;
    answered: boolean;
    answeredAt: Date | null;
    submit: AnswerSubmit;
    now: Date;
    person?: SurveyPersonDoc | null;
  },
): Promise<AnswerScreen> {
  const person = input.person ?? null;
  const asked = await consentsAskedOf(db, survey, input.submit.kind === "test" ? null : (person?.respondent ?? null));
  const message = async (words: { title: string; body: string }): Promise<AnswerScreen> => ({
    state: "message",
    ...words,
    consent: await consentPanelFor(db, survey, person, input.submit, false, asked),
  });
  if (input.answered) return message(STATE_WORDS.answered(input.answeredAt));
  const test = input.submit.kind === "test";
  if (!test && !isOpen(survey, input.now)) {
    const on = closedOn(survey);
    return on ? message(STATE_WORDS.closed(on)) : { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  }
  // Every survey closes on a day but the leaving survey, which takes answers until it is closed by hand.
  if ((!survey.closesAt && survey.kind !== "leaving") || !survey.namesOffOn) return { state: "message", ...STATE_WORDS.noSurvey, consent: null };
  const [facts, offered, piped, eyebrow, consent, kairos, hiddenLines] = await Promise.all([
    confidentialFactsFor(db, survey, input.uid),
    profileOffersFor(db, survey, input.uid),
    pipedAnswersFor(db, survey, input.uid, test),
    eyebrowFor(db, survey),
    consentPanelFor(db, survey, person, input.submit, true, asked),
    kairosFor(db, survey, input.uid, input.submit),
    hiddenLinesFor(db, survey, input.uid),
  ]);
  const box = confidentialPoints(facts);
  return {
    state: "open",
    survey: {
      eyebrow,
      title: survey.title,
      intro: paragraphsOf(survey.intro),
      box: { heading: CONFIDENTIAL_HEADING, points: box.points, note: box.note },
      pages: answerPagesOf(survey, { offered, piped, asked, hiddenLines }),
      closing: closingWords(survey.closesAt),
      submit: input.submit,
      kairos,
    },
    consent,
  };
}
