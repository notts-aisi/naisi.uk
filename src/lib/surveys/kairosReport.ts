import { own } from "@/lib/applications/keys";
import { STRONGEST, type RatingAnswers } from "@/lib/ratings/model";
import { surveyQuestionsOf, type SurveyAnswer, type SurveyChoiceQuestion, type SurveyItem, type SurveyQuestion } from "./items";
import { meanOf, medianOf, promoterScoreOf, valueOf } from "./results";
import type { SurveyStage } from "./templates";

/**
 * THE KAIROS REPORT FOR ONE PROGRAMME: the questionnaire's fourteen metrics
 * ("What to report to Kairos"), each worked out here from the programme's
 * surveys, its run's records and the ratings given at its end. Totals only:
 * never a name.
 *
 * Rules a maintainer keeps:
 *
 *  - N AND THE RESPONSE RATE BESIDE EVERY NUMBER. Every figure carries how
 *    many people it is of, and that as a share of the people who started the
 *    programme (the questionnaire's response rate, completed / starters).
 *  - COUNTERFACTUAL FIGURES ARE LABELLED SELF-REPORTED: the counterfactual
 *    FTE rests on each person's own answer to "Without this programme...".
 *  - COMPLETIONS ARE WHO FINISHED AS THE PROGRAMME'S LEAD DECIDED IT (the
 *    finished record, `recordOf`), and the figure says so.
 *  - A METRIC THE SITE HOLDS NO DATA FOR SAYS WHAT IT NEEDS instead of a
 *    number: the cost per outcome needs the programme's spend; the organiser
 *    pipeline needs next term's facilitators and committee.
 *  - PAIRS ARE BY PERSON: a change counts only people who answered the same
 *    question at both stages, and an answer whose name has come off pairs
 *    with nothing.
 *
 * Pure: the loader (`./kairosReportLoad.ts`) reads, this counts.
 */

/** One person's answers to one survey, with their uid while their name is on it. */
export type ReportAnswer = { uid: string | null; answers: Record<string, SurveyAnswer> };

export type ReportSurvey = {
  stage: SurveyStage;
  name: string;
  items: SurveyItem[];
  answers: ReportAnswer[];
  /** People it was sent to, by its own record of each send. */
  sent: number;
};

export type ReportInput = {
  programmeName: string;
  kind: "fellowship" | "incubator";
  /** Applications sent that ranked this programme, still in the term (none withdrawn or given back). */
  applications: number;
  /** Everybody who took part: on the programme at its end, and those who left after a register marked them. */
  started: number;
  /** Everybody on the programme at its end. */
  atEnd: number;
  /** Who finished, as the record says; null before the run's last session is over. */
  finished: number | null;
  /** The run's finishing rule, "at least N sessions", or null when it has none. */
  finishRule: number | null;
  /** The day of the run's last session, "Wed 9 Dec", or null. */
  lastDay: string | null;
  surveys: ReportSurvey[];
  /** Everybody on the programme at its end who was rated, with each rating they were given. */
  rated: { uid: string; ratings: RatingAnswers[] }[];
  /** Of the people on the programme at its end, the ones who have not said no to sharing with Kairos. */
  sharing: ReadonlySet<string>;
};

/** One number, with its n and response rate. */
export type ReportFigure = {
  label: string;
  value: string;
  /** "n = 25 · 78% of the 32 who started". */
  n: string;
  selfReported: boolean;
};

export type ReportMetric = {
  id: MetricId;
  name: string;
  figures: ReportFigure[];
  /** What the metric needs that the site does not hold, instead of (or beside) a number; or null. */
  needs: string | null;
  /** A line under it: how a figure is decided, or why there is none. */
  note: string | null;
  /** Links people gave (an incubator's outputs), shown as they gave them. */
  links: string[];
};

export type MetricId =
  | "funnel"
  | "responses"
  | "stage"
  | "intention"
  | "actions"
  | "onward"
  | "fte"
  | "counterfactual"
  | "knowledge"
  | "top"
  | "organisers"
  | "outputs"
  | "satisfaction"
  | "cost";

