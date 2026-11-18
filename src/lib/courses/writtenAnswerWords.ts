import { londonClockLabel, londonDayLabel } from "./londonLabels";
import { clockWords, dayWords } from "./sessionChange/words";
import type { When, WordRange } from "./weekBlocks/model";

/**
 * EVERY WORD THE WRITTEN ANSWER SAYS, in one file, so
 * the pages and the routes say one thing.
 *
 * The boards' words are kept exactly, apostrophes and all. Where a board
 * draws nothing (a facilitator's own answer, a refusal),
 * the words are written here in the boards' voice and listed in the build
 * notes for the boards' designers to confirm.
 *
 * Never "exercise" for the written answer, and never a mark, a score or a
 * total: nothing is counted but words. Feedback on it is a signed comment,
 * whose words are feedback's own (`feedback/words.ts`).
 *
 * The week stays open (`src/lib/courses/weekWork/`): an answer has its own
 * Send, and the words its pages say of it being sent are "Sent". Nothing is
 * submitted, locked or reopened. Who reads it, until when it can change and
 * how late anything was are the week's own words (`weekWork/words.ts`).
 */

const SMALL_NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "four", as the boards write a small count in running text; digits from 11. */
export function numberWords(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n);
}

/** "Rahul and Sofia", "Rahul, Sofia and Tom". */
export function namesAnd(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Rahul or Sofia", "Rahul, Sofia or Tom". */
export function namesOr(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** "Mon 16 Nov, 10:42pm", an instant as the reading pages date it. */
export function dayAndClockWords(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// The writer's own route: refusals
// ---------------------------------------------------------------------------

export const ANSWER_NOT_HERE = "That answer isn’t on this week any more. Reload the page.";
/** A save that still asks to send: the page was opened before an answer had its own Send. */
export const ANSWER_SEND_RELOAD = "Reload the page to send your written answer.";
export const ANSWER_SENT_CANNOT_EMPTY = "A sent answer can’t be empty. Write it again, or leave it as it was.";
export const ANSWER_TOO_LONG_TO_STORE = "That’s longer than an answer can be. Cut it down and try again.";
export const ANSWER_NOT_SAVED = "Couldn’t save that just now. It tries again as you type.";

/** The top of the word range is a limit (the guides: "Word limits are limits, not targets"). */
export function overLimitWords(words: number, limit: number, alreadySent: boolean): string {
  return alreadySent
    ? `That’s ${words} words, over the limit of ${limit}, so this change isn’t saved. Cut it to ${limit} or fewer.`
    : `That’s ${words} words. The limit is ${limit}: cut it to ${limit} or fewer to send it.`;
}

// ---------------------------------------------------------------------------
// The week page
// ---------------------------------------------------------------------------

export const WRITTEN_ANSWER = "Written answer";
export const YOUR_ANSWER = "Your answer";
export const DRAFT = "Draft";
export const SENT = "Sent";
export const FEEDBACK = "Feedback";
export const DUE_TONIGHT = "Due tonight";
export const DUE_TODAY = "Due today";

/** "241 words · 250 to 350", or "241 words" for an answer with no range. */
export function wordCountWords(words: number, range: WordRange | null): string {
  const count = `${words} ${words === 1 ? "word" : "words"}`;
  return range ? `${count} · ${range.min} to ${range.max}` : count;
}

/** "250 to 350 words". */
export function rangeWords(range: WordRange): string {
  return `${range.min} to ${range.max} words`;
}

/** "noon" for 12:00, the house clock otherwise ("5:30pm"), "" for none. */
function dueClock(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  return hhmm === "12:00" ? "noon" : clockWords(hhmm);
}

/**
 * The due line, from the group's own calendar (`dueMoment`) and the course's
 * day-before time: "Due by the end of today, Mon 16 Nov." (the board),
 * "Due by noon, Mon 2 Nov.", "Due before your session, Tue 17 Nov.". With
 * no date to give (no group yet), the rule alone.
 */
export function dueLineWords(
  rule: When,
  due: { dateKey: string } | null,
  options: { todayKey: string; dayBeforeTime: string | null; first: boolean },
): string {
  const session = options.first ? "your first session" : "your session";
  const day = due ? dayWords(due.dateKey) : "";
  const today = Boolean(due && due.dateKey === options.todayKey);
  if (rule === "dayBefore") {
    const clock = dueClock(options.dayBeforeTime);
    const by = clock ? `by ${clock}` : "by the end of";
    if (!day) return clock ? `Due by ${clock} the day before ${session}.` : `Due by the end of the day before ${session}.`;
    if (clock) return today ? `Due ${by} today, ${day}.` : `Due ${by}, ${day}.`;
    return today ? `Due by the end of today, ${day}.` : `Due by the end of the day, ${day}.`;
  }
  const lead = rule === "atSession" ? `Due at ${session}` : `Due before ${session}`;
  return day ? `${lead}, ${day}.` : `${lead}.`;
}

/**
 * The line under the box about who reads it, and that they may leave
 * feedback. A fellow's: "Rahul and Sofia read it before your session and may
 * give feedback on it." A facilitator's own is read by the lead and admins,
 * outside the session. No rubric level comes back: feedback is a comment.
 */
export function readersFeedbackWords(readers: { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null }): string {
  if (readers.kind === "facilitators") {
    const who = readers.names.length > 0 ? namesAnd(readers.names) : "Your facilitators";
    return `${who} read it before your session and may give feedback on it.`;
  }
  const who = readers.leadName ? `${readers.leadName} and admins` : "Admins";
  return `${who} read it and may give feedback on it.`;
}

/** "Sent Mon 16 Nov, 10:42pm." */
export function sentLineWords(at: Date): string {
  return `Sent ${dayAndClockWords(at)}.`;
}

/** "Feedback from Rahul". */
export function feedbackFromWords(byName: string): string {
  return `Feedback from ${byName}`;
}

/** "Draft · 241 words" (the week page's This week). */
export function draftStateWords(words: number): string {
  return `${DRAFT} · ${words} ${words === 1 ? "word" : "words"}`;
}

/** "Sent Mon 16 Nov" (the programme page's task row). */
export function sentOnWords(at: Date): string {
  return `Sent ${londonDayLabel(at)}`;
}

// ---------------------------------------------------------------------------
// Written answers, as the people running a group read them
// ---------------------------------------------------------------------------

export const NOT_SENT_YET = "Not sent yet";
export const NOT_STARTED = "Not started";
export const LATE = "Late";

/** "Sent Mon 16 Nov, 10:42pm": when an answer to give feedback on was sent. */
export function listSentWords(at: Date): string {
  return `Sent ${dayAndClockWords(at)}`;
}

/** "Not sent, read since the session, Wed 18 Nov, 3pm": an answer its readers may read because the session started before it was sent. */
export function listReadSinceWords(at: Date): string {
  return `Not sent, read since the session, ${dayAndClockWords(at)}`;
}

/**
 * The line under a written answer on the reading view of a person's week (the
 * week stays open): "Amara can change it until the programme closes. Before
 * the session you read it as last sent; from the session, as it stands."
 */
export function reviewWeekLineWords(firstName: string): string {
  return `${firstName} can change it until the programme closes. Before the session you read it as last sent; from the session, as it stands.`;
}

/** "The question · 250 to 350 words". */
export function theQuestionWords(range: WordRange | null): string {
  return range ? `The question · ${rangeWords(range)}` : "The question";
}

/** "43 words". */
export function commentCountWords(words: number): string {
  return `${words} ${words === 1 ? "word" : "words"}`;
}
