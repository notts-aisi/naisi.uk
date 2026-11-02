/**
 * THE WORDS OF MAKE A CHART, on a survey's own pages and across a
 * programme's check-ins (`./chart.ts`), in one place the pages, the file of
 * numbers and the picture all read. Pure, with no import, so a client
 * component takes them without taking the counting.
 */

export type ChartShowWord = "counts" | "shares" | "average";

export const MAKE_CHART_WORDS = {
  /** The survey's tab, the card's heading and the way in from Run NAISI › Surveys. */
  tab: "Make a chart",
  title: "Make a chart",
  question: "Question",
  show: "Show",
  splitBy: "Split by",
  who: "Who",
  /** Split by: one chart for everybody counted, or one for each group. */
  splitNone: "Nothing, one chart",
  splitGroup: "Group, one chart each",
  /** The controls' button, for a browser that has not run the page's script. */
  draw: "Show",
  /** A bar of a question's average, when the question is one line. */
  average: "Average",
  downloadChart: "Download the chart",
  downloadNumbers: "Download the numbers",
  /** Under the downloads: why neither is a recorded download. */
  downloadsNote: "The chart and its numbers name nobody, so downloading them isn’t recorded.",
  noQuestions: "None of this survey’s questions can be drawn as a chart: comments are listed on Results.",
  noAnswers: "No answers yet.",
  /** A week of a check-in chart one chart has no answers in. */
  noAnswersWeek: "No answers",
  /** A week's column with nothing to show yet. */
  dot: "·",
  /** The words a screen reader says for a dot. */
  dotSaid: "no answers",
  /** A check-in's own chart leads to the chart of its programme's check-ins. */
  everyCheckIn: "Chart every check-in of this programme",
  /** The way back to Run NAISI › Surveys, above a programme's check-ins. */
  crumb: "Surveys",
  checkInsMissingTitle: "No check-ins here",
  checkInsMissing:
    "This address names no programme with check-ins. Programmes with check-ins are listed on Run NAISI › Surveys, under each programme’s weekly check-ins.",
  /** The chip beside a programme's check-ins: they come round at every session. */
  everySession: "Every session",
  /** The picture's own line, at its foot. */
  pictureFrom: "NAISI survey results",
  pictureFailed: "This browser couldn’t make the picture. Try again, or try another browser.",
} as const;

/** "Counts", "Shares, by week", "Average, by week": a choice of Show. */
export function showWords(show: ChartShowWord, byWeek: boolean): string {
  const word = show === "counts" ? "Counts" : show === "shares" ? "Shares" : "Average";
  return byWeek ? `${word}, by week` : word;
}

/** "Average by week, by group", "Counts", "Shares, by group": what the chart shows, as its heading says it. */
export function chartHeadingWords(show: ChartShowWord, byWeek: boolean, byGroup: boolean): string {
  const word = show === "counts" ? "Counts" : show === "shares" ? "Shares" : "Average";
  if (byWeek) return byGroup ? `${word} by week, by group` : `${word} by week`;
  return byGroup ? `${word}, by group` : word;
}

/**
 * The scale the charts are drawn on: "Same 1 to 5 scale in every chart",
 * "On a 1 to 5 scale", "Same scale in every chart: 0 to 14 answers". An
 * average always says its scale; one chart of counts or shares says nothing,
 * each bar carrying its own figure.
 */
export function scaleWords(show: ChartShowWord, low: number, high: number, unit: string, several: boolean): string {
  if (show !== "average" && !several) return "";
  const range = show === "counts" ? `0 to ${high} ${high === 1 ? "answer" : "answers"}` : `${low} to ${high}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
  if (show === "average" && unit === "") return several ? `Same ${range} scale in every chart` : `On a ${range} scale`;
  return several ? `Same scale in every chart: ${range}` : `On a scale of ${range}`;
}

/** Beside the scale of a chart by week: what a dot means. */
export const DOT_WORDS = "a dot is a week with no answers";

/** "Showing 4 of 11 groups.", above the press that shows the rest. */
export function showingWords(shown: number, of: number): string {
  return `Showing ${shown} of ${of} groups.`;
}

/** "Show all 11 groups": the press that shows the rest. */
export function showAllGroupsWords(of: number): string {
  return `Show all ${of} groups`;
}

/** "W3", under a week's column. */
export function weekShortWords(weekNumber: number): string {
  return `W${weekNumber}`;
}

/** "Week 3", a week's block of bars, and its row of the numbers. */
export function weekLongWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** "14 answers", under a chart's name. */
export function chartAnswersWords(n: number): string {
  return `${n} ${n === 1 ? "answer" : "answers"}`;
}

/** What a screen reader says of one column or bar: "Week 3: 4.2, from 5 answers", "5: Very: 7". */
export function barSaidWords(label: string, figure: string, from: number | null): string {
  if (!figure) return `${label}: ${MAKE_CHART_WORDS.dotSaid}`;
  return from === null ? `${label}: ${figure}` : `${label}: ${figure}, from ${chartAnswersWords(from)}`;
}

/** "AGI Strategy check-ins", a programme's check-ins as their page is titled. */
export function checkInsTitleWords(programmeName: string): string {
  return `${programmeName} check-ins`;
}

/** "Weeks 1 to 3 · 139 answers", under a programme's check-ins' title. */
export function checkInsLineWords(weeks: readonly number[], answers: number): string {
  const first = weeks.length > 0 ? Math.min(...weeks) : null;
  const last = weeks.length > 0 ? Math.max(...weeks) : null;
  const span = first === null ? "" : first === last ? `Week ${first}` : `Weeks ${first} to ${last}`;
  return [span, chartAnswersWords(answers)].filter(Boolean).join(" · ");
}

/** The file of a chart, its picture and its numbers: "agi-strategy-check-ins-chart-2026-11-05". */
export function chartFileWords(name: string, today: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "survey"}-chart-${today}`;
}

/** What the numbers' file calls its columns, by what the chart shows. */
export const CHART_FILE_WORDS = {
  survey: "Survey",
  question: "Question",
  showing: "Showing",
  who: "Who",
  answers: "Answers counted",
  group: "Group",
  week: "Week",
  part: "Part",
  answer: "Answer",
  count: "Count",
  of: "Of",
  share: "Share",
  average: "Average",
  from: "From answers",
} as const;
