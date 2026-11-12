import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { namesAnd, numberWords } from "../writtenAnswerWords";
import type { NotDone, PersonWeekProgress, WeekDue, WeekWorkState } from "./model";

/**
 * EVERY WORD THE WEEK SAYS ABOUT ITSELF: the week page's line about until
 * when the work can change, the box at its top (after the session, and a
 * facilitator's own), Send and Change my answer, when each thing was done and
 * how late, a closed programme, what isn't done (the reminders), and what a
 * staff page says of a person's week and of words changed since. One file,
 * so the pages, the routes and the emails say one thing.
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
 * THE LINE UNDER THE WEEK'S TITLE THAT SAYS UNTIL WHEN THE WORK CAN CHANGE
 * (privacy v17: "The week's page says until when you can change your
 * work"). Before the session they are due at: the session, that anything
 * added or changed after it shows as late, and when the programme closes.
 * Once that session has started, the box at the top of the week says the
 * session and the late (`sessionMetWords`), so this line says only when the
 * programme closes. Once it has closed: that the week can't change now.
 * `room` is the session's room that week, "" for none.
 */
export function untilWhenWords(state: WeekWorkState, input: { room: string; now: Date }): string {
  if (state.kind === "closed") return closedWords(state.at);
  const started = state.due.at !== null && input.now.getTime() >= state.due.at.getTime();
  const session = started ? "" : sessionLineWords(state.due, input.room);
  const late = !state.due.at
    ? ""
    : state.due.by === "cancelled"
      ? " Anything you add or change after the time it would have started shows as late to the people who read your work, with how late."
      : " Your work stays open after it: anything you add or change after it shows as late to the people who read your work, with how late.";
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
// The box at the top of the week, before the session
// ---------------------------------------------------------------------------

/** "1 of 3 done". */
export function doneOfWords(done: number, of: number): string {
  return `${done} of ${of} done`;
}

/** Who reads the written answer: the group's facilitators by first name, or the lead and admins for a facilitator's own. */
export type Readers = { kind: "facilitators"; names: string[] } | { kind: "lead"; leadName: string | null };

// ---------------------------------------------------------------------------
// What isn't done (the reminders, and the routes' refusals)
// ---------------------------------------------------------------------------

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

/**
 * WHEN ONE OF THE PERSON'S OWN THINGS WAS DONE, against the session they are
 * due at, as the week page says it beside the thing: before that session has
 * started, the time alone ("Saved Tue 3 Nov, 8:15pm."); once it has, whether
 * it was before it ("Saved Tue 3 Nov, 8:15pm, before the session.") or how
 * long after ("Saved Sat 7 Nov, 6:20pm: 3 days after your session"). With no
 * session to be due at (no group yet, told the group after it met, no time
 * set), never late: the time alone. Always the clock time, never "just now",
 * so a page left open never says something stale.
 */
function whenDoneWords(verb: string, at: Date, due: WeekDue, now: Date | null): string {
  const when = dayClockWords(at);
  if (now === null || due.at === null || now.getTime() < due.at.getTime()) return `${verb} ${when}.`;
  const late = at.getTime() - due.at.getTime();
  if (late > 0) return `${verb} ${when}: ${afterYourSessionWords(late)}`;
  return `${verb} ${when}, before the session.`;
}

/** "Saved Tue 3 Nov, 8:15pm, before the session.", "Saved Tue 10 Nov, 8:01pm: 6 days after your session"; given no `now`, the time alone. */
export function savedLineWords(at: Date, due: WeekDue, now: Date | null): string {
  return whenDoneWords("Saved", at, due, now);
}

/**
 * "Sent Tue 10 Nov, 9:31pm.", and once the session has started "Sent Sun 8
 * Nov, 9:12pm: 4 days after your session" or "…, before the session.". Given
 * no `now`, the time alone.
 */
export function sentLineWords(at: Date, due: WeekDue = { at: null, by: "no-group" }, now: Date | null = null): string {
  return whenDoneWords("Sent", at, due, now);
}

/** How long after the session something done at `at` was, once that session has started; null otherwise. */
function lateOnceStarted(at: Date, due: WeekDue, now: Date): number | null {
  if (due.at === null || now.getTime() < due.at.getTime()) return null;
  const late = at.getTime() - due.at.getTime();
  return late > 0 ? late : null;
}

/**
 * "Ticked Sun 15 Nov", under a reading the person ticked, its day alone as it
 * always was; "Ticked Sat 7 Nov: 3 days after your session" when it was
 * ticked after the session they are due at.
 */
export function tickedOnWords(at: Date, due: WeekDue = { at: null, by: "no-group" }, now: Date = at): string {
  const late = lateOnceStarted(at, due, now);
  return late === null ? `Ticked ${londonDayLabel(at)}` : `Ticked ${londonDayLabel(at)}: ${afterYourSessionWords(late)}`;
}

/** "All ticked by Tue 3 Nov.", "All ticked by Sat 7 Nov: 3 days after your session" (a task that is only ticks). */
export function allTickedWords(at: Date, due: WeekDue, now: Date): string {
  const late = lateOnceStarted(at, due, now);
  return late === null ? `All ticked by ${londonDayLabel(at)}.` : `All ticked by ${londonDayLabel(at)}: ${afterYourSessionWords(late)}`;
}

/**
 * A sent answer changed since, as its writer is told who reads what: before
 * the session (or with no session to be due at) the people who read their
 * work still read the version they sent until they send it again; once the
 * session has started, they read the latest words.
 */
export function changedSinceSentWords(sessionStarted: boolean): string {
  return sessionStarted
    ? "You’ve changed it since you sent it. Your session has started, so the people who read your work see your latest words."
    : "You’ve changed it since you sent it. The people who read your work still see the version you sent until you send it again.";
}

/** What the rest of a week needs, beside one written answer, for "done once it's sent". */
export type RestOfWeek = "ticks" | "done" | "left" | "nothing";

/**
 * Under Send, what makes the week done: "Week 1 is done once it’s sent:
 * every reading is already ticked." (everything else it counts is ticks, all
 * ticked), "…: everything else it asks for is done." (writing too), or "Week
 * 1 is done once it’s sent and everything else it asks for is done.", or
 * "Week 1 is done once it’s sent." when the answer is all it asks for.
 */
export function doneOnceSentWords(weekNumber: number, rest: RestOfWeek): string {
  if (rest === "nothing") return `Week ${weekNumber} is done once it’s sent.`;
  if (rest === "ticks") return `Week ${weekNumber} is done once it’s sent: every reading is already ticked.`;
  if (rest === "done") return `Week ${weekNumber} is done once it’s sent: everything else it asks for is done.`;
  return `Week ${weekNumber} is done once it’s sent and everything else it asks for is done.`;
}

// ---------------------------------------------------------------------------
// The box at the top of the week: after the session, and a facilitator's own
// ---------------------------------------------------------------------------

/**
 * ONCE THE SESSION THEY ARE DUE AT HAS STARTED, the one line at the top of a
 * member's week, a fact and not a warning: "Group C met for week 1 on Wed 4
 * Nov. You can still finish it. Anything you add or change now shows as late
 * to the people who read your work, with how late." Done, it says nothing of
 * finishing. A cancelled session (the group keeping pace) is told against
 * when it would have started. Null before the session, and with no session
 * to be due at: nothing of theirs is ever late then.
 */
export function sessionMetWords(input: { due: WeekDue; weekNumber: number; groupName: string | null; done: boolean; now: Date }): string | null {
  const { due, weekNumber, groupName, done, now } = input;
  if (due.at === null || now.getTime() < due.at.getTime()) return null;
  const finish = done ? "" : " You can still finish it.";
  if (due.by === "cancelled") {
    const whose = groupName ? `${groupName}’s` : "Your group’s";
    return `${whose} week ${weekNumber} session, ${dayClockWords(due.at)}, was cancelled.${finish} Anything you add or change after the time it would have started shows as late to the people who read your work, with how late.`;
  }
  return `${groupName ?? "Your group"} met for week ${weekNumber} on ${londonDayLabel(due.at)}.${finish} Anything you add or change now shows as late to the people who read your work, with how late.`;
}

/**
 * A FACILITATOR'S OWN WORK (privacy v17: "If you facilitate a group, your own
 * work is read by the lead and admins only"), the line at the top of their
 * week: who reads it, and that what they add after their group's session
 * shows those people as late. "You run Group C, so your own work is read by
 * Claudia and admins, not by your group. Group C met on Wed 4 Nov: anything
 * you add now shows them as late." `readers` is "Claudia and admins", or
 * "admins" with no lead; `runs` the group they run, null for somebody who
 * runs more than one; `meets` the group whose session their week goes by (the
 * one they hold a place in, or the one they run), null when that is not one
 * group.
 */
export function ownWorkWords(input: { due: WeekDue; runs: string | null; meets: string | null; readers: string; now: Date }): string {
  const { due, runs, meets, readers, now } = input;
  const who = runs
    ? `You run ${runs}, so your own work is read by ${readers}, not by your group.`
    : `You run groups on this programme, so your own work is read by ${readers}, not by your groups.`;
  if (due.at === null) return who;
  const day = londonDayLabel(due.at);
  if (now.getTime() < due.at.getTime()) {
    return `${who} Anything you add after ${meets ? `${meets}’s` : "your"} session on ${day} shows them as late.`;
  }
  if (due.by === "cancelled") {
    return `${who} ${meets ? `${meets}’s` : "Your group’s"} session on ${day} was cancelled: anything you add now shows them as late.`;
  }
  return `${who} ${meets ?? "Your group"} met on ${day}: anything you add now shows them as late.`;
}

// ---------------------------------------------------------------------------
// Feedback on words that have changed since
// ---------------------------------------------------------------------------

/** Over the version a piece of feedback was about, when the answer has changed since. */
export const THE_VERSION_THIS_FEEDBACK_WAS_ABOUT = "The version this feedback was about";
/** Over the answer as it stood at the session, when the words shown have changed since. */
export const AS_IT_STOOD_AT_THE_SESSION = "As it stood at the session";
/** A piece whose version is no longer kept (the person's own page). */
export const YOUR_ANSWER_CHANGED_SINCE = "Your answer has changed since this feedback was written.";

/** The same, as the people running the group read it: "Amara’s answer has changed since this feedback was written." */
export function answerChangedSinceWords(firstName: string): string {
  return `${firstName}’s answer has changed since this feedback was written.`;
}

// ---------------------------------------------------------------------------
// Staff pages: what was added or changed, and when
// ---------------------------------------------------------------------------

/** "Sent Mon 16 Nov, 10:42pm": when an answer was last sent, on a staff page. */
export function staffSentWords(at: Date): string {
  return `Sent ${dayClockWords(at)}`;
}

/** "Changed Sat 7 Nov, 6:20pm": when the words shown last changed, on a staff page; "Saved …" for an answer never sent. */
export function staffChangedWords(at: Date, sent = true): string {
  return `${sent ? "Changed" : "Saved"} ${dayClockWords(at)}`;
}

/**
 * A sent answer changed since, before the session, as its readers are told:
 * they read it as sent, never the change. "Amara has changed it since sending
 * it. You read it as sent until it’s sent again or the session starts."
 */
export function staffChangedSinceSentWords(firstName: string): string {
  return `${firstName} has changed it since sending it. You read it as sent until it’s sent again or the session starts.`;
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

/** What a staff page knows of one person's week to say it. */
export type PersonWeekLine = {
  progress: PersonWeekProgress;
  /** When the week became done (`weekDoneAt`), or null. */
  doneAt: Date | null;
  /** The session they were due at. */
  due: WeekDue;
};

/** Done, with something to count: a week with nothing to count is never said to be done or not. */
function saidDone(progress: PersonWeekProgress): boolean {
  return progress.weekDone && progress.of > 0;
}

/**
 * Where one person's week stands, as a staff page says it: "Done on time",
 * "Done late" (with how late beside it), "Done" (no session to tell it
 * against, or no time to tell it by), "2 of 3 done", "Started", "Not
 * started", "Joined late".
 */
export function personWeekWords(line: PersonWeekLine): { text: string; detail: string | null } {
  const { progress, doneAt, due } = line;
  const count = progress.of > 0 ? doneOfWords(progress.done, progress.of) : null;
  if (saidDone(progress)) {
    if (!doneAt || !due.at) return { text: DONE, detail: null };
    const late = doneAt.getTime() > due.at.getTime() ? doneAt.getTime() - due.at.getTime() : null;
    if (late !== null) return { text: DONE_LATE, detail: lateAfterSessionWords(late) };
    return { text: DONE_ON_TIME, detail: null };
  }
  if (due.by === "joined-late" && !progress.started) return { text: JOINED_LATE, detail: null };
  if (progress.done > 0 && count) return { text: count, detail: null };
  return { text: progress.started ? STARTED : NOT_STARTED, detail: null };
}

/** The tone a staff page draws a person's week in. */
export function personWeekTone(line: PersonWeekLine): "done" | "partly" | "none" {
  if (saidDone(line.progress)) return "done";
  if (line.progress.started) return "partly";
  return "none";
}

/** The reopen route's answer: nothing locks, so nothing is reopened, and nothing is written. */
export const WEEKS_STAY_OPEN =
  "Weeks no longer lock, so there’s nothing to reopen: everybody can keep changing their work until the programme closes.";

/** Refusals of the routes. */
export const NOTHING_TO_SUBMIT = "This week has nothing to submit: tick its readings and it’s done.";
export const NOT_A_SUBMIT_WEEK = "That week isn’t one you submit here.";
