import { own } from "@/lib/applications/keys";
import {
  attributionWords,
  footerWords,
  headingWords,
  peopleNoun,
  type ProgrammeKind,
  type PublishedFigure,
  type PublishedNumber,
  type PublishedQuote,
} from "@/lib/publicNumbers/model";
import {
  isLinesQuestion,
  isQuotable,
  surveyQuestionsOf,
  type SurveyAnswer,
  type SurveyChoiceQuestion,
  type SurveyItem,
  type SurveyQuestion,
} from "./items";
import { meanOf, valueOf } from "./results";
import type { SurveyStage } from "./templates";

/**
 * WHAT AN ADMIN IS OFFERED FOR A PROGRAMME'S PUBLIC PAGE (sv-public): numbers
 * worked out from the programme's OWN surveys, each with the base it rests
 * on, and the comments their writers ticked "You can quote this, without my
 * name". Totals only: never a name, never one person's answer but the words
 * of a ticked comment.
 *
 * Rules a maintainer keeps:
 *
 *  - ONLY THE PROGRAMME'S OWN SURVEYS: its before survey, its survey at the
 *    end and its follow-ups (the loader, `./publicNumbersLoad.ts`, reads
 *    nothing else). Never the survey about leaving, a survey after an event,
 *    the anonymous form, the ratings or the Kairos file.
 *  - NO THRESHOLD (Zach, 26 Oct 2026). Admins choose what is published and
 *    when; every number carries how many answers it rests on, and the block's
 *    closing line says how many answered at the end and at the start too.
 *  - A FIXED LIST OF MEASURES, each a sentence that is true of the counting
 *    beside it, read by the questionnaire's fixed ids (`MEASURES`). Beliefs
 *    about AI are never one: they are reported, never targets.
 *    `tests/surveys-public-numbers.test.mjs` holds every question a measure
 *    reads.
 *  - PAIRS ARE BY PERSON: a before and after figure counts only the people
 *    who answered that question both times, while their names are on the
 *    answers.
 *  - ONLY A TICKED COMMENT IS EVER OFFERED: a long answer whose writer ticked
 *    the box (`quote: true`), and nothing else of any answer.
 *
 * Pure: the loader reads, this counts.
 */

/** One person's answers to one of the programme's surveys: the answer's id, their uid while their name is on it. */
export type OfferAnswer = { id: string; uid: string | null; answers: Record<string, SurveyAnswer> };

/** One of the programme's own surveys, as the offer reads it. */
export type OfferSurvey = {
  stage: SurveyStage;
  items: SurveyItem[];
  answers: OfferAnswer[];
  /** People it was sent to, by its own record of each send. */
  sent: number;
};

export type OfferInput = { kind: ProgrammeKind; term: string; surveys: OfferSurvey[] };

/** A number as the admins' page lists it: what the block would show, and the whole line beside its box. */
export type OfferedNumber = PublishedNumber & { label: string };

/** A comment its writer ticked, as the admins' page lists it. `id` is the answer's and the question's, never sent to a public page. */
export type OfferedQuote = { id: string; text: string };

export type PublicOffer = {
  numbers: OfferedNumber[];
  quotes: OfferedQuote[];
  /** "How autumn 2026 went." */
  heading: string;
  /** "Autumn 2026 fellow". */
  attribution: string;
  /** The closing line, or "" while the survey at the end has no answers. */
  footer: string;
};

// ---------------------------------------------------------------------------
// The measures
// ---------------------------------------------------------------------------

/** Every measure that can be offered, in the order the page lists them. */
export type MeasureId = "recommend" | "wanted" | "stage" | "explain" | "field" | "nextStep" | "towards" | "steps";

/** 9 or 10 out of 10 counts as recommending it: the promoters of the Kairos report's `promoterScoreOf`. */
const RECOMMENDS = 9;
/** C1's stage 2 ("One of several options I’m seriously considering") and up: considering, planning or already doing. */
const CONSIDERING = 2;
/** An agreement grid's "Agree" and "Strongly agree". */
const AGREES = 4;

/** The questions each measure reads, by the questionnaire's fixed ids. Nothing else of a survey is read for a number. */
export const MEASURE_QUESTIONS: Record<MeasureId, readonly string[]> = {
  recommend: ["q_q1"],
  wanted: ["q_q3"],
  stage: ["q_c1"],
  explain: ["q_c4"],
  field: ["q_c5"],
  nextStep: ["q_c7"],
  towards: ["q_a1"],
  steps: ["q_c9"],
};

function surveyOf(input: OfferInput, stage: SurveyStage): OfferSurvey | null {
  return input.surveys.find((survey) => survey.stage === stage) ?? null;
}

