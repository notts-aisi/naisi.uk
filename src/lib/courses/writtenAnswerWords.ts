import { londonClockLabel, londonDayLabel } from "./londonLabels";
import { clockWords, dayWords } from "./sessionChange/words";
import type { When, WordRange } from "./weekBlocks/model";

/**
 * EVERY WORD THE WRITTEN ANSWER SAYS (boards wk-week, wk-week-phone,
 * wk-review, wk-review-phone, wk-feedback-phone, wk-fac-group, wk-programme),
 * in one file, so the pages, the routes and the email say one thing.
 *
 * The boards' words are kept exactly, apostrophes and all. Where a board
 * draws nothing (a facilitator's own answer, a course with no rubric, an
 * answer reopened, a refusal), the words are written here in the boards'
 * voice and listed in the build notes for the boards' designers to confirm.
 *
 * Never "exercise" for the written answer, and never a mark, a score or a
 * total: "No marks." is said, and nothing is counted but words.
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

/** "Mon 16 Nov, 10:42pm", an instant as the review page and the feedback page date it. */
export function dayAndClockWords(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/** "9:58am" when `at` is on `todayKey`'s day in London, "on Tue 17 Nov at 9:58am" otherwise. */
function whenOpenedWords(at: Date, sameDay: boolean): string {
  return sameDay ? `at ${londonClockLabel(at)}` : `on ${londonDayLabel(at)} at ${londonClockLabel(at)}`;
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

/** What feedback covers, from the course's rubric: "four things: a clear position, ..., and so what". */
export function feedbackCoversWords(rows: { count: number; inWords: string } | null): string {
  return rows ? ` and give feedback on ${numberWords(rows.count)} ${rows.count === 1 ? "thing" : "things"}: ${rows.inWords}` : " and give feedback";
}

/**
 * The line under the box about who reads it and what feedback covers. A
 * fellow's: "Rahul and Sofia read it before your session and give feedback
 * on four things: a clear position, reasons and evidence, the best
 * objection, and so what. No marks." (the board). A facilitator's own is
 * read by the lead and admins, outside the session.
 */
export function readersFeedbackWords(
  readers: { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null },
  rows: { count: number; inWords: string } | null,
): string {
  if (readers.kind === "facilitators") {
    const who = readers.names.length > 0 ? namesAnd(readers.names) : "Your facilitators";
    return `${who} read it before your session${feedbackCoversWords(rows)}. No marks.`;
  }
  const who = readers.leadName ? `${readers.leadName} and admins` : "Admins";
  return `${who} read it${feedbackCoversWords(rows)}. No marks.`;
}

/** "Send to Rahul and Sofia" (the board), "Send to Claudia and admins" for a facilitator's own. */
export function sendToWords(names: readonly string[]): string {
  return names.length > 0 ? `Send to ${namesAnd(names)}` : "Send to your facilitators";
}

/** "Rahul and Sofia see it on their group page. No email." (the board), or a facilitator's own. */
export function seenWhereWords(
  readers: { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null },
): string {
  if (readers.kind === "facilitators") {
    const who = readers.names.length > 0 ? namesAnd(readers.names) : "Your facilitators";
    return `${who} see it on their group page. No email.`;
  }
  return `${readers.leadName ? `${readers.leadName} and admins` : "Admins"} see it. No email.`;
}

/**
 * Who else can read it (Q30 C: "the page says so"): "Claudia and admins can
 * read it too. Other fellows can’t." A facilitator's own: "Nobody else on the
 * programme can read it, your co-facilitators included."
 */
export function alsoReadByWords(
  readers: { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null },
  leadName: string | null,
): string {
  if (readers.kind === "lead") return "Nobody else on the programme can read it, your co-facilitators included.";
  return `${leadName ? `${leadName} and admins` : "Admins"} can read it too. Other fellows can’t.`;
}

/** "You can change it until Rahul or Sofia opens it." (the board). */
export function changeUntilWords(
  readers: { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null },
  again = false,
): string {
  const who =
    readers.kind === "facilitators"
      ? readers.names.length > 0
        ? namesOr(readers.names)
        : "one of your facilitators"
      : readers.leadName
        ? `${readers.leadName} or an admin`
        : "an admin";
  return `You can change it until ${who} opens it${again ? " again" : ""}.`;
}

/** "Sent Mon 16 Nov, 10:42pm." */
export function sentLineWords(at: Date): string {
  return `Sent ${dayAndClockWords(at)}.`;
}

/** "Rahul opened it on Tue 17 Nov at 9:58am, so it can’t change now." (wk-feedback-phone's locked line). */
export function lockedLineWords(byName: string, at: Date): string {
  return `${byName} opened it on ${londonDayLabel(at)} at ${londonClockLabel(at)}, so it can’t change now.`;
}

/** "Rahul reopened it for edits on Tue 17 Nov at 10:15am." */
export function reopenedLineWords(byName: string, at: Date): string {
  return `${byName} reopened it for edits on ${londonDayLabel(at)} at ${londonClockLabel(at)}.`;
}

/** "Feedback from Rahul" (wk-programme). */
export function feedbackFromWords(byName: string): string {
  return `Feedback from ${byName}`;
}

/** "Draft · 241 words" (wk-week's This week). */
export function draftStateWords(words: number): string {
  return `${DRAFT} · ${words} ${words === 1 ? "word" : "words"}`;
}

/** "Sent Mon 16 Nov" (wk-programme's task row). */
export function sentOnWords(at: Date): string {
  return `Sent ${londonDayLabel(at)}`;
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
export const FEEDBACK_SENT = "Feedback sent";
export const NOT_SENT_YET = "Not sent yet";
export const NOT_STARTED = "Not started";
export const LATE = "Late";
export const PREVIOUS = "Previous";
export const SHOW_ALL_OF_IT = "Show all of it";
export const REOPEN_FOR_EDITS = "Reopen for edits";
export const THE_RUBRIC = "The rubric";
export const A_SHORT_COMMENT = "A short comment";
export const COMMENT_HINT = "What worked, what to try next. Short and specific beats long.";
export const NO_RUBRIC_LINE =
  "This course has no rubric yet, so feedback here is a comment alone. An admin can add one in the course’s details.";
export const NO_WRITTEN_ANSWER_THIS_WEEK = "This week has no written answer.";
export const NOBODY_HERE = "Nobody’s written answer is yours to give feedback on in this group.";
export const NOBODY_SENT_YET = "Nobody has sent this week’s written answer yet.";
export const FEEDBACK_NOT_SENT = "That feedback didn’t send. Check your connection and try again.";
export const REOPEN_FAILED = "That didn’t reopen. Check your connection and try again.";

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

/** "Sent Mon 16 Nov, 10:42pm · opened by you", "· opened by Rahul", or the sent time alone. */
export function listSentWords(at: Date, openedBy: string | null): string {
  return openedBy ? `Sent ${dayAndClockWords(at)} · opened by ${openedBy}` : `Sent ${dayAndClockWords(at)}`;
}

/** "By Sofia", "By you": who sent the feedback. */
export function byWords(name: string): string {
  return `By ${name}`;
}

/** "The question · 250 to 350 words". */
export function theQuestionWords(range: WordRange | null): string {
  return range ? `The question · ${rangeWords(range)}` : "The question";
}

/** "Amara’s answer". */
export function answerHeadWords(firstName: string): string {
  return `${firstName}’s answer`;
}

/**
 * The opened line (wk-review): "You opened this at 9:58am, so Amara can’t
 * change it now. Reopen for edits if Amara needs to." Where the board has a
 * gendered pronoun the line names the person: the site uses none.
 */
export function openedByYouWords(at: Date, sameDay: boolean, firstName: string): string {
  return `You opened this ${whenOpenedWords(at, sameDay)}, so ${firstName} can’t change it now. Reopen for edits if ${firstName} needs to.`;
}

/** "Rahul opened this at 9:58am, so Amara can’t change it now." */
export function openedByOtherWords(byName: string, at: Date, sameDay: boolean, firstName: string): string {
  return `${byName} opened this ${whenOpenedWords(at, sameDay)}, so ${firstName} can’t change it now.`;
}

/** A sent answer nobody whose opening locks it has opened: "Amara can still change it until Rahul or Sofia opens it." */
export function stillOpenWords(firstName: string, lockers: readonly string[]): string {
  return lockers.length > 0
    ? `${firstName} can still change it until ${namesOr(lockers)} opens it.`
    : `${firstName} can still change it.`;
}

/** Said once a reopen has gone through. */
export function reopenedWords(firstName: string): string {
  return `Reopened. ${firstName} can change it again until it’s opened.`;
}

/** "Strong: States a specific view someone could disagree with". */
export function levelLineWords(level: string, descriptor: string): string {
  return `${level}: ${descriptor}`;
}

/** "43 words". */
export function commentCountWords(words: number): string {
  return `${words} ${words === 1 ? "word" : "words"}`;
}

/** "Send feedback to Amara". */
export function sendFeedbackWords(firstName: string): string {
  return `Send feedback to ${firstName}`;
}

/** "Emails Amara that feedback is waiting. The feedback stays on the site." (the board). */
export function emailsLineWords(firstName: string): string {
  return `Emails ${firstName} that feedback is waiting. The feedback stays on the site.`;
}

/** "Amara sees the four levels and your comment. There are no marks." (the board). */
export function seesLevelsWords(firstName: string, rows: number): string {
  return rows > 0
    ? `${firstName} sees the ${numberWords(rows)} ${rows === 1 ? "level" : "levels"} and your comment. There are no marks.`
    : `${firstName} sees your comment. There are no marks.`;
}

/** "The email Amara gets". */
export function emailTheyGetWords(firstName: string): string {
  return `The email ${firstName} gets`;
}

/** "Feedback sent by you on Tue 17 Nov at 10:05am.", or by somebody else. */
export function feedbackSentLineWords(byName: string, at: Date | null): string {
  return at ? `Feedback sent by ${byName} on ${londonDayLabel(at)} at ${londonClockLabel(at)}.` : `Feedback sent by ${byName}.`;
}

/** What the page says once feedback has gone. */
export function feedbackSentResultWords(firstName: string, emailed: boolean): string {
  return emailed
    ? `Feedback sent. ${firstName} has been emailed that it’s waiting.`
    : `Feedback sent. The email to ${firstName} didn’t go, so the feedback is on the site without it.`;
}

/** A comment over its cap. */
export function commentTooLongWords(limit: number): string {
  return `That comment is over ${limit} words. Short and specific beats long: cut it down.`;
}

// ---------------------------------------------------------------------------
// The email (wk-review's "The email Amara gets")
// ---------------------------------------------------------------------------

/** "Feedback on your week 3 written answer". */
export function feedbackEmailSubject(weekNumber: number): string {
  return `Feedback on your week ${weekNumber} written answer`;
}

/** "Rahul has left feedback on your threat model." */
export function feedbackEmailLead(byFirstName: string, answerName: string): string {
  return `${byFirstName} has left feedback on ${answerName}.`;
}

export const READ_YOUR_FEEDBACK = "Read your feedback";

// ---------------------------------------------------------------------------
// The fellow's feedback page (wk-feedback-phone)
// ---------------------------------------------------------------------------

/** "Week 3 · Your written answer". */
export function feedbackEyebrowWords(weekNumber: number): string {
  return `Week ${weekNumber} · Your written answer`;
}

/** "Feedback on your threat model". */
export function feedbackTitleWords(answerName: string): string {
  return `Feedback on ${answerName}`;
}

/** "From Rahul · Tue 17 Nov, 10:05am". */
export function fromWords(byName: string, at: Date | null): string {
  return at ? `From ${byName} · ${dayAndClockWords(at)}` : `From ${byName}`;
}

/** "There are no marks. The four levels are the rubric on Start here." (the board, its link once Start here is a page). */
export function noMarksWords(rows: number): string {
  return rows > 0
    ? `There are no marks. The ${numberWords(rows)} ${rows === 1 ? "level is" : "levels are"} the rubric on Start here.`
    : "There are no marks.";
}

/** "Rahul’s comment". */
export function commentHeadWords(byName: string): string {
  return `${byName}’s comment`;
}

/** "266 words · sent Mon 16 Nov, 10:42pm". */
export function sentMetaWords(words: number, at: Date | null): string {
  const count = `${words} ${words === 1 ? "word" : "words"}`;
  return at ? `${count} · sent ${dayAndClockWords(at)}` : count;
}

export const SHOW_THE_WHOLE_ANSWER = "Show the whole answer";
export const NOT_SENT_FEEDBACK_PAGE = "You haven’t sent this answer yet. It’s on the week’s page.";

/** Before any feedback: "No feedback yet. Rahul and Sofia give feedback once they’ve read it." */
export function noFeedbackYetWords(names: readonly string[]): string {
  return `No feedback yet. ${names.length > 0 ? namesAnd(names) : "Your facilitators"} give feedback once they’ve read it.`;
}

// ---------------------------------------------------------------------------
// The review queue card (wk-fac-group) and Home
// ---------------------------------------------------------------------------

export const REVIEW_QUEUE = "Review queue";
export const GIVE_FEEDBACK = "Give feedback";
/** In the same place as the count, so it reads as a label too: no full stop. */
export const NOTHING_TO_GIVE_FEEDBACK_ON = "Nothing to give feedback on";

/** "2 to give feedback on". */
export function toGiveFeedbackOnWords(n: number): string {
  return `${n} to give feedback on`;
}

/** "Sent Mon 16 Nov, 11:58pm". */
export function sentAtWords(at: Date): string {
  return `Sent ${dayAndClockWords(at)}`;
}
