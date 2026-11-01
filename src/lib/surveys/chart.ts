import { toCSV } from "@/lib/csv";
import {
  CHART_FILE_WORDS,
  DOT_WORDS,
  MAKE_CHART_WORDS,
  chartHeadingWords,
  scaleWords,
  showWords,
  weekLongWords,
} from "./chartWords";
import { chartGroupsOf } from "./charts";
import { questionNumbers, surveyQuestionsOf, type SurveyChoiceQuestion, type SurveyItem, type SurveyQuestion } from "./items";
import { surveyResults, type AnswerSet, type QuestionResult } from "./results";
import { numberWords, oneDecimalWords } from "./words";

/**
 * MAKE A CHART: one question of a survey, or of a programme's check-ins,
 * drawn as an admin chooses: its counts, its shares or its average, by week
 * for check-ins, for everybody counted or split into one chart per group, on
 * one scale.
 *
 * ONE COUNT. Every figure is counted by the Results' own counting: the
 * answers a chart, a week or a bar covers are handed to `surveyResults`, and
 * its bars are that result's (`chartGroupsOf`), so a chart of everybody's
 * answers to a survey's question is that question's Results, and a check-in
 * week's average is the average its check-ins' answers give together, as
 * the programme's lead's week counts it (`tallyOf`). Nothing here counts an
 * answer any other way.
 *
 * A CHECK-IN WEEK'S QUESTION is the check-ins of that week asking it, put
 * together: each group's copy of the week lists that week's parts, a part
 * keeping its id in every copy, so "Was anything unclear?" is one question a
 * week whose options are every copy's, each once, in their order.
 *
 * NO FLOOR. A chart is an admin's, and an admin's Results show from the first
 * answer; the floors a group's facilitators and the programme's lead read
 * check-ins behind are theirs, and neither ever reaches a chart. Nothing here
 * holds a name: the answers come in without their people, cut only by the
 * group and the week the caller says each set is.
 *
 * Pure: no reads and no clock.
 */

export type ChartShow = "counts" | "shares" | "average";

/** One chart for everybody counted, or one for each group. */
export type ChartSplit = "none" | "group";

/**
 * Some answers to chart, with the questions they answered: a survey's
 * answers in one group (or in none), or one check-in's answers.
 */
export type ChartSet = {
  items: readonly SurveyItem[];
  answers: readonly AnswerSet[];
  /** The group a chart split by group puts them in: an id of `ChartInput.groups`, or null for none. */
  group: string | null;
  /** A check-in's week; null for a survey's answers. */
  week: number | null;
};

/** A group as a chart split by group names it. */
export type ChartGroupName = { id: string; name: string };

export type ChartInput = {
  /**
   * Every set the chart counts, already narrowed to the people the admin
   * chose ("Who"). A survey with no answers is still one set with its
   * questions and no answers, so its questions can be offered.
   */
  sets: readonly ChartSet[];
  /** The groups a chart split by group draws, one chart each, in this order. Empty: no split is offered. */
  groups: readonly ChartGroupName[];
  /** A programme's check-ins: every week they are read by, in order. Null for a survey. */
  weeks: readonly number[] | null;
  /** Who the chart counts, as the one chart is named when it is not split: "Everyone who answered", "Group C". */
  who: string;
};

/** What the admin asked for, read from the page's address. Null where nothing usable was asked. */
export type ChartAsk = { question: string | null; show: ChartShow | null; split: ChartSplit | null };

export type ChartChoice<T extends string = string> = { value: T; label: string };

/** The Who menu above a chart: the address key it writes (the Results' own), its choices, and the one chosen ("" for everybody). */
export type ChartWho = { name: "who" | "as"; choices: ChartChoice[]; chosen: string };

export type ChartBar = {
  /** "5: Very", "Most", a grid's line, "Average", or a week's name. */
  label: string;
  /** A check-in week's column; null otherwise. */
  week: number | null;
  /** The count, the share (a whole percent) or the average; null when there is nothing to show (a dot). */
  value: number | null;
  /** The value as the chart writes it: "7", "47%", "4.2"; "" for nothing. */
  figure: string;
  /** How far along the scale the bar reaches, 0 to 1, from nought. */
  size: number;
  /** Counts and shares: the answers behind the bar. An average: the answers averaged. */
  count: number;
  /** Counts and shares: how many answered what the bar's block counts. An average: as `count`. */
  of: number;
  /** Counts and shares: the bar's share of `of`, a whole percent, as its result has it. An average: 0. */
  share: number;
};

