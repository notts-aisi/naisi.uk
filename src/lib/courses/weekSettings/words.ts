/**
 * THE WORDS OF A WEEK'S SETTINGS, ITS PUBLISHED CARD AND HOW IT LANDED, on a
 * week's page on a programme's Weeks tab, and of the route that saves the
 * settings. No server import, so the page and the route say the same thing.
 *
 * The page says "started" and never "opened": the site records nobody
 * opening a page and does not start to (the owner's decision), so what it can
 * say is that somebody has ticked or written in a week. Every sentence is as
 * short as the page needs, in the same voice.
 */

import { COURSE_FIELD_LIMITS } from "@/lib/firestore/courses";
import { joinWords } from "../weeksTab/words";

// ---------------------------------------------------------------------------
// This week's settings: the fields
// ---------------------------------------------------------------------------

export const TITLE_LABEL = "Title";
export const TITLE_HINT = "A paste sets it too.";
export const SUMMARY_LABEL = "Summary";
export const SUMMARY_HINT = "A line or two about the week.";
export const PITCHING_LABEL = "This is pitching week";
export const PITCHING_HINT = "Its pitches show on Groups, Pitches.";
/** Under the tick on the week the pitching pages treat as pitching week (`readPitchingWeek`). */
export function pitchingWeekWords(weekNumber: number): string {
  return `Week ${weekNumber} is pitching week. Its pitches show on Groups, Pitches.`;
}
/** Under the tick on any other week, while a week is pitching week. */
export function otherPitchingWeekWords(weekNumber: number): string {
  return `Week ${weekNumber} is pitching week.`;
}
export const QUESTIONS_LABEL = "Questions to think about";
/**
 * Under the questions. Each group's facilitators cannot change their group's
 * copy (a group's own copy of a week is made and changed only by the
 * programme's lead and admins), so this says only what a save does: a group
 * with its own copy reads that copy whole (`resolveWeekDoc`), so it keeps its
 * own title, summary and questions.
 */
export const QUESTIONS_HINT = "A group with its own copy of this week keeps its own title, summary and questions.";
export const REMOVE = "Remove";
export const ADD_QUESTION = "Add a question";
export const SAVE_SETTINGS = "Save the week’s settings";
export const SAVING = "Saving…";

/** "Question 2", the name of the second row's box. */
export function questionName(n: number): string {
  return `Question ${n}`;
}
/** "Remove question 2", the name of the second row's button. */
export function removeQuestionName(n: number): string {
  return `Remove question ${n}`;
}

// ---------------------------------------------------------------------------
// The route's refusals and answers
// ---------------------------------------------------------------------------

export const SETTINGS_NOT_YOURS = "Only the programme’s lead and admins can change a week’s settings.";
export const SETTINGS_BODY = "Send the week’s title, summary, pitching week and questions together.";
export const TITLE_EMPTY = "Give the week a title. It’s the line people find the week by.";
export const TITLE_LONG = `A title is ${COURSE_FIELD_LIMITS.weekTitle} characters or fewer.`;
export const SUMMARY_LONG = `A summary is ${new Intl.NumberFormat("en-GB").format(COURSE_FIELD_LIMITS.weekSummary)} characters or fewer.`;
/** The group week route's words for its questions, word for word. */
export const QUESTIONS_NOT_A_LIST = "questions must be a list.";
export const QUESTIONS_TOO_MANY = `A week holds at most ${COURSE_FIELD_LIMITS.maxWeekQuestions} questions.`;
export const QUESTION_NOT_TEXT = "Each question must be text.";
export function questionEmptyWords(n: number): string {
  return `Question ${n} is empty. Write it, or remove it.`;
}
export const QUESTION_LONG = `Questions must be ${COURSE_FIELD_LIMITS.weekQuestion} characters or fewer.`;
/** A save from a page older than the week's settings as stored, in the words of a block saved from an older page. */
export const SETTINGS_CHANGED =
  "This week’s settings have changed since you opened them: somebody saved the week meanwhile. Load the week again to see what they say now.";
/** A save that does not say which version of the settings it changes. */
export const SETTINGS_BASE = "Load the week again: the save doesn’t say which version of the settings it changes.";
/** Ticking a week while another is ticked: a run has one pitching week. */
export function pitchingElsewhereWords(weekNumber: number): string {
  return `Week ${weekNumber} is pitching week. Untick it there first.`;
}
/** Unticking or moving pitching week once anybody has pitched or a team is made: their pitches and picks are read by that week. */
export const PITCHING_IN_USE = "Pitches or teams are on this run already, so pitching week can’t be moved or unticked.";
/** A save that changes nothing: the week editor's words. */
export const NOTHING_CHANGED = "Nothing changed, so nothing was saved.";
export const SETTINGS_SAVED = "The week’s settings are saved.";

