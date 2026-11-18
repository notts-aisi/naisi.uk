import { londonDayLabel } from "@/lib/courses/londonLabels";
import { dayWords } from "@/lib/courses/sessionChange/words";
import { DONE_LATE, DONE_ON_TIME, JOINED_LATE, LATE } from "@/lib/courses/weekWork/words";
import { dayAndClockWords } from "@/lib/courses/writtenAnswerWords";
import type { CellAnswerState, CellState, CourseworkShow } from "./model";

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
 * A cell's word for a week done, by the one meaning of done every page uses
 * (`weekDone`): every tick it counts ticked, and everything written it counts
 * written and sent (or the old Submit pressed). Once the session they were
 * due at has passed, "Done on time" or "Done late" (`DONE_ON_TIME`,
 * `DONE_LATE` in `src/lib/courses/weekWork/words.ts`); "Joined late" for a
 * week before they were told their group (`cellStateWords` below). Staff
 * words: the person's own pages say "Sent" and "N of M done".
 */
export const DONE = "Done";

/** Where a written answer stands, on a person's week and on the page of one question. */
export const ANSWER_STATE_WORDS: Record<CellAnswerState, string> = {
  "not-started": "Answer not started",
  started: "Answer started",
  waiting: "No feedback yet",
  feedback: "Feedback given",
};

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

// One person's week: the reading view --------------------------------------------

/**
 * The words of the reading view of one person's week that the code had no
 * words for already. Where it had (the week's state, Late, feedback, the
 * ratings for the team, the question as it was worded, the sealed predictions,
 * Remind), the view uses those, from their own files.
 */

/** Over the view: "AGI Strategy · Group C · week 1 of 6", "AGI Strategy · Not in a group yet · week 1". */
export function readingEyebrowWords(programme: string, group: string | null, weekNumber: number, weeksTotal: number): string {
  const week = weeksTotal > 0 ? `week ${weekNumber} of ${weeksTotal}` : `week ${weekNumber}`;
  return [programme.trim(), group ?? NOT_IN_A_GROUP_YET, week].filter(Boolean).join(" · ");
}

/** "Previous person: Grace Chen". */
export function previousPersonWords(name: string): string {
  return `Previous person: ${name}`;
}

/** "Next person: Kwame Asante". */
export function nextPersonWords(name: string): string {
  return `Next person: ${name}`;
}

/** "Previous week: week 1". */
export function previousWeekWords(weekNumber: number): string {
  return `Previous week: week ${weekNumber}`;
}

/** "Next week: week 2". */
export function nextWeekWords(weekNumber: number): string {
  return `Next week: week ${weekNumber}`;
}

/** "Back to Group C". */
export function backToWords(label: string): string {
  return `Back to ${label}`;
}

/** The way between people and weeks at the top, and between people at the foot, for a screen reader. */
export const PEOPLE_AND_WEEKS = "People and weeks";
export const PREVIOUS_AND_NEXT_PERSON = "Previous and next person";

export const READINGS = "Readings";

/** "3 of 3": readings ticked, of the week's readings. */
export function ofWords(done: number, of: number): string {
  return `${done} of ${of}`;
}

/** "Ticked Mon 2 Nov, 9:10pm", under a reading, on a staff page. */
export function tickedWhenWords(at: Date): string {
  return `${TICKED} ${dayAndClockWords(at)}`;
}

/**
 * When the group met for the week, against the session the person was due at:
 * "Group C met Wed 4 Nov, 3pm", "Group C meets Wed 11 Nov, 3pm", "Group C’s
 * week 2 session, Wed 11 Nov, 3pm, was cancelled", "Group C’s time isn’t set
 * yet". Null when there is nothing to say: no group, or told their group after
 * that week's session (the week's state says "Joined late").
 */
export function groupMetWords(group: string | null, weekNumber: number, due: { at: Date | null; by: string }, now: Date): string | null {
  if (!group) return null;
  if (due.by === "undated") return `${group}’s time isn’t set yet`;
  if (!due.at || (due.by !== "session" && due.by !== "cancelled")) return null;
  const when = dayAndClockWords(due.at);
  if (due.by === "cancelled") return `${group}’s week ${weekNumber} session, ${when}, was cancelled`;
  return `${group} ${now.getTime() >= due.at.getTime() ? "met" : "meets"} ${when}`;
}

/** Over the empty state. */
export const NOTHING_TO_READ_YET = "Nothing to read yet";

