import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { namesAnd, namesOr, numberWords } from "../writtenAnswerWords";
import type { NotDone, PersonWeekProgress, WeekDue, WeekWorkState } from "./model";

/**
 * EVERY WORD THE WEEK SAYS ABOUT ITSELF: the week page's line about until
 * when the work can change, its status box, Send and the check before it, how
 * late something was, a closed programme, and the one line a staff page says
 * of a person's week. One file, so the pages and the routes say one thing.
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
 * The London day a programme's work closes at the end of: the day before the
 * midnight `closesAt` is. "Wed 23 Dec".
 */
export function closeDayWords(closesAt: Date): string {
  return londonDayLabel(new Date(closesAt.getTime() - 1));
}

/** "This week stays open until the programme closes, at the end of Wed 23 Dec." */
export function staysOpenWords(closesAt: Date | null): string {
  return closesAt
    ? `This week stays open until the programme closes, at the end of ${closeDayWords(closesAt)}.`
    : "This week stays open until the programme closes.";
}

/** The session line on its own: when it is, or why there is none. "" for somebody with no group yet. */
function sessionLineWords(due: WeekDue, room: string): string {
  if (due.by === "session" && due.at) return `Your session: ${dayClockWords(due.at)}${room ? `, ${room}` : ""}.`;
  if (due.by === "cancelled" && due.at) return `Your session this week, ${dayClockWords(due.at)}, is cancelled.`;
  if (due.by === "undated") return "Your group’s time isn’t set yet.";
  if (due.by === "joined-late") return "You joined your group after this week’s session, so nothing you add to it shows as late.";
  return "";
}

/**
 * The line under the week's title that says until when the work can change
 * (privacy v17: "The week's page says until when you can change your
 * work"): the session they are due at, that anything added or changed after
 * it shows as late, and when the programme closes. `room` is the session's
 * room that week, "" for none. `reopenedBy` is read by nothing now: nothing
 * is reopened.
 */
export function lockLineWords(state: WeekWorkState, input: { room: string; reopenedBy?: string }): string {
  if (state.kind === "closed") return closedWords(state.at);
  const session = sessionLineWords(state.due, input.room);
  const late = state.due.at ? " Anything you add or change after it shows as late to the people who read your work, with how late." : "";
  return [session ? `${session}${late}` : "", staysOpenWords(state.closesAt)].filter(Boolean).join(" ");
}

/** A programme closed for work: "The programme closed at the end of Wed 23 Dec, so this week can’t change now." */
export function closedWords(closesAt: Date): string {
  return `The programme closed at the end of ${closeDayWords(closesAt)}, so this week can’t change now.`;
}

// ---------------------------------------------------------------------------
// How late
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * HOW LATE, in words: "40 minutes", "5 hours", "3 days" (minutes under an
 * hour, hours under a day, then days, each rounded down; never under one
 * minute). The one way every page says it, from `lateBy`.
 */
export function lateWords(ms: number): string {
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  if (ms < HOUR) return count(Math.max(1, Math.floor(ms / MINUTE)), "minute");
  if (ms < DAY) return count(Math.floor(ms / HOUR), "hour");
  return count(Math.floor(ms / DAY), "day");
}

/** "Late" on a staff page. */
export const LATE = "Late";

/** "Late: 3 days after the session", as the people who read somebody's work see it. */
export function lateAfterSessionWords(ms: number): string {
  return `${LATE}: ${lateWords(ms)} after the session`;
}

/** "3 days after your session", as the person sees it of their own work. */
export function afterYourSessionWords(ms: number): string {
  return `${lateWords(ms)} after your session`;
}

/** The staff-only chip for an answer first sent after its own deadline, before the session. */
export const AFTER_ITS_DEADLINE = "After its deadline";

/** A week before somebody was told their group: never late. */
export const JOINED_LATE = "Joined late";

// ---------------------------------------------------------------------------
// The status box
// ---------------------------------------------------------------------------

/** "1 of 3 done". */
export function doneOfWords(done: number, of: number): string {
  return `${done} of ${of} done`;
}

/** Who reads the written answer, as the locked box names them: "Rahul and Sofia", "Claudia and admins". */
export type Readers = { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null };

/** Whom to ask about the week: the group's facilitators, or the lead for a facilitator's own week. */
function askWho(readers: Readers): string {
  if (readers.kind === "facilitators") return readers.names.length > 0 ? namesOr(readers.names) : "your facilitators";
  return readers.leadName ?? "the programme’s lead";
}

/**
 * A closed week's line (the status box once the programme has closed): "The
 * programme has closed, so this week can’t change now." `readers` and
 * `wroteAnything` are read by nothing now.
 */
export function lockedBoxWords(_readers: Readers, _wroteAnything: boolean): string {
  return "The programme has closed, so this week can’t change now.";
}

/** The closed week's second line: "Everything you saved is kept. Ask Rahul about anything in it." */
export function askToReopenWords(readers: Readers): string {
  return `Everything you saved is kept. Ask ${askWho(readers)} about anything in it.`;
}

// ---------------------------------------------------------------------------
// Submit, and the check before it
// ---------------------------------------------------------------------------

/** "Submit week 3". */
export function submitWeekWords(weekNumber: number): string {
  return `Submit week ${weekNumber}`;
}

export const SUBMIT_LOCKS_LINE = "Submitting doesn’t close this week: you can keep changing it until the programme closes.";
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

/** "your action plan", for a title of "My action plan". */
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
    ? "Submitting sends your written answer, and the programme team can then read it. You can keep changing this week until the programme closes."
    : "Submitting sends your written answer, and your facilitator and the programme team can then read it. You can keep changing this week until the programme closes.";
}

