import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readSourceRatings, type RatedSource } from "@/lib/courses/sourceRatings";
import { isProgrammeAudience, type SurveyAnswerDoc, type SurveyDoc, type SurveyKind, type SurveyProgrammeKind } from "@/lib/firestore/surveys";
import { resultsView, type ResultsView } from "./adminView";
import { bothOf, type PairedAnswers } from "./change";
import { isLinesQuestion, surveyQuestionsOf } from "./items";
import { LEAD_READS } from "./leadResults";
import { consideringOf, type OfferSurvey } from "./publicNumbers";
import { answersOf, closedOn, listSurveys, sentCountOf, surveyState } from "./repo";
import type { QuestionResult, ScaleRow } from "./results";
import { FACILITATOR_LINE_ID, SURVEY_TEMPLATES, type SurveyStage } from "./templates";
import { AFTER_SURVEY_CARD_WORDS, haveAnsweredParts, leadSurveyLineWords, leadSurveyWhenWords } from "./words";

/**
 * A PROGRAMME LEAD'S SURVEYS TAB (board sv-programme; Q41, Q49 A): the
 * programme's own surveys and what they say, in totals and comments, never a
 * name, from the first answer, made on the server. The tab's Before, End and
 * Follow-ups views draw this by stage, and its Overview's cards are these
 * rows (`leadSurveyRows`); its check-ins are `./checkIns/leadView.ts`'s.
 *
 * Rules a maintainer keeps:
 *
 *  - ONE COUNT EACH. Every number and comment is the one its own page already
 *    shows, through the reader that page uses: a survey's answers, its rate
 *    and its totals and comments are its Results (`resultsView`, with the
 *    lead's order of comments); "answered both" is the change view's pairing
 *    (`bothOf`); "considering, planning or already doing it" is public
 *    numbers' count (`consideringOf`); moving up, staying and moving down, and
 *    the averages then and now, are the Results' Before and now; the sources
 *    people rated are the retrospective's (`readSourceRatings`). Nothing here
 *    counts anything a second way.
 *  - NOTHING ABOUT A PERSON. What leaves is a projection: each survey's name,
 *    counts and line; totals; the words of comments. Never a name, a uid, an
 *    email address, who answered or who did not, or a row per person.
 *  - THE PROGRAMME'S OWN SURVEYS: the kinds a lead reads (`LEAD_READS`) whose
 *    audience is this programme, once each has gone out (sent, or opened for
 *    a leaving survey). Never a survey after an event, another programme's,
 *    or a draft, whose words can still change.
 *
 * Who may ask is the caller's business: the page holds the caller to the
 * programme's lead or an admin first (`loadProgrammeRun`).
 */

/** The questions of the survey at the end the board calls "How it went": Q1, Q2 and Q3 of the questionnaire, by their fixed ids. */
export const HOW_IT_WENT_IDS: readonly string[] = ["q_q1", "q_q2", "q_q3"];
/** C1, the career stage: "considering, planning or already doing it" and who moved a stage. */
const STAGE_ID = "q_c1";
/** C4, explaining the case and the main objections. */
const EXPLAIN_ID = "q_c4";

export type ScaleResult = Extract<QuestionResult, { kind: "scale" }>;
export type CommentsResult = Extract<QuestionResult, { kind: "comments" }>;

export type LeadSurveyRow = {
  id: string;
  /** Its stage, which says which view of the tab it is on: Before, End (with the survey about leaving) or Follow-ups. */
  kind: SurveyKind;
  name: string;
  /** Its answers and the people its rate is of, as its results page counts them. */
  answers: number;
  of: number;
  /** "29 of 32 answered · closed Wed 4 Nov". */
  line: string;
  /** The line's second part, "closed Wed 4 Nov", for the Overview's card. */
  when: string;
};

export type LeadChange = {
  /** The survey at the end, whose results page shows before and after. */
  surveyId: string;
  /**
   * True once names have come off either survey: answers no longer pair by
   * person, so nothing here is compared, and the page says why (the Results'
   * own sentence) rather than that nobody answered both.
   */
  namesOff: boolean;
  /** People who answered both the before and the after. */
  both: number;
  /** C1 at stage 2 and up at each end, of the people who answered it both times, and how they moved. */
  considering: { start: number; end: number; of: number; up: number; same: number; down: number } | null;
  /** C4's averages then and now, out of its top point, and how many moved up, of the people who answered it both times. */
  explaining: { before: number; after: number; max: number; up: number; of: number } | null;
};

export type LeadFacilitatorLine = {
  /** The question it is a line of: "How valuable was each part?". */
  question: string;
  row: ScaleRow;
  max: number;
  minLabel: string;
  maxLabel: string;
};

export type LeadEnd = {
  surveyId: string;
  answers: number;
  /** Q1, Q2 (without its facilitator line) and Q3, as its Results count them. */
  howItWent: ScaleResult[];
  /** The facilitator line of Q2, for the lead and admins alone. */
  facilitator: LeadFacilitatorLine | null;
  /** Every written answer's question, its comments in the order of their words. */
  comments: CommentsResult[];
};