/** A run of bars: a question's answers, a grid's line, or one week of a check-in question. */
export type ChartBlock = { heading: string; week: number | null; of: number; bars: ChartBar[] };

/** One chart: everybody counted, or one group. `answers` is how many answered the question in it, every week's added up. */
export type ChartPanel = { key: string; title: string; answers: number; blocks: ChartBlock[] };

export type ChartModel = {
  /** The questions a chart can be made of, as the Question menu offers them. */
  questions: ChartChoice[];
  shows: ChartChoice<ChartShow>[];
  splits: ChartChoice<ChartSplit>[];
  /** What is drawn: the ask read against what is offered. Null when no question can be drawn. */
  chosen: { question: string; show: ChartShow; split: ChartSplit } | null;
  /** The question's own words. */
  title: string;
  /** "Average by week, by group". */
  heading: string;
  /** Columns for an average by week, one a week; bars for everything else. */
  layout: "columns" | "bars";
  byWeek: boolean;
  /** The one scale every chart is drawn on, and what it says of itself. */
  scale: { low: number; high: number; unit: string; words: string };
  panels: ChartPanel[];
  /** Every answer counted, in every chart. */
  answers: number;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The ask in a page's address or a file's: anything unknown reads as nothing asked. */
export function readChartAsk(raw: { question?: unknown; show?: unknown; split?: unknown }): ChartAsk {
  const question = typeof raw.question === "string" && ID.test(raw.question) ? raw.question : null;
  const show = raw.show === "counts" || raw.show === "shares" || raw.show === "average" ? raw.show : null;
  const split = raw.split === "none" || raw.split === "group" ? raw.split : null;
  return { question, show, split };
}

/** The ask as an address's query: "question=q_ci_useful&show=average&split=group". */
export function chartQuery(chosen: { question: string; show: ChartShow; split: ChartSplit }, who: { name: string; value: string } | null): string {
  const params = new URLSearchParams({ question: chosen.question, show: chosen.show, split: chosen.split });
  if (who && who.value) params.set(who.name, who.value);
  return params.toString();
}

/** One question's result over some answers, by the Results' own counting. */
function resultOf(question: SurveyQuestion, answers: readonly AnswerSet[]): QuestionResult | undefined {
  return surveyResults([question], answers)[0];
}

/** Whether a question draws as bars: everything but comments (and the image question no survey asks). */
function isChartable(question: SurveyQuestion): boolean {
  const probe = resultOf(question, []);
  return probe !== undefined && probe.kind !== "comments";
}

/**
 * Lists put together, each thing once by its key, every list's order kept:
 * a thing new to the whole goes just after the one before it in its own list,
 * so "Something else" and "Nothing was unclear" stay last however the week's
 * parts differ from one group's copy to another.
 */
function mergeInOrder<T>(lists: readonly (readonly T[])[], key: (each: T) => string): T[] {
  const out: T[] = [];
  for (const list of lists) {
    let after = -1;
    for (const each of list) {
      const found = out.findIndex((kept) => key(kept) === key(each));
      if (found !== -1) {
        after = found;
        continue;
      }
      out.splice(after + 1, 0, each);
      after += 1;
    }
  }
  return out;
}

/**
 * Several sets' copies of one question as one: the first copy, with every
 * copy's options (or lines) of the same type, each once. Null for none.
 */
function mergedQuestion(copies: readonly SurveyQuestion[]): SurveyQuestion | null {
  const base = copies[0];
  if (!base) return null;
  const same = copies.filter((copy) => copy.type === base.type);
  if (base.type === "lines") {
    const lines = mergeInOrder(
      same.map((copy) => (copy.type === "lines" ? copy.lines : [])),
      (line) => line.id,
    );
    return { ...base, lines };
  }
  const choice = base as SurveyChoiceQuestion;
  if (!Array.isArray(choice.options)) return base;
  const options = mergeInOrder(
    same.map((copy) => (copy as SurveyChoiceQuestion).options ?? []),
    (option) => option.id,
  );
  return { ...choice, options };
}

/** The copies of question `id` in some sets, in the sets' order. */
function copiesOf(sets: readonly ChartSet[], id: string): SurveyQuestion[] {
  return sets.flatMap((set) => surveyQuestionsOf(set.items).filter((question) => question.id === id));
}

/** A question's averages, a line each: a scale's rows, a number's or a percentage's, a scored choice's. */
function averagesOf(result: QuestionResult | undefined): { label: string; value: number | null; n: number }[] {
  if (!result) return [];
  switch (result.kind) {
    case "scale":
      return result.rows.map((row) => ({ label: row.label, value: row.mean, n: row.respondents }));
    case "value":
      return [{ label: "", value: result.mean, n: result.respondents }];
    case "options":
      return result.scored ? [{ label: "", value: result.scored.mean, n: result.respondents }] : [];
    case "comments":
      return [];
  }
}

/** How many answered a question, as its Results say beside it: a grid's line most answered, else everybody who answered. */
function answeredOf(result: QuestionResult | undefined): number {
  if (!result) return 0;
  return result.kind === "scale" ? Math.max(0, ...result.rows.map((row) => row.respondents)) : result.respondents;
}

/** The scale an average is drawn on, from the question itself: a rating's points, a percentage's 0 to 100. Null when its values set it. */
function averageScale(probe: QuestionResult | undefined, question: SurveyQuestion): { low: number; high: number; unit: string } | null {
  if (!probe) return null;
  if (probe.kind === "scale") {
    const points = probe.rows[0]?.counts.length ?? 0;
    return { low: probe.min, high: probe.min + Math.max(points, 1) - 1, unit: "" };
  }
  if (probe.kind === "value") return probe.unit === "%" ? { low: 0, high: 100, unit: "%" } : null;
  if (probe.kind === "options" && probe.scored) {
    const scores = Object.values((question as SurveyChoiceQuestion).scores ?? {}).filter((score) => Number.isFinite(score));
    if (scores.length === 0) return null;
    return { low: Math.min(0, ...scores), high: Math.max(...scores), unit: probe.scored.unit };
  }
  return null;
}

/** An average as the chart writes it: one place on a scale, else as Results print a number. */
function averageFigure(value: number | null, probe: QuestionResult | undefined, unit: string): string {
  if (value === null) return "";
  return probe?.kind === "scale" ? oneDecimalWords(value) : numberWords(value, unit);
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** A bar before it is put on the scale. */
type RawBar = Omit<ChartBar, "figure" | "size">;
type RawBlock = { heading: string; week: number | null; of: number; bars: RawBar[] };

/** A result's runs of bars, as its Results draw them, each bar its count or its share. */
function barBlocks(result: QuestionResult | undefined, show: "counts" | "shares", week: number | null): RawBlock[] {
  if (!result) return [];
  return chartGroupsOf(result).map((block) => ({
    heading: week === null ? block.heading : block.heading ? `${weekLongWords(week)}: ${block.heading}` : weekLongWords(week),
    week,
    of: block.of,
    bars: block.bars.map((bar) => ({
      label: bar.label,
      week: null,
      value: show === "counts" ? bar.count : bar.percent,
      count: bar.count,
      of: block.of,
      share: bar.percent,
    })),
  }));
}

/**
 * THE CHART. Reads the ask against what the sets offer: the question asked
 * for when there is one (else the first that draws as bars), Show (an
 * average only for a question that has one, and by week only for one line),
 * Split by (by group only when there are groups). Unasked, check-ins open on
 * the average by week, a chart a group; anything else on its counts, one
 * chart.
 */
export function buildChart(input: ChartInput, ask: ChartAsk): ChartModel {
  const byWeek = input.weeks !== null;
  const answers = input.sets.reduce((sum, set) => sum + set.answers.length, 0);
  const catalogue = mergeInOrder(
    input.sets.map((set) => surveyQuestionsOf(set.items).filter(isChartable)),
    (question) => question.id,
  );
  const numbers = questionNumbers(input.sets[0]?.items ?? []);
  const questions = catalogue.map((question) => ({
    value: question.id,
    // A survey's question by its number, as its Results list it; a check-in's
    // number changes with the week, so by its words alone.
    label: !byWeek && numbers.has(question.id) ? `${numbers.get(question.id)}. ${question.title}` : question.title,
  }));
  const splits: ChartChoice<ChartSplit>[] = [
    { value: "none", label: MAKE_CHART_WORDS.splitNone },
    ...(input.groups.length > 0 ? [{ value: "group" as const, label: MAKE_CHART_WORDS.splitGroup }] : []),
  ];
  const picked = catalogue.find((question) => question.id === ask.question) ?? catalogue[0] ?? null;
  if (!picked) {
    return {
      questions,
      shows: [],
      splits,
      chosen: null,
      title: "",
      heading: "",
      layout: "bars",
      byWeek,
      scale: { low: 0, high: 1, unit: "", words: "" },
      panels: [],
      answers,
    };
  }

  // The question as every set asks it, for what it offers and its scale.
  const whole = mergedQuestion(copiesOf(input.sets, picked.id)) ?? picked;
  const probe = resultOf(whole, []);
  const averages = averagesOf(probe);
  const hasAverage = averages.length > 0 && (!byWeek || averages.length === 1);
  const shows: ChartChoice<ChartShow>[] = [
    { value: "counts", label: showWords("counts", byWeek) },
    { value: "shares", label: showWords("shares", byWeek) },
    ...(hasAverage ? [{ value: "average" as const, label: showWords("average", byWeek) }] : []),
  ];
  const show: ChartShow = shows.some((each) => each.value === ask.show)
    ? (ask.show as ChartShow)
    : byWeek && hasAverage
      ? "average"
      : "counts";
  const split: ChartSplit = splits.some((each) => each.value === ask.split)
    ? (ask.split as ChartSplit)
    : byWeek && input.groups.length > 1
      ? "group"
      : "none";

  // Each week's question, put together from every set of that week, so every
  // chart of the week has the same bars.
  const weekly = new Map<number, SurveyQuestion | null>();
  const weekQuestion = (week: number) => {
    if (!weekly.has(week)) weekly.set(week, mergedQuestion(copiesOf(input.sets.filter((set) => set.week === week), picked.id)));
    return weekly.get(week) ?? null;
  };

  const groups: readonly ChartGroupName[] = split === "group" ? input.groups : [{ id: "", name: input.who }];
  const raw = groups.map((group) => {
    const sets = split === "group" ? input.sets.filter((set) => set.group === group.id) : input.sets;
    const counted = (scope: readonly ChartSet[]) => scope.flatMap((set) => set.answers);
    // Each result the chart is drawn from: the question over every answer, or one a week.
    const scoped: { week: number | null; result: QuestionResult | undefined }[] = !byWeek
      ? [{ week: null, result: resultOf(whole, counted(sets)) }]
      : (input.weeks ?? []).map((week) => {
          const question = weekQuestion(week);
          return { week, result: question ? resultOf(question, counted(sets.filter((set) => set.week === week))) : undefined };
        });
    let blocks: RawBlock[];
    if (!byWeek && show === "average") {
      const lines = averagesOf(scoped[0].result);
      blocks = [
        {
          heading: "",
          week: null,
          of: Math.max(0, ...lines.map((line) => line.n)),
          bars: lines.map((line) => ({
            label: line.label || MAKE_CHART_WORDS.average,
            week: null,
            value: line.n > 0 ? line.value : null,
            count: line.n,
            of: line.n,
            share: 0,
          })),
        },
      ];
    } else if (show === "average") {
      const bars = scoped.map(({ week, result }): RawBar => {
        const line = averagesOf(result)[0];
        const n = line?.n ?? 0;
        return { label: weekLongWords(week ?? 0), week, value: n > 0 ? (line?.value ?? null) : null, count: n, of: n, share: 0 };
      });
      blocks = [{ heading: "", week: null, of: bars.reduce((sum, bar) => sum + bar.count, 0), bars }];
    } else {
      // By week, a run of bars a week that any check-in asked it in; a week nobody has been asked it yet has none.
      blocks = scoped.flatMap(({ week, result }) => barBlocks(result, show, week));
    }
    return { key: group.id || "everyone", title: group.name, answers: scoped.reduce((sum, each) => sum + answeredOf(each.result), 0), blocks };
  });

  // One scale for every chart: an average's from the question, else from what is drawn.
  const values = raw.flatMap((panel) => panel.blocks.flatMap((block) => block.bars.map((bar) => bar.value ?? 0)));
  const fixed = show === "average" ? averageScale(probe, whole) : null;
  const scale =
    show === "shares"
      ? { low: 0, high: 100, unit: "%" }
      : show === "counts"
        ? { low: 0, high: Math.max(1, ...values), unit: "" }
        : (fixed ?? { low: 0, high: Math.max(1, Math.ceil(Math.max(0, ...values))), unit: probe?.kind === "options" && probe.scored ? probe.scored.unit : "" });
  const figure = (value: number | null) =>
    value === null ? "" : show === "counts" ? String(value) : show === "shares" ? `${value}%` : averageFigure(value, probe, scale.unit);
  const panels: ChartPanel[] = raw.map((panel) => ({
    ...panel,
    blocks: panel.blocks.map((block) => ({
      ...block,
      bars: block.bars.map((bar) => ({
        ...bar,
        figure: figure(bar.value),
        size: bar.value === null || scale.high <= 0 ? 0 : clamp(bar.value / scale.high),
      })),
    })),
  }));

  const layout = byWeek && show === "average" ? "columns" : "bars";
  const said = scaleWords(show, scale.low, scale.high, scale.unit, panels.length > 1);
  return {
    questions,
    shows,
    splits,
    chosen: { question: picked.id, show, split },
    title: picked.title,
    heading: chartHeadingWords(show, byWeek, split === "group"),
    layout,
    byWeek,
    scale: { ...scale, words: layout === "columns" ? [said, DOT_WORDS].filter(Boolean).join(" · ") : said },
    panels,
    answers,
  };
}

/**
 * "DOWNLOAD THE NUMBERS": the chart as a spreadsheet, built from the very
 * model the page draws, so the two can never say different things. A head
 * of what it is (the survey or programme, the question, what is shown, who
 * is counted and how many answers), then a row a bar: its chart (when split
 * by group), its week or line, and its figures as the chart writes them.
 *
 * It names nobody: a model holds no name, account id or address, only
 * groups' names and counts. So, like the file of one question, it is not a
 * download the site records. Every cell goes through `toCSV`.
 */
export function chartNumbersCsv(model: ChartModel, counted: { name: string; who: string }): string {
  const W = CHART_FILE_WORDS;
  const head = toCSV([W.survey, W.question, W.showing, W.who, W.answers], [[counted.name, model.title, model.heading, counted.who, model.answers]]);
  if (!model.chosen) return `${head}\n`;
  const byGroup = model.chosen.split === "group";
  const group = (panel: ChartPanel) => (byGroup ? [panel.title] : []);
  let table: string;
  if (model.layout === "columns") {
    table = toCSV(
      [...(byGroup ? [W.group] : []), W.week, W.average, W.from],
      model.panels.flatMap((panel) =>
        panel.blocks.flatMap((block) => block.bars.map((bar) => [...group(panel), bar.label, bar.figure, bar.count])),
      ),
    );
  } else if (model.chosen.show === "average") {
    const lined = model.panels.some((panel) => panel.blocks.some((block) => block.bars.length > 1));
    table = toCSV(
      [...(byGroup ? [W.group] : []), ...(lined ? [W.part] : []), W.average, W.from],
      model.panels.flatMap((panel) =>
        panel.blocks.flatMap((block) => block.bars.map((bar) => [...group(panel), ...(lined ? [bar.label] : []), bar.figure, bar.count])),
      ),
    );
  } else {
    const headed = model.panels.some((panel) => panel.blocks.some((block) => block.heading));
    table = toCSV(
      [...(byGroup ? [W.group] : []), ...(headed ? [model.byWeek ? W.week : W.part] : []), W.answer, W.count, W.of, W.share],
      model.panels.flatMap((panel) =>
        panel.blocks.flatMap((block) =>
          block.bars.map((bar) => [...group(panel), ...(headed ? [block.heading] : []), bar.label, bar.count, block.of, `${bar.share}%`]),
        ),
      ),
    );
  }
  return `${head}\n\n${table}\n`;
}
