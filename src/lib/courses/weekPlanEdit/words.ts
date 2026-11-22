/**
 * THE WORDS OF A RUN'S WEEK PLAN ON A PROGRAMME'S WEEKS TAB, for the list,
 * its controls and questions, and the route that changes the plan. No server
 * import, so the page and the route say the same thing.
 *
 * The design's words are copied exactly, with their apostrophes. The site
 * records nobody opening a page, so where the design said nobody had opened
 * a week these say what is true instead. The sentence under the list says
 * the owner's rule as it stands for the run: weeks and breaks move or go
 * only while nothing is kept against the run's weeks; a break, or a week at
 * the end, can be added until the groups go out; after that the plan is read
 * only, in the run editor's sentence.
 */

import { WEEK_PLAN_READ_ONLY } from "../groupPage/words";
import { MAX_BREAK_LABEL, MAX_PLAN_ENTRIES } from "./model";

export { WEEK_PLAN_READ_ONLY };

// ---------------------------------------------------------------------------
// The list and its controls
// ---------------------------------------------------------------------------

export const MOVE_UP = "Move up";
export const MOVE_DOWN = "Move down";
export const REMOVE_ASK = "Remove…";
export const ADD_A_WEEK = "Add a week";
export const ADD_A_BREAK = "Add a break";

/** Each control's name to assistive technology: "Move week 2 up", "Remove the break after week 2…". */
export function controlName(what: string, control: "up" | "down" | "remove"): string {
  if (control === "up") return `Move ${what} up`;
  if (control === "down") return `Move ${what} down`;
  return `Remove ${what}…`;
}
/** "week 2", or "Reading week" for a break. */
export function entryName(entry: { kind: "week"; weekNumber: number } | { kind: "break"; label: string }): string {
  return entry.kind === "week" ? `week ${entry.weekNumber}` : entry.label;
}

/** A break's line: "Break", then its label, then its days. */
export const BREAK_WORD = "Break";
/** "Mon 15 Feb to Sun 21 Feb · no sessions". */
export function breakDaysWords(range: string): string {
  return range ? `${range} · no sessions` : "No sessions";
}

/** The same, once decision day has begun: week 1 stays as it is. */
export const PLAN_CAN_CHANGE_AFTER_WEEK_ONE =
  "Weeks after week 1 and breaks can move or go until anything is done on the run, and a break or a week at the end can be added until groups go out.";
/** Under the list while nothing is kept against the run's weeks and its groups have not gone out. */
export const PLAN_CAN_CHANGE =
  "Weeks and breaks can move or go until anything is done on the run, and a break or a week at the end can be added until groups go out.";
/** In the list's place when the plan has no weeks or breaks yet. */
export const NO_WEEKS_YET = "The run has no weeks in its plan yet.";

// ---------------------------------------------------------------------------
// Add a break
// ---------------------------------------------------------------------------

export const BREAK_LABEL = "Label";
export const BREAK_LABEL_EXAMPLE = "Reading week";
export const BREAK_AFTER = "After";
/** "Week 2", one choice of After. */
export function afterWeekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}
export const ADD_BREAK_HINT = "No group meets that week, and later weeks move on by one. Nobody is emailed, since groups haven’t gone out.";
/** The same, when a group keeps its own calendar, which the run's plan does not reach. */
export function addBreakHintOwnCalendars(groups: readonly string[]): string {
  const who = groups.length === 1 ? `${groups[0]}, which keeps its own calendar` : `${joinNames(groups)}, which keep their own calendars`;
  return `No group meets that week but ${who}, and later weeks move on by one. Nobody is emailed, since groups haven’t gone out.`;
}
export const CANCEL = "Cancel";
export const ADD_THE_BREAK = "Add the break";

// ---------------------------------------------------------------------------
// Removing a week or a break
// ---------------------------------------------------------------------------

export function removeWeekTitle(weekNumber: number): string {
  return `Remove week ${weekNumber}?`;
}
/**
 * What goes with a week, said as exactly what the route deletes: the week's
 * page, which holds only its title and settings (a week holding anything
 * else is never removed), and nothing at all for a week with no page.
 */