/** "Grace hasn’t started week 2. Readings 0 of 3, nothing written." */
export function notStartedWords(firstName: string, weekNumber: number, readings: { ticked: number; of: number }): string {
  const ticks = readings.of > 0 ? ` ${READINGS} ${ofWords(readings.ticked, readings.of)}, nothing written.` : " Nothing written.";
  return `${firstName || "They"} ${firstName ? "hasn’t" : "haven’t"} started week ${weekNumber}.${ticks}`;
}

/** Over the earlier version of a written answer and its words now, when it has changed since feedback. */
export const NOW = "Now";

/** The line under the two versions: words, not colour, carry the change. */
export const CHANGE_LEGEND = "Struck through: taken out. Underlined: added.";

/** Before words taken out and words added, for a screen reader. */
export const TAKEN_OUT = "Taken out:";
export const ADDED = "Added:";

/** What changed, in words: "6 words taken out and 14 added." */
export function changeCountWords(counts: { out: number; in: number }): string {
  const words = (n: number) => (n === 1 ? "1 word" : `${n} words`);
  if (counts.out > 0 && counts.in > 0) return `${words(counts.out)} taken out and ${counts.in} added.`;
  if (counts.out > 0) return `${words(counts.out)} taken out.`;
  if (counts.in > 0) return `${words(counts.in)} added.`;
  return "Only the spacing changed.";
}

/** "As Rahul read it": the earlier version, by whoever wrote the feedback about it. */
export function asReadWords(name: string): string {
  return name ? `As ${name} read it` : "As it was read";
}

/** Over the private notes on the week's material. */
export const PRIVATE_NOTES_ON_THE_MATERIAL = "Private notes on the material";

/** A week the person reads that has no reading to tick. */
export const NO_READINGS = "No readings to tick this week.";

/** A week with no reflection, no box and no written answer. */
export const NOTHING_TO_WRITE_THIS_WEEK = "This week asks for nothing written.";

// One question, the whole group ---------------------------------------------------

/**
 * The words of the page of one question across a group, and of the switch
 * between it and one person's week, that the code had no words for already.
 * Where it had (the question, Late, "No feedback yet", "Not sent yet", the
 * feedback cards and writer, the rating for the team), the page uses those,
 * from their own files.
 */

/** The two ways to read a week, drawn on both views. */
export const ONE_PERSON_ONE_WEEK = "One person, one week";
export const ONE_QUESTION_WHOLE_GROUP = "One question, whole group";
/** The switch between them, for a screen reader. */
export const WAYS_TO_READ = "Ways to read";

/** The page's title. */
export const ONE_QUESTION_TITLE = "One question, the whole group";

/** An answer nobody on the team has opened yet, and the filter of them. */
export const NOT_READ_YET = "Not read yet";

/** The person's answer was changed after feedback on it was written. */
export const CHANGED_SINCE_FEEDBACK = "Changed since feedback";

/** Under an answer changed since feedback: the way to both versions, on the person's week. */
export const SEE_WHAT_CHANGED = "See what changed";

/** Somebody who has written nothing to the question. */
export const NOTHING_WRITTEN_YET = "Nothing written yet";

/** The filters over the people, for a screen reader. */
export const SHOW_WHOSE_ANSWERS = "Show whose answers";

/** Stepping through the week's questions. */
export const PREVIOUS_QUESTION = "Previous question";
export const NEXT_QUESTION = "Next question";
export const PREVIOUS_AND_NEXT_QUESTION = "Previous and next question";

/** Opens the writer of feedback on one person's answer. */
export const ADD_FEEDBACK = "Add feedback";

/** Opens the rating for the team of one person's answer, for an admin or the programme's lead, before they have rated it. */
export const RATE = "Rate";

/** "Open Aisha’s week": the reading view of the person's week, at this question. */
export function openWeekWords(firstName: string): string {
  return firstName ? `Open ${firstName}’s week` : "Open their week";
}

/**
 * Staff only, on the page of one question, in place of the answer of
 * somebody moved here mid-term who did the week with another group, on
 * another week document than the page's. To an admin and the programme's
 * lead, with the group: "Chloe did week 3 with Group B, on Group B’s version
 * of the week.", or, where that group read the run's own week, "Chloe did
 * week 3 with Group B.". To anybody else (`groupName` null), never naming
 * it: "Chloe did week 3 with another group, on that group’s version of the
 * week." and "Chloe did week 3 with another group."
 */
export function didWeekWithWords(firstName: string, weekNumber: number, groupName: string | null, ownCopy: boolean): string {
  const who = firstName || "They";
  const group = groupName ?? "another group";
  const version = groupName ? `${groupName}’s version` : "that group’s version";
  return ownCopy ? `${who} did week ${weekNumber} with ${group}, on ${version} of the week.` : `${who} did week ${weekNumber} with ${group}.`;
}