export type LeadTabView = {
  programmeKind: SurveyProgrammeKind;
  surveys: LeadSurveyRow[];
  change: LeadChange | null;
  /** Null until the survey at the end has an answer. */
  end: LeadEnd | null;
  /** The sources with an average, highest first: up to three, and the lowest when there are more. Null when none has one. */
  sources: { highest: RatedSource[]; lowest: RatedSource[] } | null;
  /** Ratings is linked once the programme names a run; the anonymous form's answers once the survey at the end has gone out. */
  links: { ratings: boolean; anonymousForm: boolean };
};

const ORDER = SURVEY_TEMPLATES as readonly string[];

function byStage(a: SurveyDoc, b: SurveyDoc): number {
  return ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id);
}

/** The programme's own surveys a lead reads, once each has gone out, in the order of the stages. */
export function leadSurveysOf(all: readonly SurveyDoc[], roundId: string, programmeId: string): SurveyDoc[] {
  return all
    .filter((survey) => LEAD_READS.includes(survey.kind) && isProgrammeAudience(survey.audience, roundId, programmeId) && survey.firstSentAt !== null)
    .sort(byStage);
}

/** A survey's answers by person, as the change view pairs them: an answer whose name has come off pairs with nothing. */
function paired(answers: readonly SurveyAnswerDoc[]): PairedAnswers[] {
  return answers.flatMap((answer) => (answer.respondent ? [{ uid: answer.respondent.uid, answers: answer.answers }] : []));
}

/** A survey and its answers as public numbers reads them. */
function offered(survey: SurveyDoc, answers: readonly SurveyAnswerDoc[]): OfferSurvey {
  return {
    stage: survey.kind as SurveyStage,
    items: survey.items,
    answers: answers.map((answer) => ({ id: answer.id, uid: answer.respondent?.uid ?? null, answers: answer.answers })),
    sent: sentCountOf(survey),
  };
}

/** The top point of a scale result: its bottom and how many points it counts. */
function topOf(result: ScaleResult): number {
  return result.min + (result.rows[0]?.counts.length ?? 1) - 1;
}

/** A question's totals with nothing beside them: the result as Results count it, without what it is compared with. */
function scaleOnly(result: ScaleResult): ScaleResult {
  return {
    kind: "scale",
    id: result.id,
    number: result.number,
    title: result.title,
    min: result.min,
    minLabel: result.minLabel,
    maxLabel: result.maxLabel,
    rows: result.rows,
    promoterScore: result.promoterScore,
  };
}

async function changeOf(db: Firestore, before: SurveyDoc, after: SurveyDoc, view: ResultsView): Promise<LeadChange> {
  const [earlier, later] = await Promise.all([answersOf(db, before), answersOf(db, after)]);
  const both = bothOf(paired(earlier), paired(later)).length;
  const counts = consideringOf({ kind: after.programmeKind, term: "", surveys: [offered(before, earlier), offered(after, later)] });
  const stage = view.questions.find((question) => question.id === STAGE_ID);
  const moved = stage?.change?.kind === "values" ? stage.change : null;
  const explain = view.questions.find((question) => question.id === EXPLAIN_ID);
  const averages = explain?.kind === "scale" && explain.change?.kind === "values" ? explain.change : null;
  return {
    surveyId: after.id,
    namesOff: view.namesOff,
    both,
    considering:
      counts && moved ? { start: counts.start, end: counts.end, of: counts.n, up: moved.up, same: moved.same, down: moved.down } : null,
    explaining:
      explain?.kind === "scale" && averages && averages.both > 0 && averages.before.mean !== null && averages.after.mean !== null
        ? { before: averages.before.mean, after: averages.after.mean, max: topOf(explain), up: averages.up, of: averages.both }
        : null,
  };
}

function endOf(after: SurveyDoc, view: ResultsView): LeadEnd {
  const questions = surveyQuestionsOf(after.items);
  let facilitator: LeadFacilitatorLine | null = null;
  const howItWent: ScaleResult[] = [];
  for (const result of view.questions) {
    if (!HOW_IT_WENT_IDS.includes(result.id) || result.kind !== "scale") continue;
    const asked = questions.find((question) => question.id === result.id);
    const at = asked && isLinesQuestion(asked) ? asked.lines.findIndex((line) => line.id === FACILITATOR_LINE_ID) : -1;
    if (at >= 0 && result.rows[at]) {
      facilitator = { question: result.title, row: result.rows[at], max: topOf(result), minLabel: result.minLabel, maxLabel: result.maxLabel };
      howItWent.push(scaleOnly({ ...result, rows: result.rows.filter((_, index) => index !== at) }));
    } else {
      howItWent.push(scaleOnly(result));
    }
  }
  const comments = view.questions.flatMap((result): CommentsResult[] =>
    result.kind === "comments"
      ? [{ kind: "comments", id: result.id, number: result.number, title: result.title, respondents: result.respondents, comments: result.comments }]
      : [],
  );
  return { surveyId: after.id, answers: view.answers, howItWent, facilitator, comments };
}

