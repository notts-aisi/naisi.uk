import { allBlocks, type WeekBlock } from "../weekBlocks/model";
import { isCounted, type TaskNeeds } from "../weekBlocks/progress";
import { packNameOf, weekCheck, type CheckState, type NotDone } from "../weekWork/model";
import { addDaysToKey, isValidDateKey, londonWallClockToInstant } from "../weekPlan";

/**
 * THE WEEK'S THREE EMAILS, AS ARITHMETIC: when each goes, what a week asks
 * for, and what is left of one person's week.
 *
 *  - "WEEK N IS OPEN" goes 6 days before each of a group's sessions, to
 *    everybody holding a place in the group (`src/lib/courses/nextWeekEmail.ts`,
 *    sent by the `courses-next-week-email` job, or by finishing the register
 *    before it while that job is off).
 *  - THE REMINDERS go 3 days and 1 day before, only to the people whose week
 *    is not done, listing what is left (`courses-week-reminders`).
 *
 * All three at 9am in London, on the civil date that many days before the
 * session's own date: counted on the calendar and read off the wall, so a
 * clock change moves nothing.
 *
 * WHAT A WEEK ASKS FOR, and WHAT IS LEFT, are read in the scope the check
 * before Submit reads (`weekCheck`, `src/lib/courses/weekWork/model.ts`): the
 * readings, steps, packs and talks This week's tasks count, and every
 * reflection, set of fill-in boxes and written answer on the page. So the
 * email that says a week is open and the reminder that says what is left
 * name the same things the page names.
 *
 * Pure: no reads, no clock. The words are `./words.ts`.
 */

/** The wall clock every one of the week's emails goes at, in London. */
export const WEEK_EMAIL_CLOCK = "09:00";

/** "Week N is open": this many days before the session. */
export const WEEK_OPEN_DAYS_BEFORE = 6;

/** The reminders: these many days before the session, in the order they go. */
export const WEEK_REMINDER_DAYS = [3, 1] as const;

export type ReminderDays = (typeof WEEK_REMINDER_DAYS)[number];

/**
 * 9am in London on the civil date `daysBefore` days before `dateKey`, or null
 * when the date is not one ("cannot say", never "now").
 */
export function weekEmailSendAt(dateKey: string, daysBefore: number): Date | null {
  if (!isValidDateKey(dateKey)) return null;
  if (!Number.isInteger(daysBefore) || daysBefore < 0) return null;
  try {
    return londonWallClockToInstant(addDaysToKey(dateKey, -daysBefore), WEEK_EMAIL_CLOCK);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// What a week asks for
// ---------------------------------------------------------------------------

/** One line of what a week asks for, as "Week N is open" lists it. */
export type WeekAsk =
  | { kind: "readings"; count: number }
  | { kind: "steps"; count: number }
  /** A Choose one: the reading of the pack the person has. `name` is "pathway", or "pack". */
  | { kind: "pack"; name: string }
  | { kind: "reflections"; count: number }
  /** A set of fill-in boxes, by its title ("My action plan"). */
  | { kind: "boxes"; title: string }
  | { kind: "answers"; count: number }
  | { kind: "talks"; count: number }
  /** A week written before blocks: its readings and videos that are not optional. */
  | { kind: "materials"; count: number }
  /** A week written before blocks: its exercises to write up. */
  | { kind: "exercises"; count: number };

/** The ids This week's counted tasks need, each once. */
function countedIds(tasks: readonly TaskNeeds[], of: (needs: TaskNeeds) => readonly string[]): Set<string> {
  return new Set(tasks.filter(isCounted).flatMap(of));
}

/**
 * What a week written as blocks asks for, in page order of kind: the readings
 * and steps to tick, each pack's reading, the reflections, the fill-in boxes,
 * the written answers and the talks. Empty for a week that asks for nothing.
 */
export function blockWeekAsks(blocks: readonly WeekBlock[], tasks: readonly TaskNeeds[]): WeekAsk[] {
  const everything = allBlocks(blocks);
  const ticks = countedIds(tasks, (needs) => needs.tickIds);
  const chooseOnes = countedIds(tasks, (needs) => needs.chooseOneIds);
  const talks = countedIds(tasks, (needs) => needs.talkIds);
  let readings = 0;
  let steps = 0;
  let reflections = 0;
  let answers = 0;
  let talkCount = 0;
  const packs: WeekAsk[] = [];
  const boxes: WeekAsk[] = [];
  for (const block of everything) {
    if (block.type === "source" && ticks.has(block.id)) readings += 1;
    else if (block.type === "checklist") steps += block.items.filter((item) => ticks.has(item.id)).length;
    else if (block.type === "chooseOne" && chooseOnes.has(block.id)) packs.push({ kind: "pack", name: packNameOf(block) });
    else if (block.type === "reflection") reflections += 1;
    else if (block.type === "fillIn") boxes.push({ kind: "boxes", title: block.title.trim() });
    else if (block.type === "writtenAnswer") answers += 1;
    else if (block.type === "cases" && talks.has(block.id)) talkCount += 1;
  }
  const out: WeekAsk[] = [];
  if (readings > 0) out.push({ kind: "readings", count: readings });
  if (steps > 0) out.push({ kind: "steps", count: steps });
  out.push(...packs);
  if (reflections > 0) out.push({ kind: "reflections", count: reflections });
  out.push(...boxes);
  if (answers > 0) out.push({ kind: "answers", count: answers });
  if (talkCount > 0) out.push({ kind: "talks", count: talkCount });
  return out;
}

/** What a week written before blocks asks for: its materials that are not optional, and its required exercises. */
export function legacyWeekAsks(week: {
  materials?: readonly { optional?: boolean }[] | null;
  exercises?: readonly { required?: boolean }[] | null;
}): WeekAsk[] {
  const materials = (week.materials ?? []).filter((material) => !material.optional).length;
  const exercises = (week.exercises ?? []).filter((exercise) => exercise.required).length;
  const out: WeekAsk[] = [];
  if (materials > 0) out.push({ kind: "materials", count: materials });
  if (exercises > 0) out.push({ kind: "exercises", count: exercises });
  return out;
}

// ---------------------------------------------------------------------------
// What is left of one person's week
// ---------------------------------------------------------------------------

/**
 * WHAT IS LEFT OF ONE PERSON'S WEEK, as a reminder lists it: everything the
 * check before Submit names (`weekCheck`), and, for a week with something to
 * write that is not submitted yet, that it is not submitted. Asked only of a
 * week that is not done, so it is never empty: such a week either is not
 * submitted, or has something its tasks count still to tick.
 */
export type WeekLeft = { items: NotDone[]; notSubmitted: boolean };

export function weekLeft(input: {
  blocks: readonly WeekBlock[];
  tasks: readonly TaskNeeds[];
  state: CheckState;
  writes: boolean;
  submitted: boolean;
}): WeekLeft {
  return {
    items: weekCheck(input.blocks, input.tasks, input.state),
    notSubmitted: input.writes && !input.submitted,
  };
}