function questionOf(survey: OfferSurvey | null, id: string): SurveyQuestion | null {
  if (!survey) return null;
  return surveyQuestionsOf(survey.items).find((question) => question.id === id) ?? null;
}

/** "2.1": one decimal, always. */
function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

const ofWords = (count: number, of: number) => `${count} of ${of}`;
const answersBase = (n: number) => `From ${n} ${n === 1 ? "answer" : "answers"}`;
const bothBase = (n: number) => `From the ${n} who answered both`;

/** A number with one figure: its words go on from the figure ("23 of 27" "fellows would recommend it"). */
function one(id: MeasureId, value: string, words: string, n: number, base: string): OfferedNumber {
  return { id, figure: { kind: "one", value }, words, n, base, label: `${value} ${words}` };
}

/** A number at the start and at the end: its words name what is counted. */
function pair(id: MeasureId, start: string, end: string, words: string, n: number): OfferedNumber {
  return { id, figure: { kind: "pair", start, end }, words, n, base: bothBase(n), label: `${words}: ${start} at the start, ${end} at the end` };
}

/** Every answer's number for a question in a survey, names on or off. */
function allValues(survey: OfferSurvey, question: SurveyQuestion): number[] {
  return survey.answers.flatMap((answer) => {
    const value = valueOf(question, own(answer.answers, question.id));
    return value === null ? [] : [value];
  });
}

/**
 * The pairs (start, end) of people who answered a question in both surveys,
 * by uid. An answer whose name has come off pairs with nothing.
 */
function pairsOf<T>(
  before: OfferSurvey,
  after: OfferSurvey,
  readStart: (answers: Record<string, SurveyAnswer>) => T | null,
  readEnd: (answers: Record<string, SurveyAnswer>) => T | null,
): [T, T][] {
  const first = new Map<string, T>();
  for (const answer of before.answers) {
    const value = answer.uid ? readStart(answer.answers) : null;
    if (answer.uid && value !== null) first.set(answer.uid, value);
  }
  const out: [T, T][] = [];
  for (const answer of after.answers) {
    if (!answer.uid) continue;
    const start = first.get(answer.uid);
    const end = readEnd(answer.answers);
    if (start !== undefined && end !== null) out.push([start, end]);
  }
  return out;
}

function recommend(input: OfferInput): OfferedNumber | null {
  const after = surveyOf(input, "after");
  const question = questionOf(after, "q_q1");
  if (!after || !question || question.type !== "scale" || question.min !== 0 || question.max !== 10) return null;
  const values = allValues(after, question);
  if (values.length === 0) return null;
  const yes = values.filter((value) => value >= RECOMMENDS).length;
  const n = values.length;
  return one("recommend", ofWords(yes, n), `${peopleNoun(input.kind, n)} would recommend it`, n, `${answersBase(n)}, counting 9 or 10 out of 10`);
}

function wanted(input: OfferInput): OfferedNumber | null {
  const after = surveyOf(input, "after");
  const question = questionOf(after, "q_q3");
  if (!after || !question || question.type !== "scale") return null;
  const values = allValues(after, question);
  const mean = meanOf(values);
  if (mean === null) return null;
  return one("wanted", `${oneDecimal(mean)} out of ${question.max}`, "for getting what they wanted from it", values.length, answersBase(values.length));
}

/** How many of the people who answered a choose-one question picked one option. */
function picked(input: OfferInput, id: MeasureId, questionId: string, optionId: string, words: (noun: string) => string): OfferedNumber | null {
  const after = surveyOf(input, "after");
  const question = questionOf(after, questionId);
  // The option has to be on the question as sent: a count of an answer nobody could give says nothing.
  if (!after || !question || question.type !== "singleChoice") return null;
  if (!((question as SurveyChoiceQuestion).options ?? []).some((option) => option.id === optionId)) return null;
  const answered = after.answers.flatMap((answer) => {
    const given = own(answer.answers, question.id);
    return given && given.type === "choice" ? [given.optionId] : [];
  });
  if (answered.length === 0) return null;
  const n = answered.length;
  return one(id, ofWords(answered.filter((each) => each === optionId).length, n), words(peopleNoun(input.kind, n)), n, answersBase(n));
}

