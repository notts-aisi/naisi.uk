import { READY_OPENS } from "../weekReady";
import { dayWords } from "../sessionChange/words";

/**
 * THE WORDS OF A PROGRAMME'S WEEKS TAB (board pr-weeks), in one place, for
 * the list, the week's page and the routes behind them. No server import, so
 * a page and a route say the same thing in the same words.
 *
 * The board's words are copied exactly, with its apostrophes. The words it
 * does not draw are written in the same voice and listed in the build notes
 * for the boards' designers to confirm.
 */

/** How long before its first session a week should be ready: pr-weeks' "Have each ready 7 days before its first session." */
export const READY_BY_DAYS = 7;

/** pr-weeks' line above the weeks: when each week opens, and when to have it ready. */
export const WEEKS_LINE = `${READY_OPENS} Have each ready ${READY_BY_DAYS} days before its first session.`;

/** The link beside the line. */
export const COPY_WEEKS = "Copy weeks from the course";

/** The list's eyebrow, and its name to assistive technology. */
export const WEEKS_IN_ORDER = "Weeks, in order";

/** The tab's name. */
export const WEEKS_TAB = "Weeks";

/** A week's state on the list: Ready once marked, Empty while it holds nothing, Draft otherwise. */
export const STATE_WORDS = { ready: "Ready", draft: "Draft", empty: "Empty" } as const;

/** "Week 3". */
export function weekWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** "First session Thu 29 Oct", from the earliest of the groups' sessions that week; a plain line while no group meets that week. */
export function firstSessionWords(dateKey: string | null): string {
  const day = dateKey ? dayWords(dateKey) : "";
  return day ? `First session ${day}` : "No session set yet";
}

/** "Ready by Thu 22 Oct"; nothing while the week has no first session. */
export function readyByWords(dateKey: string | null): string {
  const day = dateKey ? dayWords(dateKey) : "";
  return day ? `Ready by ${day}` : "";
}

/** Where the owner is shown and nobody stands as the programme's lead or a helper: the owner is nobody yet. */
export const NO_OWNER = "No owner yet";

/**
 * The line under the list, about where the weeks meet (pr-weeks: "AGI
 * Strategy meets in person every week."). A week counts as online when every
 * group meeting that week meets online, through "Change a session" or this
 * tab; `partly` are weeks where some groups do and some do not.
 */
export function meetsLine(name: string, online: readonly number[], partly: readonly number[]): string {
  const who = name.trim() || "This programme";
  if (online.length === 0 && partly.length === 0) return `${who} meets in person every week.`;
  const parts: string[] = [];
  if (online.length > 0) parts.push(`online in ${weeksList(online)}`);
  if (partly.length > 0) parts.push(`online for some groups in ${weeksList(partly)}`);
  return `${who} meets ${joinWords(parts)}, and in person the other weeks.`;
}

/** "week 3", "weeks 3 and 5", "weeks 2, 3 and 5". */
export function weeksList(numbers: readonly number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b).map(String);
  return sorted.length === 1 ? `week ${sorted[0]}` : `weeks ${joinWords(sorted)}`;
}

/** "a", "a and b", "a, b and c". */
export function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Copy weeks from the course", its page: the lede, a source's count and button, and when there is nothing to copy. */
export function copyLede(courseTitle: string): string {
  const course = courseTitle.trim() || "this course";
  return `Copy the weeks another run of ${course} holds. Only the weeks this programme doesn’t have yet are copied, each with its ids, so nothing anybody has ticked or written is lost. Weeks it has already stay as they are.`;
}
export function sourceWeeksWords(weeks: number): string {
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}
export const COPY_ITS_WEEKS = "Copy its weeks";
export function nothingToCopy(courseTitle: string): string {
  return `No other run of ${courseTitle.trim() || "this course"} has weeks to copy yet.`;
}
/** For an admin: where a saved template is applied instead. */
export const TEMPLATES_LINE = "A saved template is applied in the run’s editor.";
/** What a copy did, from the route's own counts. */
export function copiedWords(created: number, skipped: number): string {
  const made = created === 0 ? "No weeks were copied" : created === 1 ? "1 week copied" : `${created} weeks copied`;
  if (skipped === 0) return `${made}.`;
  return `${made}. ${skipped === 1 ? "1 week this programme already had was" : `${skipped} weeks this programme already had were`} left as ${skipped === 1 ? "it was" : "they were"}.`;
}

