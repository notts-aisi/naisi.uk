import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { namesAnd, namesOr, numberWords } from "../writtenAnswerWords";
import type { LockBy, NotDone, PersonWeekProgress, WeekWorkState } from "./model";

/**
 * EVERY WORD THE WEEK YOU SUBMIT SAYS: the week page's line about until when
 * the work can change, its status box, Submit and the check before it, the
 * locked week, and the one line a staff page says of a person's week. One
 * file, so the pages and the routes say one thing.
 *
 * Never "mark", "grade" or "score", and no pronoun for a person: their name.
 * Times in the house clock ("3pm", "9:31pm"), days as "Wed 18 Nov".
 */

const capitalise = (words: string) => (words ? words[0].toUpperCase() + words.slice(1) : words);

/** "Wed 18 Nov, 3pm". */
export function dayClockWords(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// The week page: until when the work can change
// ---------------------------------------------------------------------------

export const SAVED_AS_YOU_GO = "Saved as you go";
export const SUBMITTED = "Submitted";
export const LOCKED = "Locked";
export const NOT_SUBMITTED = "Not submitted";
export const REOPENED = "Reopened";

/**
 * The line under the week's title that says until when the work can change
 * (privacy v15: "The week's page says until when you can change your
 * work"). `room` is the session's room that week, "" for none.
 */
export function lockLineWords(state: WeekWorkState, input: { room: string; reopenedBy: string }): string {
  switch (state.kind) {
    case "submitted":
      return `${SUBMITTED} ${dayClockWords(state.at)}. Your work for this week is locked.`;
    case "locked":
      return `Locked when your session started on ${dayClockWords(state.at)}.`;
    case "reopened":
      return state.locksAt
        ? `${input.reopenedBy} reopened this week for you. It locks again when you submit it, or at your next session, ${dayClockWords(state.locksAt)}.`
        : `${input.reopenedBy} reopened this week for you. It locks again when you submit it.`;
    case "open":
      return openLineWords(state.by, state.locksAt, input.room);
  }
}

function openLineWords(by: LockBy, locksAt: Date | null, room: string): string {
  if (by === "session" && locksAt) {
    return `Your session: ${dayClockWords(locksAt)}${room ? `, ${room}` : ""}. This week locks when it starts.`;
  }
  if (by === "next-session" && locksAt) {
    return `Your session this week is cancelled. This week locks when your next session starts, ${dayClockWords(locksAt)}.`;
  }
  if (by === "undated") return "This week locks when your group’s session starts. Your group’s time isn’t set yet.";
  if (by === "joined-late") return "You joined your group after this week’s session, so this week locks only when you submit it.";
  return "This week locks when you submit it.";
}

// ---------------------------------------------------------------------------
// The status box
// ---------------------------------------------------------------------------

/** "1 of 3 done". */
export function doneOfWords(done: number, of: number): string {
  return `${done} of ${of} done`;
}

/** Who reads the written answer, as the locked box names them: "Rahul and Sofia", "Claudia and admins". */
export type Readers = { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null };

function readersAnd(readers: Readers): string {
  if (readers.kind === "facilitators") return readers.names.length > 0 ? namesAnd(readers.names) : "your facilitators";
  return readers.leadName ? `${readers.leadName} and admins` : "admins";
}

/** Whom to ask for a reopen: the group's facilitators, or the lead for a facilitator's own week. */
function askWho(readers: Readers): string {
  if (readers.kind === "facilitators") return readers.names.length > 0 ? namesOr(readers.names) : "your facilitators";
  return readers.leadName ?? "the programme’s lead";
}

/** A locked week's line: "You didn’t submit this week, but everything you wrote was saved and Rahul can read it." */
export function lockedBoxWords(readers: Readers, wroteAnything: boolean): string {
  if (!wroteAnything) return "You didn’t submit this week.";
  return `You didn’t submit this week, but everything you wrote was saved and ${readersAnd(readers)} can read it.`;
}

/** "Ask Rahul if you need it reopened." (a plain line: nothing on the site asks for a reopen yet). */
export function askToReopenWords(readers: Readers): string {
  return `Ask ${askWho(readers)} if you need it reopened.`;
}

// ---------------------------------------------------------------------------
// Submit, and the check before it
// ---------------------------------------------------------------------------

/** "Submit week 3". */
export function submitWeekWords(weekNumber: number): string {
  return `Submit week ${weekNumber}`;
}

export const SUBMIT_LOCKS_LINE = "Submitting locks your work for this week.";
export const GO_BACK_AND_FINISH = "Go back and finish";
export const SUBMIT_ANYWAY = "Submit anyway";
export const GO_BACK = "Go back";
export const EVERYTHING_DONE = "Everything this week asks for is done.";
export const SUBMITTING = "Submitting…";
export const SUBMIT_FAILED = "That didn’t submit. Check your connection and try again.";

/** "Before you submit week 3". */
export function checkTitleWords(weekNumber: number): string {
  return `Before you submit week ${weekNumber}`;
}

/** "Two things aren’t done yet:", "One thing isn’t done yet:". */
export function notDoneLeadWords(count: number): string {
  return count === 1 ? "One thing isn’t done yet:" : `${capitalise(numberWords(count))} things aren’t done yet:`;
}

/** “A”, “B” and “C”. */
function quotedAnd(titles: readonly string[]): string {
  return namesAnd(titles.map((title) => `“${title}”`));
}

/** "your action plan" from "My action plan". */
export function yourWords(title: string): string {
  const plain = title.trim();
  if (!plain) return "your boxes";
  return /^my\s/i.test(plain) ? `your ${plain.replace(/^my\s+/i, "")}` : `your ${plain[0].toLowerCase()}${plain.slice(1)}`;
}

/** One line of the check, for one thing not done. */
export function notDoneWords(item: NotDone): string {
  switch (item.kind) {
    case "readings":
      return item.titles.length === 1
        ? `One reading isn’t ticked: ${quotedAnd(item.titles)}.`
        : `${capitalise(numberWords(item.titles.length))} readings aren’t ticked: ${quotedAnd(item.titles)}.`;
    case "steps":
      return item.count === 1 ? "One step isn’t ticked." : `${capitalise(numberWords(item.count))} steps aren’t ticked.`;
    case "pack":
      if (item.picked) return `Your ${item.title}’s reading isn’t ticked.`;
      return item.byYou ? `You haven’t chosen your ${item.title} yet.` : `You haven’t been given your ${item.title} yet.`;
    case "reflection": {
      const which = item.partNumber !== null ? `Your part ${item.partNumber} reflection` : "A reflection";
      return item.empty ? `${which} is empty.` : `${which} isn’t finished.`;
    }
    case "boxes":
      return item.empty === 1
        ? `One box of ${yourWords(item.title)} is empty.`
        : `${capitalise(numberWords(item.empty))} boxes of ${yourWords(item.title)} are empty.`;
    case "answer":
      if (item.boxes === 0 || item.emptyBoxes === item.boxes) return "Your written answer is empty.";
      return item.emptyBoxes === 1
        ? "One box of your written answer is empty."
        : `${capitalise(numberWords(item.emptyBoxes))} boxes of your written answer are empty.`;
    case "talk":
      return "You haven’t said you’re ready for your talk yet.";
    case "overLimit":
      return `Your written answer is ${item.words} words. The limit is ${item.limit}.`;
  }
}

/**
 * The check's line about what Submit does. With a written answer, who may
 * then read it: the group's facilitator and the programme team, or, for a
 * facilitator's own week, the programme team.
 */
export function checkLockLineWords(input: { hasAnswer: boolean; ownIsTheLeads: boolean }): string {
  if (!input.hasAnswer) return SUBMIT_LOCKS_LINE;
  return input.ownIsTheLeads
    ? "Submitting locks your work for this week, and the programme team can then read your written answer."
    : "Submitting locks your work for this week, and your facilitator and the programme team can then read your written answer.";
}

/** Said when an answer over its limit stops Submit. */
export const CUT_TO_SUBMIT = "Cut your written answer to its limit to submit this week.";

// ---------------------------------------------------------------------------
// The written answer's card
// ---------------------------------------------------------------------------

/**
 * Who reads the written answer, and from when (the week page's line, Q30 C):
 * "Once you submit, or your week locks, Rahul, Claudia and admins can read
 * your written answer." A facilitator's own: the lead and admins.
 */
export function answerReadersWords(readers: Readers, leadName: string | null): string {
  const names =
    readers.kind === "facilitators"
      ? [...readers.names, ...(leadName ? [leadName] : []), "admins"]
      : [...(readers.leadName ? [readers.leadName] : []), "admins"];
  return `Once you submit, or your week locks, ${namesAnd(names)} can read your written answer.`;
}

/**
 * Who else may read it: "Other fellows can’t." A facilitator's own: "Nobody
 * else on the programme can read it, your co-facilitators included."
 */
export function othersReadWords(readers: Readers): string {
  return readers.kind === "lead" ? "Nobody else on the programme can read it, your co-facilitators included." : "Other fellows can’t.";
}

/** "146 words, saved Tue 17 Nov." (the locked week's written answer, not submitted). */
export function savedOnWords(words: number, at: Date | null): string {
  const count = `${words} ${words === 1 ? "word" : "words"}`;
  return at ? `${count}, saved ${londonDayLabel(at)}.` : `${count}.`;
}

/** "Submitted Tue 10 Nov, 9:31pm." */
export function submittedLineWords(at: Date): string {
  return `${SUBMITTED} ${dayClockWords(at)}.`;
}

/** "Ticked Sun 15 Nov", under a reading the person ticked. */
export function tickedOnWords(at: Date): string {
  return `Ticked ${londonDayLabel(at)}`;
}

/** A write the week refuses: submitted or locked. */
export const WEEK_SHUT =
  "This week is locked, so it can’t change now. Ask somebody running your group if you need it reopened.";
export const WEEK_SHUT_RELOAD = "This week is locked now. Reload the page to see it as it was saved.";

// ---------------------------------------------------------------------------
// Staff pages: one line a person
// ---------------------------------------------------------------------------

/** "Locks Wed 3pm", "Locked Wed 3pm": the head of a group's This week's work. */
export function groupLockWords(at: Date, now: Date): string {
  const day = londonDayLabel(at).split(" ")[0];
  return `${now.getTime() >= at.getTime() ? "Locked" : "Locks"} ${day} ${londonClockLabel(at)}`;
}

export const STARTED = "Started";
export const NOT_STARTED = "Not started";
export const BEFORE_THEY_JOINED = "Before they joined";
export const REOPENED_NOT_SUBMITTED = "Reopened, not submitted again";

/**
 * Where one person's week stands, as a staff page says it, leading with
 * Submitted (clash 21): "Submitted Tue 10 Nov, 9:31pm", "Not submitted",
 * "Reopened, not submitted again", "2 of 3 done", "Started", "Not started",
 * "Before they joined". The count goes beside it as detail.
 */
export function personWeekWords(state: WeekWorkState, progress: PersonWeekProgress): { text: string; detail: string | null } {
  const count = progress.of > 0 ? doneOfWords(progress.done, progress.of) : null;
  switch (state.kind) {
    case "submitted":
      return { text: `${SUBMITTED} ${dayClockWords(state.at)}`, detail: count };
    case "locked":
      return { text: NOT_SUBMITTED, detail: count };
    case "reopened":
      return { text: REOPENED_NOT_SUBMITTED, detail: count };
    case "open":
      if (state.by === "joined-late" && !progress.started) return { text: BEFORE_THEY_JOINED, detail: null };
      if (progress.done > 0 && count) return { text: count, detail: null };
      return { text: progress.started ? STARTED : NOT_STARTED, detail: null };
  }
}

/** The tone a staff page draws a person's week in. */
export function personWeekTone(state: WeekWorkState, progress: PersonWeekProgress): "done" | "partly" | "none" {
  if (state.kind === "submitted") return "done";
  if (progress.started) return "partly";
  return "none";
}

// ---------------------------------------------------------------------------
// Reopening a week for one person
// ---------------------------------------------------------------------------

/** "Reopen week 3 for Sofia". */
export function reopenWeekWords(weekNumber: number, firstName: string): string {
  return `Reopen week ${weekNumber} for ${firstName}`;
}

/** The confirm's words. */
export function reopenConfirmWords(weekNumber: number, firstName: string): string {
  return `${firstName} can change week ${weekNumber} again until submitting it, or until the group’s next session starts. Nobody is emailed.`;
}

export const REOPEN = "Reopen";
export const KEEP_IT_LOCKED = "Keep it locked";
export const REOPEN_FAILED = "That didn’t reopen. Check your connection and try again.";

/** Said once a reopen has gone through. */
export function reopenedDoneWords(weekNumber: number, firstName: string): string {
  return `Week ${weekNumber} is open again for ${firstName}.`;
}

/** Refusals of the routes. */
export const NOT_YOURS_TO_REOPEN = "Only somebody running this person’s group can reopen their week.";
export const ALREADY_OPEN = "That week isn’t locked, so there’s nothing to reopen.";
export const NOTHING_TO_SUBMIT = "This week has nothing to submit: tick its readings and it’s done.";
export const ALREADY_SUBMITTED = "You’ve already submitted this week.";
export const NOT_A_SUBMIT_WEEK = "That week isn’t one you submit here.";
