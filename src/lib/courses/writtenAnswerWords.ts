import { londonClockLabel, londonDayLabel } from "./londonLabels";
import { clockWords, dayWords } from "./sessionChange/words";
import type { When, WordRange } from "./weekBlocks/model";

/**
 * EVERY WORD THE WRITTEN ANSWER SAYS (boards wk-week, wk-week-phone,
 * wk-review, wk-review-phone, wk-fac-group, wk-programme), in one file, so
 * the pages and the routes say one thing.
 *
 * The boards' words are kept exactly, apostrophes and all. Where a board
 * draws nothing (a facilitator's own answer, an answer reopened, a refusal),
 * the words are written here in the boards' voice and listed in the build
 * notes for the boards' designers to confirm.
 *
 * Never "exercise" for the written answer, and never a mark, a score or a
 * total: nothing is counted but words. Feedback on it is a signed comment,
 * whose words are feedback's own (`feedback/words.ts`).
 *
 * Since weeks are submitted (`src/lib/courses/weekWork/`), an answer is sent
 * by submitting its week, and the words the answer's own pages say of it
 * being sent are "Submitted". Who reads it, and until when it can change,
 * are the week's own words (`weekWork/words.ts`).
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

/** "Mon 16 Nov, 10:42pm", an instant as the review page dates it. */
export function dayAndClockWords(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// The writer's own route: refusals
// ---------------------------------------------------------------------------

export const ANSWER_NOT_HERE = "That answer isn’t on this week any more. Reload the page.";
export const ANSWER_LOCKED =
  "This answer has been opened, so it can’t change now. Ask whoever opened it to reopen it if you need to.";
/** A body that still asks to send: the page was opened before sending became submitting the week. */
export const ANSWER_SEND_RELOAD = "Your written answer is sent when you submit the week now. Reload the page.";
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
// The week page (boards wk-week, wk-week-phone)
// ---------------------------------------------------------------------------

export const WRITTEN_ANSWER = "Written answer";
export const YOUR_ANSWER = "Your answer";
export const DRAFT = "Draft";
export const SENT = "Submitted";
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

/** "Submitted Mon 16 Nov, 10:42pm." */
export function sentLineWords(at: Date): string {
  return `Submitted ${dayAndClockWords(at)}.`;
}

/** "Rahul opened it on Tue 17 Nov at 9:58am, so it can’t change now." (wk-feedback-phone's locked line). */
export function lockedLineWords(byName: string, at: Date): string {
  return `${byName} opened it on ${londonDayLabel(at)} at ${londonClockLabel(at)}, so it can’t change now.`;
}

/** "Feedback from Rahul" (wk-programme). */
export function feedbackFromWords(byName: string): string {
  return `Feedback from ${byName}`;
}

/** "Draft · 241 words" (wk-week's This week). */
export function draftStateWords(words: number): string {
  return `${DRAFT} · ${words} ${words === 1 ? "word" : "words"}`;
}

/** "Submitted Mon 16 Nov" (wk-programme's task row). */
export function sentOnWords(at: Date): string {
  return `Submitted ${londonDayLabel(at)}`;
}

// ---------------------------------------------------------------------------
// The review page (boards wk-review, wk-review-phone)
// ---------------------------------------------------------------------------

export const WRITTEN_ANSWERS = "Written answers";
/**
 * Over the lead's choice of group on the lead's own review page: the
 * Attendance tab's word for its own choice of group, with each group's tag
 * ("A") in a round pill and its name for a screen reader.
 */
export const GROUP = "Group";
export const TO_GIVE_FEEDBACK_ON = "To give feedback on";
export const WITH_FEEDBACK = "With feedback";
export const NOT_SENT_YET = "Not submitted yet";
export const NOT_STARTED = "Not started";
export const LATE = "Late";
export const PREVIOUS = "Previous";
export const SHOW_ALL_OF_IT = "Show all of it";
export const NO_WRITTEN_ANSWER_THIS_WEEK = "This week has no written answer.";
export const NOBODY_HERE = "Nobody’s written answer is yours to give feedback on in this group.";
export const NOBODY_SENT_YET = "Nobody has submitted this week’s written answer yet.";

/** "Group B · Week 3 · Written answers". */
export function reviewEyebrowWords(groupName: string, weekNumber: number): string {
  return `${groupName} · Week ${weekNumber} · ${WRITTEN_ANSWERS}`;
}

/** "Amara Okafor’s threat model", from the answer's name in running text ("your threat model"). */
export function reviewTitleWords(name: string, answerName: string): string {
  return `${name}’s ${answerName.replace(/^your\s+/i, "")}`;
}

/** "Next: Isaac". */
export function nextWords(firstName: string): string {
  return `Next: ${firstName}`;
}

/** "1 of 3 to give feedback on" (wk-review-phone's bar). */
export function positionWords(at: number, of: number): string {
  return `${at} of ${of} to give feedback on`;
}

/** "Submitted Mon 16 Nov, 10:42pm": when an answer to give feedback on was first sent. */
export function listSentWords(at: Date): string {
  return `Submitted ${dayAndClockWords(at)}`;
}

/** "Locked Wed 18 Nov, 3pm, not submitted": an answer its readers may read because its week locked first. */
export function listLockedWords(at: Date): string {
  return `Locked ${dayAndClockWords(at)}, not submitted`;
}

/**
 * The review page's line under an answer, from where its week stands:
 * "Submitted Tue 17 Nov, 9:31pm, so Amara can’t change it now.", "Locked
 * when the session started, Wed 18 Nov, 3pm. Amara didn’t submit it.", or,
 * for an answer sent before weeks were submitted, that it can still change.
 */
export function reviewWeekLineWords(week: { state: string; at: string | null }, firstName: string): string {
  if (week.state === "submitted" && week.at) return `Submitted ${dayAndClockWords(new Date(week.at))}, so ${firstName} can’t change it now.`;
  if (week.state === "locked" && week.at) return `Locked when the session started, ${dayAndClockWords(new Date(week.at))}. ${firstName} didn’t submit it.`;
  return `Sent before weeks were submitted: ${firstName} can still change it until the week is submitted or locks.`;
}

/** "By Sofia", "By you and Claudia": who left feedback on it, each once. */
export function byWords(names: readonly string[]): string {
  return `By ${namesAnd(names.filter(Boolean))}`;
}

/** "The question · 250 to 350 words". */
export function theQuestionWords(range: WordRange | null): string {
  return range ? `The question · ${rangeWords(range)}` : "The question";
}

/** "Amara’s answer". */
export function answerHeadWords(firstName: string): string {
  return `${firstName}’s answer`;
}

/** "43 words". */
export function commentCountWords(words: number): string {
  return `${words} ${words === 1 ? "word" : "words"}`;
}