export function removeWeekBody(weekNumber: number, title: string, hasPage: boolean, laterWeeks: boolean): string {
  const goes = !hasPage
    ? `Week ${weekNumber} has no page yet, so nothing goes with it.`
    : title.trim()
      ? `Week ${weekNumber}, ${title.trim()}, goes with its title and settings.`
      : `Week ${weekNumber} goes with its settings.`;
  return laterWeeks ? `${goes} Later weeks move up by one.` : goes;
}
/** The line under it: what is true of the run, in place of the design's "Nobody has opened it". */
export function removeWhoWords(anybodyOnRun: boolean): string {
  return anybodyOnRun ? "Nobody on the run has done anything yet." : "Nobody is on the run yet.";
}
export function keepWeekWords(weekNumber: number): string {
  return `Keep week ${weekNumber}`;
}
export function removeWeekWords(weekNumber: number): string {
  return `Remove week ${weekNumber}`;
}
export function removeBreakTitle(label: string): string {
  return `Remove ${label}?`;
}
export function removeBreakBody(laterWeeks: boolean): string {
  return laterWeeks ? "Nothing is deleted. The weeks after it each start a week earlier." : "Nothing is deleted.";
}
export const KEEP_THE_BREAK = "Keep the break";
export const REMOVE_THE_BREAK = "Remove the break";

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const PLAN_NOT_YOURS = "Only the programme’s lead and admins can change the week plan.";
export const PLAN_BODY = "Say which change to make to the week plan.";
export const RUN_GONE = "That run isn’t on the site.";
export const NOT_NAMED = "No programme names this run, so its week plan changes in the run’s editor.";
export const RUN_FINISHED = "This run has finished, so its week plan can’t change.";
export const RUN_CANCELLED = "This run was cancelled, so its week plan can’t change.";
export const RUN_ARCHIVED = "This run is archived, so its week plan can’t change.";
export const PLAN_STALE = "The week plan has changed since this page opened. Reload the page and try again.";
export const PLAN_FULL = `A week plan holds ${MAX_PLAN_ENTRIES} weeks and breaks at most.`;
export const BREAK_LABEL_PROBLEM = `Give the break a label of ${MAX_BREAK_LABEL} characters or fewer, such as Reading week.`;
export const NO_SUCH_ENTRY = "That week or break isn’t in the plan any more. Reload the page.";
export const CANNOT_MOVE = "That week or break can’t move that way.";

/** What stops weeks and breaks moving, said under the list and as the refusal. */
const STAY = "so weeks and breaks stay where they are. A break, or a week at the end, can still be added until groups go out.";
export const DONE_WORK = `Somebody has already ticked, written or picked something on this run, ${STAY}`;
export const DONE_RECORDS = `Records are already kept against this run’s weeks, such as a register, a review, a note, a request, a reminder or the showcase week, ${STAY}`;
export const DONE_WEEK_ONE = `Week 1 is open to everybody holding a place, ${STAY}`;
/** Which of a group's own records about its weeks stops them. */
export type GroupKept = "copy" | "change" | "mode" | "calendar";
export function doneGroupWords(groupName: string, kept: GroupKept): string {
  const what =
    kept === "copy"
      ? "has its own copy of a week"
      : kept === "change"
        ? "has a change to one of its weeks"
        : kept === "mode"
          ? "has a week set to meet online or in person on its own"
          : "keeps its own calendar";
  return `${groupName} ${what}, ${STAY}`;
}

/** Once decision day has begun: which page is week 1 stays as it is. */
export const WEEK_ONE_FIXED =
  "People holding a place can open week 1 as soon as it’s ready, so which week is week 1 can’t change now that decisions have gone out. Move or remove a later week instead.";

/** The design's refusal of a week with blocks in it, word for word. */
export function removeHasBlocks(weekNumber: number): string {
  return `Week ${weekNumber} has blocks in it. Copy what you need, then remove it, or leave it and add a week.`;
}
export function removeHasOlderMaterial(weekNumber: number): string {
  return `Week ${weekNumber} has readings or exercises written before blocks, so it can’t be removed here. Leave it and add a week instead.`;
}
export function removeHasHistory(weekNumber: number): string {
  return `Week ${weekNumber} keeps earlier versions in its history, so it can’t be removed. Leave it, or add a week.`;
}
export function guideHolds(weekNumber: number): string {
  return `The course’s facilitator guide has a session plan or notes for week ${weekNumber}, which every run of the course reads by week number, so this change isn’t made here. Leave the weeks where they are, or add a break instead.`;
}
export function beingEdited(weekNumber: number): string {
  return `Week ${weekNumber} is being edited right now, so it can’t move or go. Try again once its editor has finished.`;
}
const COUNT = new Intl.NumberFormat("en-GB");
/** Too much to move in one change: by the number of saved versions when that is the cause, else by size. */
export function tooBigWords(records: number | null): string {
  const what = records === null ? "That would move too much at once for one change." : `That would move ${COUNT.format(records)} saved versions at once, more than one change can carry.`;
  return `${what} Leave the weeks where they are, or add a break instead.`;
}
export function addressTakenWords(weekNumber: number): string {
  return `Week ${weekNumber}’s address holds a page no week of the plan uses, so nothing changed. Reload the page and try again.`;
}

// ---------------------------------------------------------------------------
// A plan out of step with its pages, and pages after its last week
// ---------------------------------------------------------------------------

