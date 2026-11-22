/**
 * THE WORDS OF A RUN'S WEEK PLAN ON A PROGRAMME'S WEEKS TAB, for the list,
 * its controls and questions, and the route that changes the plan. No server
 * import, so the page and the route say the same thing.
 *
 * The drawn words are copied exactly, with their apostrophes. The site
 * records nobody opening a page, so where the drawing said nobody had opened
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
/** The line under it: what is true of the run, in place of the drawing's "Nobody has opened it". */
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
export const DONE_WORK = `People have already ticked, written or picked something on this run, kept against each week’s number, ${STAY}`;
export const DONE_RECORDS = `Records are already kept against this run’s weeks (a register, a review, notes or a request), ${STAY}`;
export const DONE_WEEK_ONE = `Week 1 is open to everybody holding a place, ${STAY}`;
export function doneGroupWords(groupName: string): string {
  return `${groupName} has its own copy of a week, a change to one of its weeks or its own calendar, ${STAY}`;
}

/** The drawing's refusal of a week with blocks in it, word for word. */
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
  return `The course’s facilitator guide has a session plan or notes for week ${weekNumber}, which every run of the course reads by week number, so this would show them against another week. Add a break instead, or leave the weeks where they are.`;
}
export function beingEdited(weekNumber: number): string {
  return `Week ${weekNumber} is being edited right now, so it can’t move or go. Try again once its editor has finished.`;
}
export function tooBigWords(records: number): string {
  return `That would move ${records.toLocaleString("en-GB")} saved records at once, more than one change can carry. Leave the weeks where they are, or add a break instead.`;
}
export function addressTakenWords(weekNumber: number): string {
  return `Week ${weekNumber}’s address holds a page no week of the plan uses, and this would write over it, so nothing changed.`;
}
export const DRIFTED_AND_DONE =
  "Some weeks of this plan are stored at another week’s address, and something is already kept against the run’s weeks, so the plan can’t change here.";

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