/** Which settings a save changed, for its line in the week's history. */
export type SettingsChange = "title" | "summary" | "pitching-on" | "pitching-off" | "questions";

/** "This week’s settings: new title and questions, ticked as pitching week". */
export function settingsHistoryLine(changes: readonly SettingsChange[]): string {
  const news = (["title", "summary", "questions"] as const).filter((field) => changes.includes(field));
  const parts: string[] = [];
  if (news.length > 0) parts.push(`new ${joinWords(news)}`);
  if (changes.includes("pitching-on")) parts.push("ticked as pitching week");
  if (changes.includes("pitching-off")) parts.push("no longer pitching week");
  return `This week’s settings: ${parts.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Published, and unpublishing
// ---------------------------------------------------------------------------

export const PUBLISHED = "Published";
/** "Nobody has started week 5 yet." */
export function nobodyStartedWords(weekNumber: number): string {
  return `Nobody has started week ${weekNumber} yet.`;
}
/** "Unpublish week 5…", which asks first. */
export function unpublishAskWords(weekNumber: number): string {
  return `Unpublish week ${weekNumber}…`;
}
/** The question's title. */
export function unpublishQuestionWords(weekNumber: number): string {
  return `Unpublish week ${weekNumber}?`;
}
export const UNPUBLISH_BODY =
  "Nobody has started it yet. It goes back to draft and leaves the programme page until you mark it ready again.";
/** In the question for week 1 while it is open early to everybody holding a place (`weekOne/door.ts`). */
export const UNPUBLISH_WEEK_ONE_OPEN =
  "People holding a place can open week 1 now. Unpublishing closes it to them, with Start here and the Glossary, until it’s marked ready again.";
export const NOBODY_IS_EMAILED = "Nobody is emailed.";
export const KEEP_PUBLISHED = "Keep it published";
/** The question's press. */
export function unpublishWords(weekNumber: number): string {
  return `Unpublish week ${weekNumber}`;
}
/** The line after. */
export function unpublishedWords(weekNumber: number): string {
  return `Week ${weekNumber} is back to draft. Nobody was emailed.`;
}

// ---------------------------------------------------------------------------
// How it landed
// ---------------------------------------------------------------------------

export const LANDED_TITLE = "How it landed";
export const STAFF_ONLY = "Staff only";
export const LANDED_LEDE =
  "From people’s ratings and ticks this week. Ratings stay hidden until enough people have rated a reading.";
/** When the run has more ticks and ratings than one read counts. */
export const LANDED_PARTIAL = "This run has too many ticks and ratings to count at once, so these numbers are lower than the real ones.";

/**
 * A reading's line: "Rated 4.3 out of 5 by 11 · finished by 14 of 23" once
 * the average may show, "Rated by 2 so far · finished by 9 of 23" below the
 * floor, and "Finished by 4 of 23" with no rating. Never a name, and never an
 * average the route withheld.
 */
export function landedLine(row: { avgRating: number | null; ratingCount: number; completedCount: number; enrolledCount: number }): string {
  const finished = `finished by ${row.completedCount} of ${row.enrolledCount}`;
  if (row.ratingCount === 0) return `Finished by ${row.completedCount} of ${row.enrolledCount}`;
  if (row.avgRating === null) return `Rated by ${row.ratingCount} so far · ${finished}`;
  return `Rated ${row.avgRating.toFixed(1)} out of 5 by ${row.ratingCount} · ${finished}`;
}

export const ADD_NOTE = "Add a note";
/** "1 note", "2 notes": the button on a reading the team has written about. */
export function notesCountWords(n: number): string {
  return n === 1 ? "1 note" : `${n} notes`;
}
/** "Note for the team on Core reading 1". */
export function noteLabelWords(title: string): string {
  return `Note for the team on ${title.trim() || "this reading"}`;
}
export const CANCEL = "Cancel";
export const SAVE_NOTE = "Save the note";
/** Under the note box: a note is one per reading per author, and saving again replaces it. */
export const NOTE_REPLACES = "Saving replaces any note you wrote on it before.";
/** While the run's look back is read. */
export const LANDED_LOADING = "Loading…";

/**
 * This week's rows of the run's look back, in the week's own order: only the
 * readings whose ids the page handed in (`sourceIds`), each once.
 */
export function landedRowsFor<T extends { itemId: string }>(materials: readonly T[], sourceIds: readonly string[]): T[] {
  const byId = new Map(materials.map((row) => [row.itemId, row] as const));
  return [...new Set(sourceIds)].map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
}
