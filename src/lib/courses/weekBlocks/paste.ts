import { foundRows, thingsToCheck, type FoundRow } from "./found";
import { readWeekMarkdown } from "./markdownRead";
import { finishWeekBlocks, mergeWeekIds } from "./merge";
import { dayBeforeWords } from "./markdownWrite";
import {
  newWeekItemId,
  sanitizeWeekBlocks,
  weekBlocksProblems,
  type IdPrefix,
  type WeekBlock,
  type WeekItem,
} from "./model";

/**
 * A PASTED WEEK, READ (board pr-weeks, Option B, Q39): the Markdown read
 * into blocks, its ids settled against the week as stored, its pointers
 * worked out, then the found list, the things to check, and what stops it
 * being saved. The loader's route asks this for "Read it" and again for
 * "Save", so what is saved is exactly what was read.
 *
 * Pure: the route reads the stored week and counts the answers on what the
 * paste would take out (`removed`).
 */

/** The longest paste the loader reads, in characters: well past any week. */
export const MAX_PASTE_CHARS = 200_000;

export type PastedWeek = {
  /** The title from the Markdown's first line, or "" when it has none. */
  title: string;
  /** The blocks to store: ids settled, canonical. */
  blocks: WeekBlock[];
  found: FoundRow[];
  /** The board's "things to check": worth a look, never a reason to refuse. */
  checks: string[];
  /** What stops the week being saved. Empty when it can be. */
  problems: string[];
  /** What the week as stored has that this paste takes out. */
  removed: WeekItem[];
  kept: number;
  minted: number;
};

export function readPastedWeek(input: {
  markdown: string;
  /** The number of the week being loaded. */
  weekNumber: number;
  /** The week's blocks as stored now, or none. */
  stored: readonly WeekBlock[] | null | undefined;
  /**
   * The course's setting for work due the day before a session ("12:00"),
   * or null for the end of the day. Held against what the Markdown says.
   */
  dayBeforeTime?: string | null;
  mint?: (prefix: IdPrefix) => string;
}): PastedWeek {
  const parsed = readWeekMarkdown(input.markdown);
  const merged = mergeWeekIds(input.stored, parsed.blocks, input.mint ?? newWeekItemId);
  const finished = finishWeekBlocks(merged.blocks);
  const problems = [...parsed.problems, ...weekBlocksProblems(finished)];
  if (parsed.weekNumber !== null && parsed.weekNumber !== input.weekNumber) {
    problems.unshift(
      `This is week ${parsed.weekNumber}’s Markdown, and you’re loading week ${input.weekNumber}. Check the week, or change the first line.`,
    );
  }
  // What is stored is what the read side gives back; for blocks with no
  // problem the two are the same list.
  const blocks = problems.length === 0 ? sanitizeWeekBlocks(finished) : finished;
  return {
    title: parsed.title,
    blocks,
    found: foundRows({ title: parsed.title, weekNumber: input.weekNumber, blocks }, parsed.packTables),
    checks: [
      ...thingsToCheck({ markdown: input.markdown, blocks, packTables: parsed.packTables, leftOut: parsed.leftOut }),
      ...dueCheck(parsed.dayBeforeSaid, input.dayBeforeTime ?? null),
    ],
    problems: [...new Set(problems)],
    removed: merged.removed,
    kept: merged.kept,
    minted: merged.minted,
  };
}

/**
 * When the Markdown says written work is due on the day before by a time the
 * course's setting does not: "by noon the day before" against a course due by
 * the end of the day. The site goes by the setting; this says so.
 */
function dueCheck(said: string | null, setting: string | null): string[] {
  if (said === null || said === (setting ?? "")) return [];
  return [
    `The Markdown says written work is due ${dayBeforeWords(said || null)} the session; this course’s setting says ${dayBeforeWords(setting)}. The site goes by the setting: change it in the course’s details, or change the Markdown.`,
  ];
}
