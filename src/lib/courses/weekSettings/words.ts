/**
 * THE WORDS OF A WEEK'S SETTINGS, ITS PUBLISHED CARD AND HOW IT LANDED, on a
 * week's page on a programme's Weeks tab, and of the route that saves the
 * settings. No server import, so the page and the route say the same thing.
 *
 * The drawn words are copied exactly, with their apostrophes, and "started"
 * stands wherever the drawing said "opened": the site records nobody opening
 * a page and does not start to (the owner's decision), so what it can say is
 * that somebody has ticked or written in a week. The words it does not draw
 * are as few as the page needs, in the same voice.
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
/** Under the tick once the week is stored as pitching week. */
export function pitchingWeekWords(weekNumber: number): string {
  return `Week ${weekNumber} is pitching week. Its pitches show on Groups, Pitches.`;
}
export const QUESTIONS_LABEL = "Questions to think about";
/**
 * Under the questions. The drawing said each group's facilitators can change
 * their own group's copy; they cannot (a group's own copy of a week is made
 * and changed only by the programme's lead and admins), so this says only
 * what a save does: a group with its own copy keeps the questions in it.
 */
export const QUESTIONS_HINT = "A group with its own copy of this week keeps the questions in its copy.";
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
export const SUMMARY_LONG = `A summary is ${COURSE_FIELD_LIMITS.weekSummary.toLocaleString("en-GB")} characters or fewer.`;
/** The group week route's words for its questions, word for word. */
export const QUESTIONS_NOT_A_LIST = "questions must be a list.";
export const QUESTIONS_TOO_MANY = `A week holds at most ${COURSE_FIELD_LIMITS.maxWeekQuestions} questions.`;
export const QUESTION_NOT_TEXT = "Each question must be text.";
export function questionEmptyWords(n: number): string {
  return `Question ${n} is empty. Write it, or remove it.`;
}
export const QUESTION_LONG = `Questions must be ${COURSE_FIELD_LIMITS.weekQuestion} characters or fewer.`;
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
export const LANDED_PARTIAL = "This run has more ticks than one look counts, so these numbers are short.";

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
