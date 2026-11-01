import type { SurveyQuestion } from "./items";
import { surveyResults, type AnswerSet, type QuestionResult } from "./results";

/**
 * A QUESTION'S RESULT AS BARS, and who is behind each one.
 *
 * Every chart on a survey's results is drawn from the totals `results.ts`
 * counts, never counted again here: a choice's answers in the question's own
 * order (and "which mattered most" as a second group), a scale's points from
 * the top of the scale down, one group per line of a grid, and a percentage or
 * a number by its bands. Each bar carries its count and its share of the
 * people who answered that question, or that line.
 *
 * EACH BAR HAS A KEY, worked out from where it sits in its result ("o2" is a
 * choice's third answer, "s1.4" the fifth point of a grid's second line), so
 * the key is the same for one person's answers counted alone as for everybody's
 * counted together. That is how an admin's "See who" finds the people behind a
 * bar (`behindBar`): each person's answers are counted alone, by the same
 * counting, and the bar's count is how many of them it holds. The count on the
 * button and the people it opens can never disagree.
 *
 * A comment's key is the id of the answer it came from, never its place in a
 * list: an answer that comes in between the page being drawn and the press
 * would move every place, and the press would name the wrong person.
 *
 * Keys are for admins alone: the lead's pages draw these bars without them.
 *
 * Pure: no reads and no clock.
 */

export type ChartBar = {
  /** Where the bar sits in its result: the same for one person's answers as for everybody's. */
  key: string;
  label: string;
  count: number;
  /** Of the people who answered the question, or the line: a whole percent. */
  percent: number;
};

export type ChartGroup = {
  /** "" for a question's one group; a grid's line, or "which mattered most". */
  heading: string;
  /** How many answered what the group counts. */
  of: number;
  /** A scale's average, for a grid's line; null otherwise. */
  mean: number | null;
  bars: ChartBar[];
};

/** One choice of a filter above an admin's charts: its value in the page's address, and what it says. */
export type FilterChoice = { value: string; label: string };

const percentOf = (count: number, of: number) => (of > 0 ? Math.round((count / of) * 100) : 0);

/** A scale's point as its bar says it: "5: Loved it" at either end that has words, the number elsewhere. */
export function pointLabel(point: number, bottom: number, top: number, bottomWords: string, topWords: string): string {
  if (point === top && topWords) return `${point}: ${topWords}`;
  if (point === bottom && bottomWords) return `${point}: ${bottomWords}`;
  return String(point);
}

/**
 * The bars of one question's result, in groups. A comments question has none:
 * its comments are listed, not charted.
 */
export function chartGroupsOf(result: QuestionResult): ChartGroup[] {
  switch (result.kind) {
    case "options": {
      const groups: ChartGroup[] = [
        {
          heading: "",
          of: result.respondents,
          mean: null,
          bars: result.options.map((option, at) => ({ key: `o${at}`, label: option.label, count: option.count, percent: option.percent })),
        },
      ];
      if (result.most) {
        groups.push({
          heading: result.most.title,
          of: result.most.respondents,
          mean: null,
          bars: result.most.options.map((option, at) => ({ key: `m${at}`, label: option.label, count: option.count, percent: option.percent })),
        });
      }
      return groups;
    }
    case "scale":
      return result.rows.map((row, line) => {
        const top = result.min + row.counts.length - 1;
        const bars: ChartBar[] = [];
        // From the top of the scale down, as a rating is read.
        for (let at = row.counts.length - 1; at >= 0; at -= 1) {
          const point = result.min + at;
          bars.push({
            key: `s${line}.${at}`,
            label: pointLabel(point, result.min, top, result.minLabel, result.maxLabel),
            count: row.counts[at],
            percent: percentOf(row.counts[at], row.respondents),
          });
        }
        return { heading: row.label, of: row.respondents, mean: row.mean, bars };
      });
    case "value":
      return [
        {
          heading: "",
          of: result.respondents,
          mean: null,
          bars: result.bands.map((band, at) => ({ key: `b${at}`, label: band.label, count: band.count, percent: percentOf(band.count, result.respondents) })),
        },
      ];
    case "comments":
      return [];
  }
}

/** Whether `key` has the shape of a bar's key. Says nothing of whether the bar is there. */
export function isBarKey(key: unknown): key is string {
  return typeof key === "string" && /^(?:[omb]\d{1,3}|s\d{1,3}\.\d{1,3})$/.test(key);
}

/** The count of the bar `key` in a result, or null when the result has no such bar. */
export function barCountOf(result: QuestionResult | undefined, key: string): number | null {
  if (!result) return null;
  for (const group of chartGroupsOf(result)) {
    for (const bar of group.bars) if (bar.key === key) return bar.count;
  }
  return null;
}

/** The bar `key` of a result, with its group's heading, or null. */
export function barOf(result: QuestionResult | undefined, key: string): (ChartBar & { heading: string }) | null {
  if (!result) return null;
  for (const group of chartGroupsOf(result)) {
    for (const bar of group.bars) if (bar.key === key) return { ...bar, heading: group.heading };
  }
  return null;
}

/** One person's answers to `question` counted alone, by the same counting as everybody's. */
function aloneResult(question: SurveyQuestion, set: AnswerSet): QuestionResult | undefined {
  return surveyResults([question], [set])[0];
}

/**
 * WHO IS BEHIND A BAR: the sets among `sets` whose answer to `question` the
 * bar `key` counts. Each set is counted alone, by the same counting the bar
 * was drawn from, so `behindBar(...).length` is the bar's count whenever
 * `sets` are the answers it was counted from.
 */
export function behindBar<T extends AnswerSet>(question: SurveyQuestion, sets: readonly T[], key: string): T[] {
  return sets.filter((set) => (barCountOf(aloneResult(question, set), key) ?? 0) > 0);
}

/**
 * A comments question's comments, each with the key of the answer it came
 * from, in the order of `sets`: the same comments, in the same order, as the
 * question's result counted from them.
 */
export function commentsWithKeys<T extends AnswerSet & { id: string }>(question: SurveyQuestion, sets: readonly T[]): { text: string; key: string }[] {
  const out: { text: string; key: string }[] = [];
  for (const set of sets) {
    const alone = aloneResult(question, set);
    if (alone?.kind !== "comments") continue;
    for (const text of alone.comments) out.push({ text, key: set.id });
  }
  return out;
}

/** How comments are put in the order of their words: what the lead's pages and the admins' both use. */
export function byWords(a: string, b: string): number {
  return a.localeCompare(b, "en-GB");
}
