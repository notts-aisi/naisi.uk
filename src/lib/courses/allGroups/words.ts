/**
 * THE WORDS OF ALL GROUPS, a view of a programme's Groups tab: one row per
 * live group, each name opening the group's page, and the archived groups at
 * its foot.
 *
 * The design's words are kept exactly ("All groups", "Groups", "Each
 * group’s name opens its page, where everything about it is changed.", the
 * columns, "Met Mon 9 Nov", "Today, 1pm", "Archived groups (1)", "Hide", the
 * line under it, "Was Fridays, 11am to 1pm · Archived Mon 2 Nov by Maya Rao ·
 * Nobody in it"). Words it does not draw (opening the archived groups, a
 * group archived before the day was recorded, an archived group somebody is
 * still in, a week the group has a change in) are as few as possible, in the
 * same voice, and reuse the site's own words wherever it has them.
 *
 * No gendered pronoun, and no dash of either kind. Pure, so the page, the
 * browser and the tests read the same sentences.
 */

import { WEEK_STATE_WORDS, type WeekState } from "@/lib/courses/groupPage/words";
import { clockWords, dayWords } from "@/lib/courses/sessionChange/words";

/** The view's name, in the row of the Groups tab's views. */
export const ALL_GROUPS = "All groups";

/** The card's heading. */
export const GROUPS_HEADING = "Groups";

/** Under the heading. */
export const NAMES_OPEN_PAGES = "Each group’s name opens its page, where everything about it is changed.";

/** The columns, in the design's order. The week's column is named for the week ("Week 2"). */
export const COLUMN = {
  group: "Group",
  meets: "Meets",
  room: "Room",
  facilitators: "Facilitators",
  people: "People",
} as const;

/**
 * One group's session in the week the column names, as its cell says it:
 * "Met Mon 9 Nov", "Today, 1pm", "Tomorrow, 3pm", "Thu 12 Nov"; any other
 * state as the group page's week pill says it ("Thu 12 Nov · cancelled").
 * A session that started with no register, for which none is owed (it
 * passed while the group was archived: `registerOwed`), is "not held", as
 * the Overview says it, never "no register".
 */
export function weekCellWords(state: WeekState, dateKey: string, hhmm: string, owed = true): string {
  const day = dayWords(dateKey);
  const clock = clockWords(hhmm);
  if (state === "no-register" && !owed) return `${day} · not held`;
  switch (state) {
    case "met":
      return `Met ${day}`;
    case "today":
      return ["Today", clock].filter(Boolean).join(", ");
    case "tomorrow":
      return ["Tomorrow", clock].filter(Boolean).join(", ");
    case "upcoming":
      return day;
    default:
      return [day, WEEK_STATE_WORDS[state]].filter(Boolean).join(" · ");
  }
}

// ---------------------------------------------------------------------------
// Archived groups, at the foot
// ---------------------------------------------------------------------------

/** "Archived groups (1)". */
export function archivedGroupsHeading(count: number): string {
  return `Archived groups (${count})`;
}

/** Under the heading. */
export const ARCHIVED_GROUPS_LINE =
  "Archived groups stay on the run for the record but drop out of allocation, lists and reminders.";

/** The button that closes the archived groups. */
export const HIDE = "Hide";

/** The button that opens them: they are closed until it is pressed. */
export const SHOW = "Show";

/**
 * "Was Fridays, 11am to 1pm · Archived Mon 2 Nov by Maya Rao · Nobody in it".
 * A group that never had a time leaves out when it met. A group archived
 * before the day was recorded says only that it is archived; one whose
 * archiver can no longer be named says the day alone. Somebody still in an
 * archived group (archived before archiving checked) is counted.
 */
export function archivedRowWords(input: { was: string; dayLabel: string; byName: string; inGroup: number }): string {
  const archived = input.dayLabel ? (input.byName ? `Archived ${input.dayLabel} by ${input.byName}` : `Archived ${input.dayLabel}`) : "Archived";
  const people = input.inGroup === 0 ? "Nobody in it" : input.inGroup === 1 ? "1 person in it" : `${input.inGroup} people in it`;
  return [input.was ? `Was ${input.was}` : "", archived, people].filter(Boolean).join(" · ");
}