/** Said when an answer over its limit stops Submit. */
export const CUT_TO_SUBMIT = "Cut your written answer to its limit to submit this week.";

// ---------------------------------------------------------------------------
// Sending a written answer
// ---------------------------------------------------------------------------

export const SEND_MY_ANSWER = "Send my answer";
export const CHANGE_MY_ANSWER = "Change my answer";
export const SENDING = "Sending…";
export const SEND_FAILED = "That didn’t send. Check your connection and try again.";
/** The Send route's refusals. */
export const NOTHING_TO_SEND = "Write your answer before you send it.";
export const CUT_TO_SEND = "Cut your written answer to its limit to send it.";

/** "Sent Tue 10 Nov, 9:31pm." */
export function sentLineWords(at: Date): string {
  return `Sent ${dayClockWords(at)}.`;
}

// ---------------------------------------------------------------------------
// The written answer's card
// ---------------------------------------------------------------------------

/**
 * Who reads the written answer, and from when (the week page's line, privacy
 * v17): "Once you send it, or once your session has started, Rahul, Claudia
 * and admins can read your written answer." A facilitator's own: the lead and
 * admins.
 */
export function answerReadersWords(readers: Readers, leadName: string | null): string {
  const names =
    readers.kind === "facilitators"
      ? [...readers.names, ...(leadName ? [leadName] : []), "admins"]
      : [...(readers.leadName ? [readers.leadName] : []), "admins"];
  return `Once you send it, or once your session has started, ${namesAnd(names)} can read your written answer.`;
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


// ---------------------------------------------------------------------------
// Staff pages: one line a person
// ---------------------------------------------------------------------------

/** "Meets Wed 3pm", "Met Wed 3pm": the head of a group's This week's work. */
export function groupSessionWords(at: Date, now: Date): string {
  const day = londonDayLabel(at).split(" ")[0];
  return `${now.getTime() >= at.getTime() ? "Met" : "Meets"} ${day} ${londonClockLabel(at)}`;
}

export const STARTED = "Started";
export const NOT_STARTED = "Not started";
export const DONE = "Done";
export const DONE_ON_TIME = "Done on time";
export const DONE_LATE = "Done late";
/** The page as it was: the review page's own lines. */
export const BEFORE_THEY_JOINED = "Before they joined";
export const REOPENED_NOT_SUBMITTED = "Reopened, not submitted again";

/** What a staff page knows of one person's week to say it. */
export type PersonWeekLine = {
  progress: PersonWeekProgress;
  /** When the week became done (`weekDoneAt`), or null. */
  doneAt: Date | null;
  /** The session they were due at. */
  due: WeekDue;
};

/**
 * Where one person's week stands, as a staff page says it: "Done on time",
 * "Done late" (with how late beside it), "Done" (no session to tell it
 * against), "2 of 3 done", "Started", "Not started", "Joined late".
 */
export function personWeekWords(line: PersonWeekLine): { text: string; detail: string | null } {
  const { progress, doneAt, due } = line;
  const count = progress.of > 0 ? doneOfWords(progress.done, progress.of) : null;
  if (progress.weekDone && progress.started) {
    const late = doneAt && due.at && doneAt.getTime() > due.at.getTime() ? doneAt.getTime() - due.at.getTime() : null;
    if (late !== null) return { text: DONE_LATE, detail: lateAfterSessionWords(late) };
    return { text: due.at ? DONE_ON_TIME : DONE, detail: null };
  }
  if (due.by === "joined-late" && !progress.started) return { text: JOINED_LATE, detail: null };
  if (progress.done > 0 && count) return { text: count, detail: null };
  return { text: progress.started ? STARTED : NOT_STARTED, detail: null };
}

/** The tone a staff page draws a person's week in. */
export function personWeekTone(line: PersonWeekLine): "done" | "partly" | "none" {
  if (line.progress.weekDone && line.progress.started) return "done";
  if (line.progress.started) return "partly";
  return "none";
}

// ---------------------------------------------------------------------------
// Reopening: gone. The page as it was keeps its words until it is redrawn.
// ---------------------------------------------------------------------------

/** "Reopen week 3 for Sofia" (the page as it was). */
export function reopenWeekWords(weekNumber: number, firstName: string): string {
  return `Reopen week ${weekNumber} for ${firstName}`;
}

/** The confirm's words (the page as it was): true now, since nothing is locked. */
export function reopenConfirmWords(weekNumber: number, firstName: string): string {
  return `${firstName} can already change week ${weekNumber}: weeks stay open until the programme closes. Nobody is emailed.`;
}

export const REOPEN = "Reopen";
export const KEEP_IT_LOCKED = "Keep it as it is";
export const REOPEN_FAILED = "That didn’t go through. Check your connection and try again.";

/** Said once the old Reopen button has been pressed: nothing was changed. */
export function reopenedDoneWords(weekNumber: number, firstName: string): string {
  return `Week ${weekNumber} is already open for ${firstName}.`;
}

/** The reopen route's answer: nothing locks, so nothing is reopened, and nothing is written. */
export const WEEKS_STAY_OPEN =
  "Weeks no longer lock, so there’s nothing to reopen: everybody can keep changing their work until the programme closes.";

/** Refusals of the routes. */
export const NOTHING_TO_SUBMIT = "This week has nothing to submit: tick its readings and it’s done.";
export const NOT_A_SUBMIT_WEEK = "That week isn’t one you submit here.";