/** "This week's settings" on a week's page (pr-weeks). */
export const SETTINGS_TITLE = "This week’s settings";
export const OWNER_LABEL = "Owner";
export const OWNER_HINT = "The lead or a helper.";
export const THIS_WEEK_IS = "This week is";
export const IN_PERSON = "In person";
export const ONLINE = "Online";
export const ONLINE_HINT = "Online weeks show a join link on the programme page, never in emails.";
export const GUIDE_LABEL = "Facilitator guide";
export const PREVIEW = "Preview as a fellow";
export const SAVE_DRAFT = "Save draft";

/** The refusals and answers of the owner route. */
export const OWNER_NOT_YOURS = "Only the programme’s lead and admins can choose a week’s owner.";
export const OWNER_NOT_ONE = "Choose the programme’s lead or one of its helpers.";

/** The refusals and answers of the route that sets how a whole week meets. */
export const MODE_NOT_YOURS = "Only the programme’s lead and admins can say how a week meets.";
export function noLinkWords(weekNumber: number, groups: readonly string[]): string {
  const who = joinWords(groups);
  return `${who} ${groups.length === 1 ? "has" : "have"} no meeting link yet, so week ${weekNumber} can’t be online for ${groups.length === 1 ? "it" : "them"}. Its facilitators or an admin add the link in the group’s settings, then try again.`;
}
export function modeDoneWords(weekNumber: number, online: boolean, changed: number): string {
  if (changed === 0) return `Week ${weekNumber} was ${online ? "online" : "in person"} already.`;
  return `Week ${weekNumber} is ${online ? "online" : "in person"} now for ${changed === 1 ? "1 group" : `${changed} groups`}.`;
}
/** A group the press left alone, and why. */
export function leftAloneWords(group: string, why: "met" | "changed" | "no-session"): string {
  if (why === "met") return `${group} has met for this week already, so it was left as it was.`;
  if (why === "changed") return `${group}’s session this week was changed on its own (moved or cancelled), so it was left as it was.`;
  return `${group} has no session this week.`;
}
/** Under the two buttons when the groups meet differently that week. */
export function partlyOnlineWords(groups: readonly string[]): string {
  return `${joinWords(groups)} ${groups.length === 1 ? "meets" : "meet"} online this week; the other groups meet in person.`;
}

/** "Preview as a fellow": the line above the preview, and when there is nothing to preview. */
export function previewLine(weekNumber: number, groupName: string | null): string {
  const who = groupName ? `a fellow in ${groupName}` : "a fellow";
  return `Week ${weekNumber} as ${who} reads it. This is a preview: nothing here can be ticked or sent, and nobody’s answers are shown.`;
}
export function nothingToPreviewWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t written as blocks yet, so there is nothing to preview. Paste its Markdown and save a draft first.`;
}

/**
 * A week for one group (Q39): the lead's card on the week's page and a
 * facilitator's on their group's own week, in the same words.
 */
export function oneGroupTitle(weekNumber: number): string {
  return `Week ${weekNumber} for one group`;
}
export const GROUP_LABEL = "Group";
export function groupPasteLede(groupName: string): string {
  return `Copy the week as Markdown, change it and paste it back. Only ${groupName}’s week changes: the programme’s own week and every other group’s stay as they are. Every block keeps its id, so ticks and answers stay with their blocks.`;
}
/** Where a group's week stands: its own copy, with the day it was made, or the programme's. */
export function groupCopyLine(groupName: string, weekNumber: number, copy: { since: string | null } | null): string {
  if (copy) {
    return `${groupName} has its own copy of week ${weekNumber}${copy.since ? `, made ${copy.since}` : ""}. Changes to the programme’s week no longer reach it.`;
  }
  return `${groupName} reads the programme’s week ${weekNumber}. Saving here makes ${groupName} its own copy, and from then on changes to the programme’s week no longer reach it.`;
}
export function saveForWords(groupName: string): string {
  return `Save for ${groupName}`;
}
export function previewForWords(groupName: string): string {
  return `Preview as a fellow in ${groupName}`;
}
export const NO_GROUPS_YET = "The run has no groups that meet yet, so there is no group to change a week for.";

/** Mark ready, when the week cannot be marked yet. */
export function notPublishedWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t published yet. An admin publishes it in the run’s week editor, then it can be marked ready.`;
}
export function noPageWords(weekNumber: number): string {
  return `Week ${weekNumber} has no page on this run yet. An admin opens it in the run’s week editor, then its Markdown can be pasted here.`;
}

/** What somebody with a role on the programme who is neither its lead nor an admin is told, in place of the tab. */
export const WEEKS_NOT_YOURS_TITLE = "Only the programme’s lead and admins can open Weeks";
export const WEEKS_NOT_YOURS =
  "Weeks is where the programme’s weeks are written and marked ready, so only the programme’s lead or an admin can open it.";
