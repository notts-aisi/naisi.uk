import { londonClockLabel, londonDayLabel } from "../londonLabels";
import type { WeekEmailWords } from "../weekEmails/words";
import type { WeekLeft } from "../weekEmails/model";
import {
  DONE,
  DONE_LATE,
  DONE_ON_TIME,
  JOINED_LATE,
  NOT_STARTED,
  STARTED,
  lateAfterSessionWords,
  yourWords,
} from "../weekWork/words";
import { namesAnd, numberWords } from "../writtenAnswerWords";
import type { Bucket, LastReminded, PieceKey, PieceState, WorkFilterKey } from "./model";

/**
 * EVERY WORD OF A WEEK'S CARD ON A GROUP'S PAGE, AND OF REMIND: who has done
 * the week, each piece of it, who was late and by how much, when each person
 * was last reminded, the Remind panel, and the email Remind sends. One file,
 * so the page, the route and the tests say one thing.
 *
 * Never "mark", "grade" or "score" on anything a member reads; no pronoun for
 * a person; days as "Wed 18 Nov" and times in the house clock ("3pm"), in
 * London.
 */

const capitalise = (words: string) => (words ? words[0].toUpperCase() + words.slice(1) : words);

/** "Wed 18 Nov, 3pm". */
function dayClock(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/** "1 person", "2 people". */
export function peopleCountWords(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** "4 of 6 have done week 1", "1 of 1 has done week 1". */
export function haveDoneTitle(done: number, of: number, weekNumber: number): string {
  return `${done} of ${of} ${of === 1 ? "has" : "have"} done week ${weekNumber}`;
}

/** Each bucket's label, as the bars' legends and the chips say it: a person's own cell's words. */
export const BUCKET_LABEL: Record<Bucket, string> = {
  "done-on-time": DONE_ON_TIME,
  "done-late": DONE_LATE,
  done: DONE,
  started: STARTED,
  "not-started": NOT_STARTED,
  "joined-late": JOINED_LATE,
};

/** "Readings", "Reflection", "Written answer", a fill-in's own title ("My action plan"). */
export function pieceLabel(key: PieceKey, title = ""): string {
  switch (key) {
    case "readings":
      return "Readings";
    case "steps":
      return "Steps";
    case "reflection":
      return "Reflection";
    case "boxes":
      return title.trim() || "Boxes";
    case "written":
      return "Written answer";
  }
}

/** "Week 1": the bar of the whole week, and the table's column. */
export function weekLabel(weekNumber: number): string {
  return `Week ${weekNumber}`;
}

/** What done asks of the week, in a sentence: "Done means every reading ticked and the written answer sent." */
export function doneMeansWords(pieces: ReadonlyArray<{ key: PieceKey; title: string }>): string {
  const parts = pieces.map((piece) => {
    switch (piece.key) {
      case "readings":
        return "every reading ticked";
      case "steps":
        return "every step ticked";
      case "reflection":
        return "the reflection written";
      case "boxes":
        return `${yourWords(piece.title).replace(/^your /, "the ")} filled in`;
      case "written":
        return "the written answer sent";
    }
  });
  return parts.length > 0 ? `Done means ${namesAnd(parts)}.` : "";
}

/** What one piece of one person's week says in the table. */
export function pieceCellWords(piece: PieceState): string {
  if (piece.key === "readings" || piece.key === "steps") return `${piece.done} of ${piece.of}`;
  const done = piece.bucket === "done-on-time" || piece.bucket === "done-late" || piece.bucket === "done";
  if (piece.key === "written") {
    if (done) return piece.doneAt ? `Sent ${dayClock(piece.doneAt)}` : "Sent";
    if (piece.unsent) return "Started, not sent";
    return piece.bucket === "started" ? STARTED : NOT_STARTED;
  }
  if (done) return piece.doneAt ? `Written ${londonDayLabel(piece.doneAt)}` : "Written";
  if (piece.bucket === "started") return piece.savedAt ? `Started, saved ${londonDayLabel(piece.savedAt)}` : STARTED;
  return NOT_STARTED;
}

/** Under a piece or a week done after the session: "Late: 3 days after the session". */
export function lateDetail(lateMs: number | null): string | null {
  return lateMs !== null && lateMs > 0 ? lateAfterSessionWords(lateMs) : null;
}

/** A filter chip's label: "Everyone", "Week not done", "Reflection not done", "Late". */
export function filterLabel(filter: WorkFilterKey, pieceTitle = ""): string {
  if (filter === "everyone") return "Everyone";
  if (filter === "week") return "Week not done";
  if (filter === "late") return "Late";
  return `${pieceLabel(filter, pieceTitle)} not done`;
}

export const PERSON = "Person";
export const LAST_REMINDED = "Last reminded";
export const THIS_WEEKS_WORK_LABEL = "Who has done the week";

/** Nobody in the filter. */
export const NOBODY_HERE = "Nobody here.";

/** "Late in week 1". */
export function lateInWeekTitle(weekNumber: number): string {
  return `Late in week ${weekNumber}`;
}

/**
 * One line under a person in "Late in week 1": what was done after the
 * session and when the week became done. "Reflection and written answer done
 * Sat 7 Nov, 6:20pm", "Readings ticked Sat 7 Nov, 6:20pm", "Written answer
 * sent Sat 7 Nov, 6:20pm".
 */
export function lateLineWords(latePieces: ReadonlyArray<{ key: PieceKey; title: string }>, doneAt: Date | null): string {
  const when = doneAt ? ` ${dayClock(doneAt)}` : "";
  if (latePieces.length === 0) return `Week done${when}`;
  const names = latePieces.map((piece, index) => {
    const label = pieceLabel(piece.key, piece.title);
    return index === 0 ? label : label.toLowerCase();
  });
  const onlyTicks = latePieces.every((piece) => piece.key === "readings" || piece.key === "steps");
  const onlyAnswer = latePieces.length === 1 && latePieces[0].key === "written";
  const verb = onlyTicks ? "ticked" : onlyAnswer ? "sent" : "done";
  return `${namesAnd(names)} ${verb}${when}`;
}

/** Over the facilitators' own weeks, for the lead and admins: "Rahul Mehta, facilitator". */
export function facilitatorRowName(name: string): string {
  return `${name}, facilitator`;
}

/**
 * Under a facilitator's own week, for the programme's lead and admins only:
 * "Rahul’s own week 1: done late. Claudia and admins only." `leadFirstName`
 * is null when the programme has no lead.
 */
export function ownWeekLine(input: { firstName: string; weekNumber: number; text: string; leadFirstName: string | null }): string {
  const whose = input.firstName ? `${input.firstName}’s` : "Their";
  const readers = input.leadFirstName ? `${input.leadFirstName} and admins only.` : "Admins only.";
  return `${whose} own week ${input.weekNumber}: ${input.text.toLowerCase()}. ${readers}`;
}

/** The heading over the facilitators' own weeks, for the lead and admins. */
export const OWN_WORK_TITLE = "Facilitators’ own work";

/** Over the facilitators' own weeks, for the lead and admins: they are counted in no number on the card. */
export const OWN_WORK_APART = "A facilitator’s own work is counted apart, and only the programme’s lead and admins see it.";

// ---------------------------------------------------------------------------
// Last reminded
// ---------------------------------------------------------------------------

/** Which reminder it was, after its time: "1-day, automatic", "by Rahul". */
function howWords(last: LastReminded, long: boolean): string {
  if (last.how === "hand") return last.byName ? `by ${last.byName}` : "by hand";
  const which = last.how === "3-day" ? "3-day" : "1-day";
  return long ? `the ${which} reminder, automatic` : `${which}, automatic`;
}

/** The table's cell: "Tue 3 Nov, 3pm · 1-day, automatic", "Mon 9 Nov, 10:02am · by Rahul"; "" for never. */
export function lastRemindedCell(last: LastReminded | null): string {
  if (!last) return "";
  const at = new Date(last.at);
  if (Number.isNaN(at.getTime())) return "";
  return `${dayClock(at)} · ${howWords(last, false)}`;
}

/** The panel's line: "Last reminded Tue 3 Nov, 3pm: the 1-day reminder, automatic", or that nobody has. */
export function lastRemindedLine(last: LastReminded | null): string {
  if (!last) return "Not reminded yet";
  const at = new Date(last.at);
  if (Number.isNaN(at.getTime())) return "Not reminded yet";
  return `${LAST_REMINDED} ${dayClock(at)}: ${howWords(last, true)}`;
}

// ---------------------------------------------------------------------------
// The automatic reminders, as the card says what is true of them
// ---------------------------------------------------------------------------

/** What the card says of the reminders the site sends on its own before this week's session. */
export type AutomaticReminders =
  /** The job is switched off. */
  | { kind: "off" }
  /** The week's session has started: they stopped. */
  | { kind: "stopped" }
  /** No session to date. */
  | { kind: "undated" }
  /** On, before the session: each reminder went (to how many) or goes (when). */
  | {
      kind: "on";
      threeDay: { at: string | null; went: number };
      oneDay: { at: string | null; went: number };
    };

/** The card's line about the automatic reminders. */
export function automaticRemindersWords(facts: AutomaticReminders): string {
  switch (facts.kind) {
    case "off":
      return "The automatic reminders before a session are switched off, so nobody is reminded unless somebody presses Remind.";
    case "stopped":
      return "The automatic reminders stopped when the session started. Remind still reaches anybody whose week isn’t done.";
    case "undated":
      return "This week has no session to time the automatic reminders by.";
    case "on": {
      const one = (name: string, send: { at: string | null; went: number }) => {
        const at = send.at ? new Date(send.at) : null;
        if (send.went > 0) return at ? `the ${name} reminder went on ${dayClock(at)} to ${peopleCountWords(send.went)}` : `the ${name} reminder went to ${peopleCountWords(send.went)}`;
        return at ? `the ${name} reminder goes on ${dayClock(at)} to anybody not done` : "";
      };
      const parts = [one("3-day", facts.threeDay), one("1-day", facts.oneDay)].filter(Boolean);
      return parts.length > 0 ? `Automatic reminders: ${parts.join(", and ")}.` : "";
    }
  }
}

// ---------------------------------------------------------------------------
// Remind
// ---------------------------------------------------------------------------

/** The card's button: "Remind 4 people whose week isn’t done". */
export function remindAllWords(count: number): string {
  return `Remind ${peopleCountWords(count)} whose week isn’t done`;
}

/**
 * Under Remind, when somebody whose week isn't done has no Remind: "Not
 * reminded: Dev and Farah. Remind emails only people told their group before
 * the week’s session." Those are the two reasons a row of the card can have:
 * a place not told yet, or told after the session ("Joined late").
 */
export function remindLeavesOutWords(names: readonly string[]): string {
  return `Not reminded: ${namesAnd(names)}. Remind emails only people told their group before the week’s session.`;
}

/** A row's button: "Remind Daniel". */
export function remindOneWords(firstName: string): string {
  return `Remind ${firstName || "them"}`;
}

/** The panel's title: "Remind 2 people whose week 1 isn’t done", "Remind Daniel". */
export function remindPanelTitle(input: { count: number; weekNumber: number; onlyName: string | null }): string {
  if (input.onlyName !== null) return `Remind ${input.onlyName || "them"}`;
  return `Remind ${peopleCountWords(input.count)} whose week ${input.weekNumber} isn’t done`;
}

/** The panel's first line: "Their week 1 isn’t done. Nobody else is emailed." */
export function remindLede(input: { weekNumber: number; onlyName: string | null }): string {
  const whose = input.onlyName ? `${input.onlyName}’s` : "Their";
  return `${whose} week ${input.weekNumber} isn’t done. Nobody else is emailed.`;
}

/** Nobody to remind: everybody who can be reminded has done the week. */
export function nobodyToRemindWords(weekNumber: number): string {
  return `Nobody to remind: everybody who can be emailed has done week ${weekNumber}.`;
}

/** The warning before a press: "Daniel was reminded in the last day." */
export function recentWarningWords(names: readonly string[]): string {
  if (names.length === 0) return "";
  return `${namesAnd(names)} ${names.length === 1 ? "was" : "were"} reminded in the last day. Sending now emails ${names.length === 1 ? "them" : "them all"} again.`;
}

/** The send button: "Send to 2 people". */
export function sendToWords(count: number): string {
  return `Send to ${peopleCountWords(count)}`;
}

/** Remind's panel while it works out who it reaches. */
export const REMIND = "Remind";
export const SENDING = "Sending…";
export const PREVIEWING = "Working out who it reaches…";
export const CLOSE = "Close";

/** Over the email in the panel: "Notice, from Rahul and the AGI Strategy team". */
export function noticeFromWords(fromLine: string): string {
  return `Notice, from ${fromLine}`;
}

/** "Rahul and the AGI Strategy team": who a Remind is from. */
export function fromLineWords(presserFirstName: string, team: string): string {
  const whose = team.trim() ? `the ${team.trim()} team` : "the programme’s team";
  return presserFirstName.trim() ? `${presserFirstName.trim()} and ${whose}` : capitalise(whose);
}

/** The press's answer when the count on the button is out of date. */
export function remindCountChangedWords(count: number): string {
  return count === 0
    ? "That changed while the panel was open: nobody is left to remind. Nothing was sent."
    : `That changed while the panel was open: it would now email ${peopleCountWords(count)}. Check the list and send again.`;
}

/** What a press came to. */
export function remindSentWords(tally: { sent: number; justReminded: number; suppressed: number; failed: number; held: number }): string {
  const parts: string[] = [];
  if (tally.sent > 0) parts.push(`Emailed ${peopleCountWords(tally.sent)}.`);
  if (tally.justReminded > 0) {
    parts.push(`${capitalise(peopleCountWords(tally.justReminded))} ${tally.justReminded === 1 ? "was" : "were"} reminded a moment ago, so not emailed again.`);
  }
  if (tally.held > 0) parts.push(`${capitalise(peopleCountWords(tally.held))} held, because this copy of the site doesn’t email them.`);
  if (tally.suppressed > 0) parts.push(`${capitalise(peopleCountWords(tally.suppressed))} not emailed: do-not-email list.`);
  if (tally.failed > 0) parts.push(`${capitalise(peopleCountWords(tally.failed))} couldn’t be sent.`);
  return parts.length > 0 ? parts.join(" ") : "Nobody was emailed.";
}

/** The route's refusals. */
export const REMIND_REFUSAL = {
  body: "Say which week to remind people about.",
  week: "That isn’t a week of this group’s plan.",
  notBlocks: "That week’s work isn’t on the site, so there’s nothing to remind anybody about.",
  unpublished: "That week isn’t published yet, so there’s nothing to remind anybody about.",
  closed: "The programme has closed, so nothing can be added to its weeks and nobody is reminded.",
  gone: "That group isn’t running any more.",
  person:
    "That person can’t be reminded about this week: their week is done, we can’t email their address, or they aren’t somebody Remind reaches.",
  nobody: "Nobody is left to remind about this week.",
  overCap: "Too many people to email in one send. Nothing was sent.",
  count: "Say how many the button showed.",
} as const;

// ---------------------------------------------------------------------------
// What is still to do, in a sentence
// ---------------------------------------------------------------------------

/**
 * WHAT IS STILL TO DO OF ONE PERSON'S WEEK, as short phrases for Remind's
 * email ("one reading", "your reflection", "your written answer"), from the
 * very list the automatic reminders work out (`weekLeft`). A pack given out
 * that has not been given yet is nothing they can do, so it is left out.
 */
export function stillToDoItems(left: WeekLeft): string[] {
  const out: string[] = [];
  let reflections = 0;
  let answerEmpty = false;
  let overLimit: number | null = null;
  for (const item of left.items) {
    switch (item.kind) {
      case "readings":
        out.push(item.titles.length === 1 ? "one reading" : `${numberWords(item.titles.length)} readings`);
        break;
      case "steps":
        out.push(item.count === 1 ? "one step" : `${numberWords(item.count)} steps`);
        break;
      case "pack":
        if (item.picked) out.push(`your ${item.title}’s reading`);
        else if (item.byYou) out.push(`choosing your ${item.title}`);
        break;
      case "reflection":
        reflections += 1;
        break;
      case "boxes":
        out.push(yourWords(item.title));
        break;
      case "answer":
        answerEmpty = true;
        break;
      case "talk":
        out.push("getting ready for your talk");
        break;
      case "overLimit":
        overLimit = item.limit;
        break;
    }
  }
  if (reflections > 0) out.push(reflections === 1 ? "your reflection" : "your reflections");
  if (answerEmpty) out.push("your written answer");
  else if (overLimit !== null) out.push(`cutting your written answer to ${overLimit} words`);
  else if (left.notSent) out.push("sending your written answer");
  return out;
}

// ---------------------------------------------------------------------------
// The email
// ---------------------------------------------------------------------------

/** What Remind's email to one person is made from. */
export type HandReminderFacts = {
  weekNumber: number;
  /** "Group C", or "" with none. */
  groupName: string;
  /** Who pressed, by first name, or "" when the account gives none. */
  presserFirstName: string;
  /** The programme in a few words ("AGI Strategy"), for "the AGI Strategy team". */
  team: string;
  /**
   * Before the session the person is due at, or after it has started. A
   * week with no session to be due at is told as before one, with no time.
   */
  form: "before" | "after";
  /** That session's start, or null with none. */
  sessionAt: Date | null;
  /** That session was cancelled (the group keeping pace). */
  cancelled: boolean;
  /** What is left, as `stillToDoItems` says it. */
  stillToDo: string[];
  /** The week's page. */
  weekUrl: string;
};

/** "Week 1 isn’t done yet". */
export function handReminderSubject(weekNumber: number): string {
  return `Week ${weekNumber} isn’t done yet`;
}

/** After the session: what is added now shows as late. */
export const ADDED_NOW_SHOWS_LATE = "Anything you add now shows as late, with how late, to the people who read your work.";

/**
 * EVERY WORD OF REMIND'S EMAIL to one person. Before the session: "Rahul
 * asked us to remind you: your session is Wed 11 Nov, 3pm. Still to do: one
 * reading and your written answer." After it: "Group C met for week 1 on Wed
 * 4 Nov, and week 1 is still open. Still to do: your reflection and your
 * written answer." and that anything added now shows as late. A button to the
 * week's page, and who it is from. Never a meeting link. Why it reached them
 * is the notice line above the words.
 */
export function handReminderEmailWords(facts: HandReminderFacts, firstName: string): WeekEmailWords {
  const n = facts.weekNumber;
  const left = facts.stillToDo.length > 0 ? `Still to do: ${namesAnd(facts.stillToDo)}.` : `Still to do: the rest of week ${n}.`;
  const who = facts.presserFirstName.trim() || "The people running your group";
  const group = facts.groupName.trim() || "Your group";
  let lead: string;
  if (facts.form === "after" && facts.sessionAt) {
    lead = facts.cancelled
      ? `${group}’s week ${n} session, ${dayClock(facts.sessionAt)}, was cancelled, and week ${n} is still open. ${left}`
      : `${group} met for week ${n} on ${londonDayLabel(facts.sessionAt)}, and week ${n} is still open. ${left}`;
  } else if (facts.sessionAt) {
    lead = `${who} asked us to remind you: your session is ${dayClock(facts.sessionAt)}. ${left}`;
  } else {
    lead = `${who} asked us to remind you about week ${n}. ${left}`;
  }
  const paragraphs = [lead];
  if (facts.form === "after" && facts.sessionAt) paragraphs.push(ADDED_NOW_SHOWS_LATE);
  const name = firstName.replace(/\s+/g, " ").trim();
  return {
    subject: handReminderSubject(n),
    preheader: lead,
    greeting: name ? `Hi ${name},` : "",
    paragraphs,
    lists: [],
    button: `Finish week ${n}`,
    link: facts.weekUrl,
    after: [fromLineWords(facts.presserFirstName, facts.team)],
    feedback: null,
  };
}
