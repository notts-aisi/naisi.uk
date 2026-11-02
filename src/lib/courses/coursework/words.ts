import { dayAndClockWords } from "@/lib/courses/writtenAnswerWords";
import type { CellAnswerState } from "./model";

/**
 * THE WORDS OF A PROGRAMME'S COURSEWORK (Zach, Fri 30 Oct): the Coursework
 * tab and one person's page, for the programme's lead and admins. No board
 * draws them: listed in the build notes for the boards' designers to
 * confirm. Every name, number and date in them comes from a record, and no
 * cell ever holds a word anybody wrote.
 */

export const COURSEWORK = "Coursework";

/** The section of people who hold a place and are in no group this viewer may see. */
export const NOT_IN_A_GROUP_YET = "Not in a group yet";

/** Beside a facilitator's row: their own coursework. */
export const FACILITATING = "Facilitator";

/** To an admin, beside somebody placed in a group Publish has not told them about. */
export const NOT_TOLD_YET = "Not told yet";

export const NAME = "Name";

/** A column's head: "Week 3". */
export function weekColumnWords(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/**
 * The first line of a cell, by the one meaning of done every page uses: the
 * week is submitted, where it asks for anything written, and every tick it
 * counts is ticked. Staff words: the person's own pages say "Submitted" and
 * "N of M done".
 */
export const DONE = "Done";
export const NOT_DONE = "Not done";

/** "Reflections 2 of 3": parts whose reflection is written, of the week's parts. */
export function reflectionsCellWords(written: number, of: number): string {
  return `Reflections ${written} of ${of}`;
}

/** "Sources 1 of 2": sources ticked, of the week's sources. */
export function ticksCellWords(ticked: number, of: number): string {
  return `Sources ${ticked} of ${of}`;
}

/** "Boxes 3 of 7": fill-in boxes with something in them, of the week's boxes. */
export function boxesCellWords(filled: number, of: number): string {
  return `Boxes ${filled} of ${of}`;
}

/** Where a written answer stands, in a cell and on a person's page. */
export const ANSWER_STATE_WORDS: Record<CellAnswerState, string> = {
  "not-started": "Answer not started",
  started: "Answer started",
  waiting: "No feedback yet",
  feedback: "Feedback given",
};

/** The written answer part of a cell, for a screen reader: "Week 3 written answer, No feedback yet: Chloe Nguyen". */
export function answerLinkLabelWords(name: string, weekNumber: number, state: CellAnswerState): string {
  return `Week ${weekNumber} written answer, ${ANSWER_STATE_WORDS[state]}: ${name}`;
}

/** The rest of a cell, for a screen reader: "Week 3, not done: Chloe Nguyen’s coursework". */
export function cellLinkLabelWords(name: string, weekNumber: number, done: boolean): string {
  return `Week ${weekNumber}, ${done ? "done" : "not done"}: ${name}’s coursework`;
}

/** A week the person reads that is not written as blocks: nothing to count. */
export const NO_COURSEWORK = "No coursework";

// The filters ----------------------------------------------------------------

export const SHOW = "Show";
export const EVERYBODY = "Everybody";
export const WAITING_FOR_FEEDBACK = "No feedback yet";

/** "28 holding a place · 4 facilitating · 3 with no feedback yet". */
export function courseworkSummaryWords(holding: number, facilitating: number, waiting: number): string {
  const parts = [`${holding} holding a place`];
  if (facilitating > 0) parts.push(`${facilitating} facilitating`);
  parts.push(`${waiting} with no feedback yet`);
  return parts.join(" · ");
}

/** Who opens the tab, under its summary: "you" to the lead, the lead by first name to an admin. */
export function courseworkWhoLine(lead: { firstName: string; isReader: boolean } | null): string {
  if (lead?.isReader) return "Only you and admins can open Coursework. Open a name to read everything that person wrote.";
  const name = lead?.firstName.trim();
  return name
    ? `Only ${name} and admins can open Coursework. Open a name to read everything that person wrote.`
    : "Only admins can open Coursework. Open a name to read everything that person wrote.";
}

/** A filter that leaves nobody. */
export const NOBODY_HERE = "Nobody here matches that.";

/** Before anybody holds a place. */
export function nobodyHoldsWords(programmeName: string): string {
  return `Nobody holds a place on ${programmeName} yet, so there’s no coursework to show.`;
}

/** A run with no week written as blocks. */
export const NO_BLOCK_WEEKS = "None of the run’s weeks is written as blocks yet, so there’s no coursework to show.";

// One person's page ------------------------------------------------------------

/** The way back from a person's page. */
export const BACK_TO_COURSEWORK = "Coursework";

export const REFLECTIONS = "Reflections";
export const WRITTEN_ANSWER = "Written answer";
export const BOXES = "Boxes";
export const SOURCES = "Sources";

/** "Sent Mon 16 Nov, 10:42pm": when a written answer was first sent. */
export function sentWhenWords(at: Date): string {
  return `Sent ${dayAndClockWords(at)}`;
}

/** "Ticked 2 of 3". */
export function tickedOfWords(ticked: number, of: number): string {
  return `Ticked ${ticked} of ${of}`;
}

export const TICKED = "Ticked";
export const NOT_TICKED = "Not ticked";
export const NOT_WRITTEN_YET = "Not written yet.";
export const NOT_FILLED_IN_YET = "Not filled in yet.";
export const NO_FEEDBACK_YET = "No feedback yet.";

/** "Part 2: Two keepers’ views", or "Part 2" for a part with no title. */
export function partHeadingWords(number: number, title: string): string {
  return title.trim() ? `Part ${number}: ${title.trim()}` : `Part ${number}`;
}

/** "Week 3 · The lamp makers", or "Week 3". */
export function weekHeadingWords(weekNumber: number, title: string): string {
  return title.trim() ? `Week ${weekNumber} · ${title.trim()}` : `Week ${weekNumber}`;
}

/** "241 words". */
export function wordsWords(n: number): string {
  return n === 1 ? "1 word" : `${n} words`;
}

export const WRITE_FEEDBACK_ON_THE_ANSWER = "Write feedback on the answer";

/** The private note under a source: admins only. */
export const PRIVATE_NOTE = "Private note";

/** Over the private notes, to an admin: who else reads them. */
export const PRIVATE_NOTES_WHO = "Private notes are shown here to admins only. The programme’s lead never sees them.";

/** A week the person reads that is not written as blocks. */
export const WEEK_NOT_IN_BLOCKS = "This week isn’t written as blocks, so its coursework isn’t shown here.";

/** The calm not-here answer's title. */
export const PERSON_NOT_HERE_TITLE = "There’s no coursework to show here";

/** The calm not-here answer: the person holds no place on the programme and facilitates none of its groups. */
export function personNotHereWords(programmeName: string): string {
  return `This person doesn’t hold a place on ${programmeName} or facilitate one of its groups.`;
}
