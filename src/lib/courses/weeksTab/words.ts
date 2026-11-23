import { READY_OPENS } from "../weekReady";
import { dayWords } from "../sessionChange/words";

/**
 * THE WORDS OF A PROGRAMME'S WEEKS TAB, in one place, for
 * the list, the week's page and the routes behind them. No server import, so
 * a page and a route say the same thing in the same words.
 *
 * The board's words are copied exactly, with its apostrophes. The words it
 * does not draw are written in the same voice and listed in the build notes
 * for the boards' designers to confirm.
 */

/** How long before its first session a week should be ready: the Weeks tab's "Have each ready 7 days before its first session." */
export const READY_BY_DAYS = 7;

/** The Weeks tab's line above the weeks: when each week opens, and when to have it ready. */
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

/** A week whose first session has started: its review, an admin's alone. */
export const REVIEW_LINK = "Review";
/** What the programme's lead is shown in its place. */
export const REVIEW_ADMINS_ONLY = "Review: admins only";
/** The same week's notes about people: an admin's drafts, and the saved notes the lead reads. */
export const NOTES_LINK = "Notes";

/**
 * The line under the list, about where the weeks meet ("AGI
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

/**
 * "Copy weeks from the course", its page: the lede, a source's count and
 * button, and when there is nothing to copy. The lede is the board's, and it
 * is the promise both copies keep: "Copy its weeks" writes only the weeks
 * this run has no page for, and "Copy it in" only the weeks that are empty
 * (`src/lib/courses/weeksTab/fill.ts` says what empty means).
 */
export const COPY_LEDE = "Copying fills weeks that are empty. A week with anything in it is left as it is.";
/** The card of the course's other runs: "Other runs of AGI Strategy". */
export function otherRunsTitle(courseTitle: string): string {
  return `Other runs of ${courseTitle.trim() || "this course"}`;
}
export function sourceWeeksWords(weeks: number): string {
  return weeks === 1 ? "1 week" : `${weeks} weeks`;
}
export const COPY_ITS_WEEKS = "Copy its weeks";
export function nothingToCopy(courseTitle: string): string {
  return `No other run of ${courseTitle.trim() || "this course"} has weeks to copy yet.`;
}
/**
 * SAVED TEMPLATES, on the same page: each saved template of the course, for
 * the programme's lead and admins to copy in; "Delete…" and saving one are an
 * admin's. A template keeps no week plan, so it holds no breaks, and its line
 * says its count of weeks only.
 */
export const SAVED_TEMPLATES = "Saved templates";
/** When the course has none. */
export function noTemplatesWords(courseTitle: string): string {
  return `No templates of ${courseTitle.trim() || "this course"} are saved yet.`;
}
/** "Saved on Mon 19 Oct by Zach Levin · 6 weeks". */
export function templateLine(savedOn: string | null, savedBy: string, weeks: number): string {
  const when = savedOn ? `Saved on ${savedOn}` : "Saved";
  return `${when} by ${savedBy} · ${sourceWeeksWords(weeks)}`;
}
export const COPY_IT_IN = "Copy it in";
export const DELETE_ASK = "Delete…";
export function deleteTemplateTitle(label: string): string {
  return `Delete “${label}”?`;
}
export const DELETE_TEMPLATE_BODY = "Runs already made from it keep their weeks.";
export const KEEP_IT = "Keep it";
export const DELETE_THE_TEMPLATE = "Delete the template";
/** After a delete. */
export function deletedWords(label: string): string {
  return `“${label}” is deleted.`;
}
export const SAVE_AS_TEMPLATE = "Save this term’s weeks as a template";
export const TEMPLATE_NAME = "Template name";
export function templateNameExample(courseTitle: string, weeks: number): string {
  return `e.g. ${courseTitle.trim() || "AGI Strategy"}, ${sourceWeeksWords(weeks > 0 ? weeks : 6)}`;
}
/**
 * Under the name: what a saved template holds of each week. It keeps no week
 * plan, so no breaks; of a week's settings it keeps the title, summary and
 * questions, not pitching week, the owner or how it meets. (It also keeps the
 * run's Start here and Glossary, for the run editor's older copy; Copy it in
 * never writes those two.)
 */