/** One survey's row on the tab: its answers and the people its rate is of, as its Results count them, and its line. */
function rowOf(survey: SurveyDoc, view: ResultsView, now: Date): LeadSurveyRow {
  const closed = surveyState(survey, now) === "closed";
  return {
    id: survey.id,
    kind: survey.kind,
    name: survey.name,
    answers: view.answers,
    of: view.sent,
    line: leadSurveyLineWords(view.answers, view.sent, closedOn(survey), closed),
    when: leadSurveyWhenWords(closedOn(survey), closed),
  };
}

/** The programme's own surveys a lead reads, once each has gone out, each with its Results as its own page counts them. */
async function leadSurveysRead(
  db: Firestore,
  programme: { roundId: string; programmeId: string },
): Promise<{ surveys: SurveyDoc[]; views: Map<string, ResultsView> }> {
  const surveys = leadSurveysOf(await listSurveys(db), programme.roundId, programme.programmeId);
  // Each survey's Results, as its own page counts them, with the lead's order of comments.
  const views = new Map(
    await Promise.all(surveys.map(async (survey) => [survey.id, await resultsView(db, survey, false, { commentsInOrder: "words" })] as const)),
  );
  return { surveys, views };
}

/**
 * THE PROGRAMME'S SURVEYS AS ROWS, for the Overview's cards: the same rows,
 * counted by the same reader, as the views that list them, so a card and its
 * view never show two counts.
 */
export async function leadSurveyRows(db: Firestore, programme: { roundId: string; programmeId: string }, now: Date): Promise<LeadSurveyRow[]> {
  const { surveys, views } = await leadSurveysRead(db, programme);
  return surveys.map((survey) => rowOf(survey, views.get(survey.id)!, now));
}

/** "The after survey" on the lead's Overview, worded: its heading, how many have answered, and the line that leads to the tab. */
export type LeadAfterSurveyCard = {
  heading: string;
  /** "23 of 31 have answered.", the count apart ("23 of 31" set in bold, as the board draws it). */
  answered: { count: string; rest: string };
  /** "Results show in Surveys as answers come in, never with a name.", with "Surveys" the way to the tab. */
  results: { before: string; link: string; after: string };
};

/**
 * THE SURVEY AT THE END ON THE LEAD'S OVERVIEW once the programme is over
 * (board en-finish, finding A5): the Surveys tab's own row for it, the same
 * survey (`leadSurveysOf`, the first at the end) counted by the same reader
 * (its Results, `rowOf`), so the card and the tab never show two counts.
 * Null before it has gone out. For the page that holds the programme to its
 * lead and admins, as the tab's does.
 */
export async function leadAfterSurveyCard(
  db: Firestore,
  programme: { roundId: string; programmeId: string },
  now: Date,
): Promise<LeadAfterSurveyCard | null> {
  const after = leadSurveysOf(await listSurveys(db), programme.roundId, programme.programmeId).find((survey) => survey.kind === "after") ?? null;
  if (!after) return null;
  const row = rowOf(after, await resultsView(db, after, false, { commentsInOrder: "words" }), now);
  return {
    heading: AFTER_SURVEY_CARD_WORDS.heading,
    answered: haveAnsweredParts(row.answers, row.of),
    results: { before: AFTER_SURVEY_CARD_WORDS.resultsBefore, link: AFTER_SURVEY_CARD_WORDS.resultsLink, after: AFTER_SURVEY_CARD_WORDS.resultsAfter },
  };
}

export async function leadSurveysTab(
  db: Firestore,
  programme: { roundId: string; programmeId: string; runId: string | null },
  now: Date,
): Promise<LeadTabView> {
  const { surveys, views } = await leadSurveysRead(db, programme);
  const rows = surveys.map((survey): LeadSurveyRow => rowOf(survey, views.get(survey.id)!, now));

  const after = surveys.find((survey) => survey.kind === "after") ?? null;
  const before = after ? (surveys.find((survey) => survey.kind === "before" && survey.id === after.pairOf) ?? null) : null;
  const afterView = after ? views.get(after.id)! : null;
  const [change, ratings] = await Promise.all([
    after && before && afterView ? changeOf(db, before, after, afterView) : Promise.resolve(null),
    programme.runId ? readSourceRatings(db, programme.runId) : Promise.resolve(null),
  ]);
  const rated = ratings?.rated ?? [];

  return {
    programmeKind: after?.programmeKind ?? surveys[0]?.programmeKind ?? "fellowship",
    surveys: rows,
    change,
    end: after && afterView && afterView.answers > 0 ? endOf(after, afterView) : null,
    sources: rated.length > 0 ? { highest: rated.slice(0, 3), lowest: rated.length > 3 ? rated.slice(-1) : [] } : null,
    links: { ratings: programme.runId !== null, anonymousForm: after !== null },
  };
}