/** A group with nobody this reader may read. */
export const NOBODY_TO_READ = "There’s nobody in this group whose work is yours to read.";

/** "Question 2 of 5": where the question sits in the week. */
export function questionOfWords(at: number, of: number): string {
  return `Question ${at} of ${of}`;
}

// The Coursework tab, redrawn --------------------------------------------------------

/**
 * The words of the Coursework tab as a table with words in every cell, its
 * filters and its list of what waits for feedback (Fri 13 Nov 2026). Where the
 * code had words already (Done, Done on time, Done late, Joined late, Late,
 * Not read yet, No feedback yet, Changed since feedback, how late), the tab
 * uses those, from their own files.
 */

/** A week begun with something done in it, and a week begun with nothing done. */
export const STARTED = "Started";
export const NOT_STARTED = "Not started";

/** A week not begun for them, with no day to say it opens on. */
export const NOT_OPEN_YET = "Not open yet";

/** "Opens Thu 12 Nov": a week not begun for them, by the day it opens. */
export function opensWords(dateKey: string | null): string {
  const day = dateKey ? dayWords(dateKey) : "";
  return day ? `Opens ${day}` : NOT_OPEN_YET;
}

/** What a cell says first, in words, by its state (`cellStateOf`). */
export function cellStateWords(state: CellState, opensOn: string | null): string {
  switch (state) {
    case "no-coursework":
      return NO_COURSEWORK;
    case "done":
      return DONE;
    case "done-on-time":
      return DONE_ON_TIME;
    case "done-late":
      return DONE_LATE;
    case "joined-late":
      return JOINED_LATE;
    case "opens":
      return opensWords(opensOn);
    case "started":
      return STARTED;
    case "not-started":
      return NOT_STARTED;
  }
}

/** A cell, for a screen reader: "Chloe Nguyen, week 3: Started, Not read yet, No feedback yet". */
export function cellLabelWords(name: string, weekNumber: number, said: readonly string[]): string {
  return `${name}, week ${weekNumber}: ${said.join(", ")}`;
}

/** The filters over the people, one at a time, and the group's. */
export const EVERYONE = "Everyone";
export const WEEK_NOT_DONE = "Week not done";
export const SHOW_WORDS: Record<CourseworkShow, string> = {
  everyone: EVERYONE,
  notDone: WEEK_NOT_DONE,
  late: LATE,
  unread: NOT_READ_YET,
  noFeedback: WAITING_FOR_FEEDBACK,
  changed: CHANGED_SINCE_FEEDBACK,
};
export const GROUP = "Group";
export const ALL_GROUPS = "All groups";

/** The way to the page of one question across a group. */
export const READ_ONE_QUESTION = "Read one question";

/** The key to the words of the cells, for a screen reader. */
export const KEY = "Key";

/** Stepping between weeks, one at a time, at phone width, for a screen reader. */
export const WEEKS = "Weeks";

/** The list under the table. */
export const WAITING_TITLE = "Waiting for feedback, oldest first";
export const WAITING_LINE = "Opens the reading view at that answer.";
export const NOTHING_WAITING = "Nothing is waiting for feedback.";
export const READ = "Read";

/** "week 3 written answer", after the person's name. */
export function writtenAnswerOfWeekWords(weekNumber: number): string {
  return `week ${weekNumber} written answer`;
}

/** "Sent Thu 5 Nov", with "· late" when it was sent after the session it was due at. */
export function waitingSentWords(at: Date, late: boolean): string {
  return late ? `Sent ${londonDayLabel(at)} · late` : `Sent ${londonDayLabel(at)}`;
}

/** "Not sent, read since the session, Thu 5 Nov": never sent, read since the session it was due at started. */
export function waitingNotSentWords(at: Date): string {
  return `Not sent, read since the session, ${londonDayLabel(at)}`;
}

/** "Changed since feedback, Sat 7 Nov". */
export function waitingChangedWords(at: Date): string {
  return `${CHANGED_SINCE_FEEDBACK}, ${londonDayLabel(at)}`;
}

/** "Read Chloe Nguyen’s week 3 written answer", for a screen reader. */
export function readAnswerLabelWords(name: string, weekNumber: number): string {
  return `${READ} ${name}’s ${writtenAnswerOfWeekWords(weekNumber)}`;
}

/** "Show all 14". */
export function showAllWords(total: number): string {
  return `Show all ${total}`;
}

/** On Feedback to write: "Changed since feedback, Wed 18 Nov, 3pm". */
export function changedOnWords(at: Date): string {
  return `${CHANGED_SINCE_FEEDBACK}, ${dayAndClockWords(at)}`;
}