export const TEMPLATE_HOLDS = "Saves each week’s blocks, title, summary and questions, in order. Never anybody’s work.";
export const SAVE_THE_TEMPLATE = "Save the template";
export function savedTemplateWords(label: string): string {
  return `“${label}” is saved.`;
}
/** A run whose plan has no weeks yet has no week to copy into. */
export const NO_PLAN_WEEKS = "This run’s plan has no weeks yet, so nothing was copied in.";
/** What a copy of a template did, from the route's own counts: written, left as they were, and past the run's last week. */
export function copiedInWords(copied: number, left: number, extra: number, planWeeks: number | null = null): string {
  if (planWeeks === 0) return NO_PLAN_WEEKS;
  const parts = [copied === 0 ? "No weeks were copied in." : copied === 1 ? "Copied 1 week in." : `Copied ${copied} weeks in.`];
  if (left > 0) parts.push("Weeks that had anything in them were left as they were.");
  if (extra > 0) {
    parts.push(
      extra === 1
        ? "1 of the template’s weeks is past this run’s last week, so it wasn’t copied."
        : `${extra} of the template’s weeks are past this run’s last week, so they weren’t copied.`,
    );
  }
  return parts.join(" ");
}
/** The copy route's refusal of anything but a fill to the programme's lead. */
export const FILL_ONLY_FOR_LEAD = "A programme’s lead copies a saved template only into the weeks that are empty.";
/** What a copy did, from the route's own counts. */
export function copiedWords(created: number, skipped: number): string {
  const made = created === 0 ? "No weeks were copied" : created === 1 ? "1 week copied" : `${created} weeks copied`;
  if (skipped === 0) return `${made}.`;
  return `${made}. ${skipped === 1 ? "1 week this programme already had was" : `${skipped} weeks this programme already had were`} left as ${skipped === 1 ? "it was" : "they were"}.`;
}

/** "This week's settings" on a week's page. */
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
 * A week for one group: the lead's card on the week's page and a
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

/** Beside Mark ready on a week not published yet (marking it ready publishes it, Zach, 26 October 2026). */
export function notPublishedWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t published yet: marking it ready publishes it.`;
}
/** Above the paste box on a week of the plan with no page yet (its first save makes it, Zach, 26 October 2026). */
export function noPageWords(weekNumber: number): string {
  return `Week ${weekNumber} has no page on this run yet: saving its Markdown here makes it.`;
}

/** What somebody with a role on the programme who is neither its lead nor an admin is told, in place of the tab. */
export const WEEKS_NOT_YOURS_TITLE = "Only the programme’s lead and admins can open Weeks";
export const WEEKS_NOT_YOURS =
  "Weeks is where the programme’s weeks are written and marked ready, so only the programme’s lead or an admin can open it.";

/**
 * The Course documents card, first on the tab, for an admin; a lead is given
 * the one line instead. The admin's lede says who reads each pair, since the
 * run's two are read by everyone holding a place, not in the facilitator
 * guide.
 */
export const DOCUMENTS_TITLE = "Course documents";
export const DOCUMENTS_ADMINS = "Admins load these";
export const DOCUMENTS_LEDE_ADMIN =
  "Everyone holding a place reads the run’s. Facilitators read the course’s in the facilitator guide. Each opens its paste.";
/** The programme's lead's whole card: the Handbook and Printables are every run of the course's, live ones included. */
export const DOCUMENTS_LEAD = "Course documents: an admin loads these.";
/** "This run’s · Loaded on Fri 30 Oct", "The course’s · Not loaded". */
export function documentLine(whose: "run" | "course", loaded: boolean, loadedOn: string | null): string {
  const owner = whose === "run" ? "This run’s" : "The course’s";
  return `${owner} · ${loaded ? (loadedOn ? `Loaded on ${loadedOn}` : "Loaded") : "Not loaded"}`;
}
export const DOCUMENT_LOAD = "Load";
export const DOCUMENT_REPLACE = "Replace";