export type KairosReport = {
  programme: string;
  started: number;
  /** Whether the run's last session is over, so the Kairos file can be made. */
  over: boolean;
  /** The day of the run's last session, "Wed 9 Dec", or null. */
  lastDay: string | null;
  metrics: ReportMetric[];
  notes: string[];
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const STAGE_WORDS: Record<SurveyStage, string> = {
  before: "Before the programme",
  after: "At the end",
  followUp6: "Six months on",
  followUp12: "A year on",
};

const FOLLOW_UPS: readonly SurveyStage[] = ["followUp6", "followUp12"];

/** "n = 25 · 78% of the 32 who started". */
export function nWords(n: number, started: number): string {
  if (started <= 0) return `n = ${n}`;
  return `n = ${n} · ${Math.round((n / started) * 100)}% of the ${started} who started`;
}

/** "15 of 25 (60%)". */
function ofWords(count: number, of: number): string {
  if (of <= 0) return "None answered";
  return `${count} of ${of} (${Math.round((count / of) * 100)}%)`;
}

/** "+12", "-3", "0", with up to one decimal. */
function signed(value: number | null, unit = ""): string {
  if (value === null) return "None answered";
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${rounded > 0 ? "+" : ""}${text}${unit}`;
}

function fte(value: number): string {
  return `${(Math.round(value * 100) / 100).toFixed(2)} FTE`;
}

const figure = (label: string, value: string, n: string, selfReported = false): ReportFigure => ({ label, value, n, selfReported });

// ---------------------------------------------------------------------------
// Reading answers
// ---------------------------------------------------------------------------

function surveyOf(input: ReportInput, stage: SurveyStage): ReportSurvey | null {
  return input.surveys.find((survey) => survey.stage === stage) ?? null;
}

function questionOf(survey: ReportSurvey | null, id: string): SurveyQuestion | null {
  if (!survey) return null;
  return surveyQuestionsOf(survey.items).find((question) => question.id === id) ?? null;
}

/** Each person's number for a question in a survey, by uid. A name taken off pairs with nothing. */
function valuesByUid(survey: ReportSurvey, question: SurveyQuestion): Map<string, number> {
  const out = new Map<string, number>();
  for (const answer of survey.answers) {
    if (!answer.uid) continue;
    const value = valueOf(question, own(answer.answers, question.id));
    if (value !== null) out.set(answer.uid, value);
  }
  return out;
}

/** Every answer's number for a question, names on or off. */
function allValues(survey: ReportSurvey, question: SurveyQuestion): number[] {
  return survey.answers.flatMap((answer) => {
    const value = valueOf(question, own(answer.answers, question.id));
    return value === null ? [] : [value];
  });
}

/** The pairs (earlier, later) of people who answered both, by uid. */
function pairsOf(earlier: Map<string, number>, later: Map<string, number>): [number, number][] {
  const out: [number, number][] = [];
  for (const [uid, after] of later) {
    const before = earlier.get(uid);
    if (before !== undefined) out.push([before, after]);
  }
  return out;
}

/** The options a person ticked on a pick-any question, or null when they did not answer it. */
function picksOf(answer: ReportAnswer, question: SurveyQuestion): string[] | null {
  const given = own(answer.answers, question.id);
  if (!given || given.type !== "choices") return null;
  return [...given.optionIds];
}

/** A person's one choice on a choose-one question, or null. */
function choiceOf(answer: ReportAnswer, question: SurveyQuestion): string | null {
  const given = own(answer.answers, question.id);
  return given && given.type === "choice" ? given.optionId : null;
}

/** The lines of a text answer, each a thing they named. */
function linesOf(answer: ReportAnswer, id: string): string[] {
  const given = own(answer.answers, id);
  if (!given || given.type !== "text") return [];
  return given.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Whether a pick-any answer ticked something other than its "none of these". */
function tickedSomething(picks: readonly string[], question: SurveyQuestion): boolean {
  const none = (question as SurveyChoiceQuestion).noneIds ?? [];
  return picks.some((id) => !none.includes(id));
}

// ---------------------------------------------------------------------------
// The metrics
// ---------------------------------------------------------------------------

function funnel(input: ReportInput): ReportMetric {
  const started = input.started;
  const figures = [
    figure("Applied", String(input.applications), `n = ${input.applications} applications that ranked it, none withdrawn or given back`),
    figure(
      "Started",
      String(started),
      input.applications > 0 ? `${Math.round((started / input.applications) * 100)}% of the ${input.applications} who applied` : `n = ${started}`,
    ),
    figure(
      "Finished",
      input.finished === null ? (input.lastDay ? `Not yet: the last session is on ${input.lastDay}` : "Not yet") : String(input.finished),
      input.finished === null || started <= 0 ? `n = ${started} who started` : `${Math.round((input.finished / started) * 100)}% of the ${started} who started`,
    ),
  ];
  const rule =
    input.finishRule === null
      ? "Who finished is the programme’s finished record: what its lead decided on the Overview."
      : `Who finished is the programme’s finished record: what its lead decided on the Overview, starting from at least ${input.finishRule} sessions.`;
  return { id: "funnel", name: "Funnel", figures, needs: null, note: rule, links: [] };
}

function responses(input: ReportInput): ReportMetric {
  const figures = input.surveys.map((survey) =>
    figure(STAGE_WORDS[survey.stage], `${survey.answers.length} ${survey.answers.length === 1 ? "answer" : "answers"}`, `${nWords(survey.answers.length, input.started)} · sent to ${survey.sent}`),
  );
  return {
    id: "responses",
    name: "Response rate",
    figures,
    needs: null,
    note: figures.length === 0 ? "No survey of this programme has been made yet." : null,
    links: [],
  };
}

/** How many moved up at least one stage on C1 between two surveys, of those who answered both. */
function stageFigure(input: ReportInput, label: string, earlier: ReportSurvey, later: ReportSurvey, earlierId: string, laterId: string): ReportFigure | null {
  const qa = questionOf(earlier, earlierId);
  const qb = questionOf(later, laterId);
  if (!qa || !qb) return null;
  const pairs = pairsOf(valuesByUid(earlier, qa), valuesByUid(later, qb));
  const up = pairs.filter(([before, after]) => after >= before + 1).length;
  return figure(label, ofWords(up, pairs.length), nWords(pairs.length, input.started));
}

function stage(input: ReportInput): ReportMetric {
  const before = surveyOf(input, "before");
  const after = surveyOf(input, "after");
  const figures: ReportFigure[] = [];
  if (before && after) {
    const each = stageFigure(input, "Moved up at least one stage, start to end", before, after, "q_c1", "q_c1");
    if (each) figures.push(each);
  }
  for (const stageId of FOLLOW_UPS) {
    const later = surveyOf(input, stageId);
    if (before && later) {
      const each = stageFigure(input, `Moved up at least one stage, start to ${STAGE_WORDS[stageId].toLowerCase()}`, before, later, "q_c1", "q_c1");
      if (each) figures.push(each);
    }
  }
  if (after) {
    // At the end, against where they say they were before (T1, looking back).
    const each = stageFigure(input, "Moved up at least one stage from where they look back on, at the end", after, after, "q_t1", "q_c1");
    if (each) figures.push(each);
  }
  return {
    id: "stage",
    name: "Career-stage shift",
    figures,
    needs: null,
    note: figures.length === 0 ? "Needs answers to the before survey and the survey at the end from the same people." : null,
    links: [],
  };
}

function intention(input: ReportInput): ReportMetric {
  const before = surveyOf(input, "before");
  const figures: ReportFigure[] = [];
  for (const stageId of ["after", ...FOLLOW_UPS] as SurveyStage[]) {
    const later = surveyOf(input, stageId);
    const qa = questionOf(before, "q_c2");
    const qb = questionOf(later, "q_c2");
    if (!before || !later || !qa || !qb) continue;
    const pairs = pairsOf(valuesByUid(before, qa), valuesByUid(later, qb));
    const change = meanOf(pairs.map(([a, b]) => b - a));
    figures.push(
      figure(
        `Mean change in how likely they think it is, start to ${STAGE_WORDS[stageId].toLowerCase()}`,
        change === null ? "None answered" : `${signed(change)} percentage points`,
        nWords(pairs.length, input.started),
      ),
    );
  }
  return {
    id: "intention",
    name: "Intention shift",
    figures,
    needs: null,
    note: figures.length === 0 ? "Needs answers to the before survey and a later one from the same people." : null,
    links: [],
  };
}

function actions(input: ReportInput): ReportMetric {
  const after = surveyOf(input, "after");
  const question = questionOf(after, "q_c9");
  const figures: ReportFigure[] = [];
  if (after && question) {
    const answered = after.answers.map((answer) => picksOf(answer, question)).filter((picks): picks is string[] => picks !== null);
    const took = answered.filter((picks) => tickedSomething(picks, question)).length;
    figures.push(figure("Took at least one new step since the programme started", ofWords(took, answered.length), nWords(answered.length, input.started)));
  }
  return { id: "actions", name: "Concrete actions", figures, needs: null, note: figures.length === 0 ? "Needs the survey at the end." : null, links: [] };
}

function onward(input: ReportInput): ReportMetric {
  const figures: ReportFigure[] = [];
  const after = surveyOf(input, "after");
  const n1 = questionOf(after, "q_n1");
  if (after && n1) {
    const answered = after.answers.map((answer) => picksOf(answer, n1)).filter((picks): picks is string[] => picks !== null);
    const planning = answered.filter((picks) => tickedSomething(picks, n1)).length;
    figures.push(figure("Planning a named next step, at the end", ofWords(planning, answered.length), nWords(answered.length, input.started)));
  }
  for (const stageId of FOLLOW_UPS) {
    const later = surveyOf(input, stageId);
    if (!later || !questionOf(later, "q_f4_applied")) continue;
    const answered = later.answers.filter((answer) => own(answer.answers, "q_f4_applied") !== undefined || own(answer.answers, "q_f4_accepted") !== undefined);
    const applied = answered.filter((answer) => linesOf(answer, "q_f4_applied").length > 0).length;
    const accepted = answered.filter((answer) => linesOf(answer, "q_f4_accepted").length > 0).length;
    const when = STAGE_WORDS[stageId].toLowerCase();
    figures.push(figure(`Applied to a named programme or job, ${when}`, ofWords(applied, answered.length), nWords(answered.length, input.started)));
    figures.push(figure(`Accepted by one, ${when}`, ofWords(accepted, answered.length), nWords(answered.length, input.started)));
  }
  return {
    id: "onward",
    name: "Onward steps",
    figures,
    needs: null,
    note: figures.length === 0 ? "Needs the survey at the end, and the follow-ups for applications and offers." : null,
    links: [],
  };
}

function fteFigures(input: ReportInput, counterfactual: boolean): ReportFigure[] {
  const figures: ReportFigure[] = [];
  for (const stageId of FOLLOW_UPS) {
    const later = surveyOf(input, stageId);
    const f2 = questionOf(later, "q_f2");
    if (!later || !f2) continue;
    const when = STAGE_WORDS[stageId].toLowerCase();
    if (!counterfactual) {
      const values = allValues(later, f2);
      figures.push(figure(`AI safety FTE in all, ${when}`, fte(values.reduce((sum, value) => sum + value, 0)), nWords(values.length, input.started)));
      const most = values.filter((value) => value >= 0.7).length;
      figures.push(figure(`At 0.7 FTE or more, ${when}`, `${most} ${most === 1 ? "person" : "people"}`, nWords(values.length, input.started)));
      continue;
    }
    const a2 = questionOf(later, "q_a2");
    if (!a2) continue;
    let adjusted = 0;
    let plain = 0;
    let both = 0;
    for (const answer of later.answers) {
      const time = valueOf(f2, own(answer.answers, f2.id));
      const without = valueOf(a2, own(answer.answers, a2.id));
      if (time === null || without === null) continue;
      both += 1;
      plain += time;
      adjusted += time * ((100 - without) / 100);
    }
    figures.push(figure(`Counterfactual FTE, ${when}`, fte(adjusted), nWords(both, input.started), true));
    figures.push(figure(`The same people unadjusted, ${when}`, fte(plain), nWords(both, input.started)));
  }
  return figures;
}

function knowledge(input: ReportInput): ReportMetric {
  const before = surveyOf(input, "before");
  const after = surveyOf(input, "after");
  const figures: ReportFigure[] = [];
  const median = (earlier: ReportSurvey, later: ReportSurvey, earlierId: string, laterId: string, label: string) => {
    const qa = questionOf(earlier, earlierId);
    const qb = questionOf(later, laterId);
    if (!qa || !qb) return;
    const pairs = pairsOf(valuesByUid(earlier, qa), valuesByUid(later, qb));
    figures.push(figure(label, signed(medianOf(pairs.map(([a, b]) => b - a))), nWords(pairs.length, input.started)));
  };
  if (before && after) {
    median(before, after, "q_c4", "q_c4", "Median change in explaining the risk (1 to 7), start to end");
    median(before, after, "q_c5", "q_c5", "Median change in knowing the field (1 to 7), start to end");
    median(before, after, "q_c6", "q_c6", "Median change in people they could ask for advice, start to end");
  }
  if (after) {
    median(after, after, "q_t2", "q_c4", "Median change in explaining the risk, against looking back, at the end");
    median(after, after, "q_t3", "q_c5", "Median change in knowing the field, against looking back, at the end");
  }
  return {
    id: "knowledge",
    name: "Knowledge and network",
    figures,
    needs: null,
    note: figures.length === 0 ? "Needs the survey at the end." : null,
    links: [],
  };
}

function top(input: ReportInput): ReportMetric {
  const strongest = input.rated.filter(({ ratings }) =>
    ratings.some((rating) => rating.f5 === STRONGEST.nextStep || (rating.m1 !== undefined && rating.m1 >= STRONGEST.research)),
  );
  const sharing = strongest.filter(({ uid }) => input.sharing.has(uid)).length;
  const label =
    input.kind === "incubator"
      ? "Rated strong yes for a more demanding next step, or 8 or more for their research continuing"
      : "Rated strong yes for a more demanding next step";
  return {
    id: "top",
    name: "Top participants",
    figures: [
      figure(label, ofWords(strongest.length, input.rated.length), `n = ${input.rated.length} rated of the ${input.atEnd} on it at the end`),
      figure("Of those, sharing their details with Kairos", ofWords(sharing, strongest.length), `n = ${strongest.length}`),
    ],
    needs: null,
    note: "From the ratings their facilitators, the programme’s lead and admins gave at the end. Several ratings of one person count them once.",
    links: [],
  };
}

function organisers(input: ReportInput): ReportMetric {
  const after = surveyOf(input, "after");
  const n2 = questionOf(after, "q_n2");
  const figures: ReportFigure[] = [];
  if (after && n2) {
    const answers = after.answers.map((answer) => choiceOf(answer, n2)).filter((choice): choice is string => choice !== null);
    const yes = answers.filter((choice) => choice === "o_yes").length;
    const maybe = answers.filter((choice) => choice === "o_maybe").length;
    figures.push(figure("Would like to facilitate or help organise next term: yes", ofWords(yes, answers.length), nWords(answers.length, input.started)));
    figures.push(figure("Maybe", ofWords(maybe, answers.length), nWords(answers.length, input.started)));
  }
  return {
    id: "organisers",
    name: "Organiser pipeline",
    figures,
    needs:
      "Who goes on to facilitate or join the committee needs next term’s groups and committee, which the site holds only once next term starts.",
    note: null,
    links: [],
  };
}

function outputs(input: ReportInput): ReportMetric {
  if (input.kind !== "incubator") {
    return { id: "outputs", name: "Research outputs", figures: [], needs: null, note: "An incubator’s survey at the end asks this; a fellowship’s does not.", links: [] };
  }
  const after = surveyOf(input, "after");
  const i4 = questionOf(after, "q_i4");
  const figures: ReportFigure[] = [];
  const links: string[] = [];
  if (after && i4) {
    const answered = after.answers.map((answer) => picksOf(answer, i4)).filter((picks): picks is string[] => picks !== null);
    for (const option of (i4 as SurveyChoiceQuestion).options ?? []) {
      const count = answered.filter((picks) => picks.includes(option.id)).length;
      figures.push(figure(option.label, ofWords(count, answered.length), nWords(answered.length, input.started)));
    }
    for (const answer of after.answers) links.push(...linesOf(answer, "q_i4_links"));
  }
  return {
    id: "outputs",
    name: "Research outputs",
    figures,
    needs: null,
    note: figures.length === 0 ? "Needs the incubator’s survey at the end." : "What each team produced, as its people said; a team’s output is counted once for each of its people who answered.",
    links,
  };
}

function satisfaction(input: ReportInput): ReportMetric {
  const after = surveyOf(input, "after");
  const q1 = questionOf(after, "q_q1");
  const figures: ReportFigure[] = [];
  if (after && q1) {
    const values = allValues(after, q1);
    const score = promoterScoreOf(values);
    figures.push(figure("Net promoter score", score === null ? "None answered" : signed(score), nWords(values.length, input.started)));
  }
  return { id: "satisfaction", name: "Satisfaction", figures, needs: null, note: figures.length === 0 ? "Needs the survey at the end." : null, links: [] };
}

function cost(): ReportMetric {
  return {
    id: "cost",
    name: "Cost per outcome",
    figures: [],
    needs:
      "Needs the programme’s spend in US dollars, which the site doesn’t hold. It is divided by the completions, the people taking an onward step and the counterfactual FTE above.",
    note: null,
    links: [],
  };
}

/** The report, metric by metric, in the questionnaire's order. */
export function buildKairosReport(input: ReportInput): KairosReport {
  const counterfactual = fteFigures(input, true);
  const metrics: ReportMetric[] = [
    funnel(input),
    responses(input),
    stage(input),
    intention(input),
    actions(input),
    onward(input),
    {
      id: "fte",
      name: "AI safety FTE",
      figures: fteFigures(input, false),
      needs: null,
      note: "From the follow-ups’ share of working time: none 0, under 10% 0.05, 10 to 50% 0.3, 50 to 90% 0.7, over 90% 1.",
      links: [],
    },
    {
      id: "counterfactual",
      name: "Counterfactual FTE",
      figures: counterfactual,
      needs: null,
      note: "Self-reported: each person’s FTE times 100% less how likely they say they’d be where they are without the programme.",
      links: [],
    },
    knowledge(input),
    top(input),
    organisers(input),
    outputs(input),
    satisfaction(input),
    cost(),
  ];
  for (const metric of metrics) {
    if (metric.figures.length === 0 && metric.note === null && metric.needs === null) metric.note = "Needs the follow-ups.";
  }
  const fteMetric = metrics.find((metric) => metric.id === "fte");
  if (fteMetric && fteMetric.figures.length === 0) fteMetric.note = `${fteMetric.note} Needs the follow-ups.`;
  const counterfactualMetric = metrics.find((metric) => metric.id === "counterfactual");
  if (counterfactualMetric && counterfactualMetric.figures.length === 0) counterfactualMetric.note = `${counterfactualMetric.note} Needs the follow-ups.`;
  return {
    programme: input.programmeName,
    started: input.started,
    over: input.finished !== null,
    lastDay: input.lastDay,
    metrics,
    notes: [
      "Every figure has its n beside it, and that as a share of the people who started.",
      "No comparison group this term: applicants who did not get a place were not surveyed.",
      "Answers pair by person only while names are on them; names come off two years after the programme.",
    ],
  };
}