function steps(input: OfferInput): OfferedNumber | null {
  const after = surveyOf(input, "after");
  const question = questionOf(after, "q_c9");
  if (!after || !question || question.type !== "multipleChoice") return null;
  const none = (question as SurveyChoiceQuestion).noneIds ?? [];
  const answered = after.answers.flatMap((answer) => {
    const given = own(answer.answers, question.id);
    return given && given.type === "choices" ? [given.optionIds] : [];
  });
  if (answered.length === 0) return null;
  const n = answered.length;
  const took = answered.filter((ids) => ids.some((id) => !none.includes(id))).length;
  return one("steps", ofWords(took, n), `${peopleNoun(input.kind, n)} took a concrete step towards AI safety work while it ran`, n, answersBase(n));
}

/** A question asked before and at the end, compared for the people who answered it both times. */
function bothSurveys(input: OfferInput, questionId: string): { before: OfferSurvey; after: OfferSurvey; start: SurveyQuestion; end: SurveyQuestion } | null {
  const before = surveyOf(input, "before");
  const after = surveyOf(input, "after");
  const start = questionOf(before, questionId);
  const end = questionOf(after, questionId);
  if (!before || !after || !start || !end || start.type !== end.type) return null;
  return { before, after, start, end };
}

function stage(input: OfferInput): OfferedNumber | null {
  const both = bothSurveys(input, "q_c1");
  if (!both) return null;
  const pairs = pairsOf(
    both.before,
    both.after,
    (answers) => valueOf(both.start, own(answers, "q_c1")),
    (answers) => valueOf(both.end, own(answers, "q_c1")),
  );
  if (pairs.length === 0) return null;
  const n = pairs.length;
  const at = (side: 0 | 1) => pairs.filter((each) => each[side] >= CONSIDERING).length;
  return pair("stage", ofWords(at(0), n), ofWords(at(1), n), "Considering, planning or already doing work on AI safety", n);
}

/** The average of a scale, at the start and at the end, for the people who answered both. */
function averages(input: OfferInput, id: MeasureId, questionId: string, words: string): OfferedNumber | null {
  const both = bothSurveys(input, questionId);
  if (!both || both.end.type !== "scale") return null;
  const pairs = pairsOf(
    both.before,
    both.after,
    (answers) => valueOf(both.start, own(answers, questionId)),
    (answers) => valueOf(both.end, own(answers, questionId)),
  );
  const start = meanOf(pairs.map((each) => each[0]));
  const end = meanOf(pairs.map((each) => each[1]));
  if (start === null || end === null) return null;
  return pair(id, `${oneDecimal(start)} out of ${both.end.max}`, oneDecimal(end), words, pairs.length);
}

function nextStep(input: OfferInput): OfferedNumber | null {
  const both = bothSurveys(input, "q_c7");
  if (!both || !isLinesQuestion(both.end) || !both.end.lines.some((line) => line.id === "l_next")) return null;
  const read = (answers: Record<string, SurveyAnswer>) => {
    const given = own(answers, "q_c7");
    const value = given && given.type === "lines" ? own(given.values, "l_next") : undefined;
    return typeof value === "number" ? value : null;
  };
  const pairs = pairsOf(both.before, both.after, read, read);
  if (pairs.length === 0) return null;
  const n = pairs.length;
  const at = (side: 0 | 1) => pairs.filter((each) => each[side] >= AGREES).length;
  const number = pair("nextStep", ofWords(at(0), n), ofWords(at(1), n), "Know their next concrete step towards AI safety work", n);
  return { ...number, base: `${number.base}, counting agree and strongly agree` };
}

/** Every measure, in the order the page lists them. */
const MEASURES: { id: MeasureId; build: (input: OfferInput) => OfferedNumber | null }[] = [
  { id: "recommend", build: recommend },
  { id: "wanted", build: wanted },
  { id: "stage", build: stage },
  {
    id: "explain",
    build: (input) => averages(input, "explain", "q_c4", "Explaining the case that advanced AI could be catastrophic, and the main objections"),
  },
  {
    id: "field",
    build: (input) => averages(input, "field", "q_c5", "Knowing the field’s organisations, research agendas and policy debates"),
  },
  { id: "nextStep", build: nextStep },
  {
    id: "towards",
    build: (input) => picked(input, "towards", "q_a1", "o_towards", (noun) => `${noun} said it moved them towards AI safety`),
  },
  { id: "steps", build: steps },
];

export const MEASURE_IDS: readonly MeasureId[] = MEASURES.map((measure) => measure.id);

// ---------------------------------------------------------------------------
// The quotes
// ---------------------------------------------------------------------------

/** A comment's words as one paragraph: its line breaks and runs of space folded to one space. */
export function quoteText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Every comment its writer ticked "You can quote this, without my name", in
 * the programme's own surveys: a long answer with `quote: true`, and words.
 * In the order of the surveys and their questions, then by their words, so
 * the order says nothing of when each was written.
 */