/** In place of the list's controls, and the line under it, while the plan is out of step. */
export const OUT_OF_STEP_LINE =
  "The plan’s weeks don’t match the week pages people see, so the plan can’t change until they do. Matching them moves no page and deletes nothing.";
export const MATCH_PAGES = "Match the plan to the pages";
/** The route's refusal of any other change while the plan is out of step. */
export const OUT_OF_STEP =
  "The plan’s weeks don’t match the week pages people see. Press Match the plan to the pages on the Weeks tab first: it moves no page and deletes nothing.";
export const ALREADY_MATCHES = "The plan already matches the week pages.";
export const MATCHED = "The plan now matches the week pages.";

/** A page after the plan's last week, by its title. */
export function leftBehindWords(title: string): string {
  return title ? `A week page sits after the plan’s last week: ${title}.` : "A week page sits after the plan’s last week.";
}
export function putBackWords(weekNumber: number): string {
  return `Put it back as week ${weekNumber}`;
}
export const REMOVE_LEFT = "Remove the page";
export const REMOVE_LEFT_TITLE = "Remove this page?";
export const REMOVE_LEFT_BODY = "It holds only its title and settings, and nothing is kept against the run’s weeks. Nothing else is deleted.";
export const KEEP_LEFT = "Keep the page";
export function putBackByAdding(weekNumber: number): string {
  return `Something is already kept against this run’s weeks, so this page stays where it is. Press Add a week until the plan reaches week ${weekNumber}: week ${weekNumber} is then this page.`;
}
export function putBackEarlierFirst(weekNumber: number): string {
  return `Put back the page after the plan’s last week first: it becomes week ${weekNumber}.`;
}
export const LEFT_HOLDS = "This page holds blocks, readings or saved versions, so it isn’t removed.";
export function leftHoldsSomething(weekNumber: number): string {
  return `${LEFT_HOLDS} Put it back as week ${weekNumber} instead.`;
}
/** The next week's address holds saved versions and no page: Add a week takes them. */
export function pressAddFirst(weekNumber: number): string {
  return `Press Add a week first: week ${weekNumber} then takes the saved versions kept at its address.`;
}
/** A plan whose stored week numbers are out of order, which only a write from outside the site's pages makes. */
export const NUMBERS_OUT_OF_ORDER =
  "This plan’s week numbers are out of order, which only a change made outside these pages can do, and no change here can put them right without changing what people see. Ask whoever changed the plan that way to put the numbers back in order.";
export const NOT_LEFT_BEHIND = "That page isn’t after the plan’s last week any more. Reload the page.";
export function putBackDoneWords(weekNumber: number): string {
  return `The page is week ${weekNumber} now.`;
}
export const LEFT_REMOVED = "The page is removed.";

// ---------------------------------------------------------------------------
// A move or a removal people holding a place, or the public, will notice
// ---------------------------------------------------------------------------

/** When a change moves week 1's dates once decision day has begun. */
export const FIRST_SESSIONS_MOVE = "Every group’s first session moves a week, and people holding a place see the new dates on their Home page.";
/** Beside it, once an email offering a freed place has been sent on the form. */
export const FREED_EMAIL_NAMED = "An email offering a freed place may already have named the old start date.";
/** When a change renumbers the weeks of the course's showcase run. */
export const PUBLIC_PAGES_CHANGE = "The course’s public week pages show the new order.";
export const NOBODY_EMAILED = "Nobody is emailed.";
export function moveTitle(what: string, direction: "up" | "down"): string {
  return `Move ${what} ${direction}?`;
}
export const MOVE_IT = "Move it";
export const KEEP_IT = "Keep it where it is";

/** The older Normalise week ids route, on a run a programme names. */
export const NAMED_RUN_PLAN = "A programme names this run, so its week plan changes on the programme’s Weeks tab.";

/** Under the list when nothing can move or go but a break or a week at the end can still be added. */
export const ADD_ONLY_LINE = "A break, or a week at the end, can be added until groups go out.";

// ---------------------------------------------------------------------------
// What a change did
// ---------------------------------------------------------------------------

export function weekAddedWords(weekNumber: number, adopted: boolean): string {
  return adopted ? `Week ${weekNumber} added. It holds the page already kept at its address.` : `Week ${weekNumber} added.`;
}
export function breakAddedWords(label: string, afterWeek: number): string {
  return `${label} added after week ${afterWeek}.`;
}
export const MOVED = "Moved.";
export function weekRemovedWords(weekNumber: number): string {
  return `Week ${weekNumber} removed.`;
}
export function breakRemovedWords(label: string): string {
  return `${label} removed.`;
}

/** "Group A", "Group A and Group B", "Group A, Group B and Group C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