export function tickedQuotes(input: OfferInput): OfferedQuote[] {
  const out: OfferedQuote[] = [];
  for (const survey of input.surveys) {
    for (const question of surveyQuestionsOf(survey.items)) {
      if (!isQuotable(question)) continue;
      const here: OfferedQuote[] = [];
      for (const answer of survey.answers) {
        const given = own(answer.answers, question.id);
        if (!given || given.type !== "text" || given.quote !== true) continue;
        const text = quoteText(given.text);
        if (text) here.push({ id: `${answer.id}.${question.id}`, text });
      }
      here.sort((a, b) => a.text.localeCompare(b.text) || a.id.localeCompare(b.id));
      out.push(...here);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The offer, and what is published from it
// ---------------------------------------------------------------------------

/** How many people who answered at the end answered the before survey too; null without a before survey. */
function answeredBoth(input: OfferInput): number | null {
  const before = surveyOf(input, "before");
  const after = surveyOf(input, "after");
  if (!before || !after) return null;
  const started = new Set(before.answers.flatMap((answer) => (answer.uid ? [answer.uid] : [])));
  return new Set(after.answers.flatMap((answer) => (answer.uid && started.has(answer.uid) ? [answer.uid] : []))).size;
}

export function buildOffer(input: OfferInput): PublicOffer {
  const after = surveyOf(input, "after");
  const answeredEnd = after?.answers.length ?? 0;
  return {
    numbers: MEASURES.flatMap((measure) => {
      const number = measure.build(input);
      return number ? [number] : [];
    }),
    quotes: tickedQuotes(input),
    heading: headingWords(input.term),
    attribution: attributionWords(input.term, input.kind),
    footer:
      after && answeredEnd > 0
        ? footerWords({ kind: input.kind, term: input.term, answeredEnd, sentEnd: after.sent, both: answeredBoth(input) })
        : "",
  };
}

/** The ids an admin picked: numbers by their measure, quotes by the offer's ids. */
export type Picks = { numbers: string[]; quotes: string[] };

export type PublishedBlock = { heading: string; numbers: PublishedNumber[]; quotes: PublishedQuote[]; attribution: string; footer: string };

/**
 * What Publish writes, from the offer as it stands now and the picks: the
 * figures, words and bases the offer holds this moment, in its order, and
 * each picked quote's words alone. A pick the offer no longer holds is
 * refused rather than dropped, so what is published is what was previewed.
 */
export function publishedFrom(offer: PublicOffer, picks: Picks): { ok: true; block: PublishedBlock } | { ok: false; why: "nothing" | "changed" | "notReady" } {
  const numberIds = new Set(picks.numbers);
  const quoteIds = new Set(picks.quotes);
  if (numberIds.size === 0 && quoteIds.size === 0) return { ok: false, why: "nothing" };
  if (!offer.footer) return { ok: false, why: "notReady" };
  for (const id of numberIds) if (!offer.numbers.some((number) => number.id === id)) return { ok: false, why: "changed" };
  for (const id of quoteIds) if (!offer.quotes.some((quote) => quote.id === id)) return { ok: false, why: "changed" };
  return {
    ok: true,
    block: {
      heading: offer.heading,
      numbers: offer.numbers
        .filter((number) => numberIds.has(number.id))
        .map((number) => ({ id: number.id, figure: copyFigure(number.figure), words: number.words, n: number.n, base: number.base })),
      quotes: offer.quotes.filter((quote) => quoteIds.has(quote.id)).map((quote) => ({ text: quote.text })),
      attribution: offer.attribution,
      footer: offer.footer,
    },
  };
}

function copyFigure(figure: PublishedFigure): PublishedFigure {
  return figure.kind === "one" ? { kind: "one", value: figure.value } : { kind: "pair", start: figure.start, end: figure.end };
}

/**
 * Which of today's offered quotes are the ones published: matched by their
 * words, since the record keeps nothing that points back at an answer.
 */
export function publishedQuoteIds(offer: PublicOffer, published: readonly PublishedQuote[]): string[] {
  const words = new Set(published.map((quote) => quote.text));
  return offer.quotes.filter((quote) => words.has(quote.text)).map((quote) => quote.id);
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const PUBLIC_NUMBERS_REFUSAL = {
  body: "Say which programme, and which numbers and quotes to publish.",
  noProgramme: "There is no programme here with a public page to publish on.",
  nothing: "Pick at least one number or quote to publish.",
  changed: "Something on this page has changed since it was loaded. Load it again, then publish.",
  notReady: "There’s nothing to publish yet: the survey at the end has no answers.",
  nothingPublished: "Nothing is published for this programme.",
} as const;
