/**
 * THE WORDS OF "CAN YOU MAKE THIS TIME MOST WEEKS?": the card on a person's
 * programme page once Publish has told them their group, its two short
 * forms, the "Your group" email's section, the routes' refusals, the marks
 * staff read beside a person's name, and staff's "They meant some weeks".
 *
 * The question is Zach's (29 Oct 2026): a button to accept, and one to say
 * they can't make it, which asks why this time does not work and which other
 * times would, "so we can reassign them", with the society's address as the
 * other way to say it. On 5 Nov 2026 it gained a third answer, because people
 * who could not make ONE week said they could not make the time and were
 * read as somebody to move: "Most weeks, not all" lists the group's sessions
 * still to come, and each one ticked is recorded as excused on its register,
 * as the ticket's "Can't make it" records it. The question now says "most
 * weeks", so "No, I need a different time" is about the time and not about
 * a week. No board draws the card: its words are written in the boards'
 * voice and listed in the build notes for the boards' designers to confirm.
 *
 * Every answer KEEPS the person's place. None is leaving, and nothing here
 * says "give your place back".
 *
 * Every name, day, time and campus is a slot filled from a record. No dash of
 * either kind. Pure, importing only the campus's words and the society's
 * address, so the card in the browser, the routes on the server, the email
 * and the tests read the same sentences.
 */

import { CONTACT_EMAIL } from "@/content/socials";
import type { GroupCampus } from "../campus";
import { campusWhereWords } from "../campusWords";

/** The society's address, the other way to answer. */
export const ANSWER_BY_EMAIL_ADDRESS = CONTACT_EMAIL;

// ---------------------------------------------------------------------------
// The question and its three answers: the card, and the email's section
// ---------------------------------------------------------------------------

export const CARD_TITLE = "Can you make this time most weeks?";

/**
 * What the card asks about: "Group B meets Tuesdays, 6pm to 8pm, on Jubilee
 * campus.", "Group B meets Tuesdays, 6pm to 8pm, online.", or with no group
 * to name (an incubator's people are told of no group) "You meet Tuesdays,
 * 6pm to 8pm." `when` is `sessionWhenLabel`'s.
 */
export function meetsLine(groupName: string | null, when: string, campus: GroupCampus | null): string {
  const who = groupName ? `${groupName} meets` : "You meet";
  const time = when || "at the time you were sent";
  return campus ? `${who} ${time}, ${campusWhereWords(campus)}.` : `${who} ${time}.`;
}

/** The three answers, in this order on the card and in the email. */
export const ANSWER_YES = "Yes";
export const ANSWER_MOST_WEEKS = "Most weeks, not all";
export const ANSWER_CANT = "No, I need a different time";

/** Under the buttons, before anybody has answered. */
export const KEEP_YOUR_PLACE = "Either way, you keep your place.";

/** Once they have said yes. */
export const SAID_YES = "You’ve told us you can make it.";

/** Once they have said most weeks, not all. */
export const SAID_MOST_WEEKS = "You’ve told us you can make it most weeks.";

/**
 * Under that, the sessions still to come they told us they can't make:
 * "You can’t make Tue 17 Nov, so its register records you as excused. Your
 * facilitators see it there." Days as `londonDayLabel` writes them.
 */
export function missingLine(days: readonly string[]): string {
  if (days.length === 0) return "";
  const list = days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} or ${days[days.length - 1]}`;
  return days.length === 1
    ? `You can’t make ${list}, so its register records you as excused. Your facilitators see it there.`
    : `You can’t make ${list}, so their registers record you as excused. Your facilitators see them there.`;
}

/** Once they have said they need a different time. */
export const SAID_CANT =
  "You’ve told us you need a different time. You keep your place while we look at moving you to another group, and we’ll be in touch.";

/** Over what they wrote, once they have written why. */
export const YOU_WROTE = "What you told us";

export const CHANGE_ANSWER = "Change your answer";

// ---------------------------------------------------------------------------
// The short form behind "Most weeks, not all"
// ---------------------------------------------------------------------------

export const MOST_WEEKS_INTRO =
  "Tick the sessions you can’t make. Each one’s register records you as excused, and your facilitators see it there.";

/** One session to tick: "Week 3, Tue 17 Nov". */
export function sessionOptionWords(weekNumber: number, day: string): string {
  return day ? `Week ${weekNumber}, ${day}` : `Week ${weekNumber}`;
}

/** With nothing to tick: a group with no session still to come that has a day. */
export const NONE_TO_TICK =
  "Your group has no sessions coming up to tick. You can still send this, and tell us about a session later with Can’t make it on its ticket.";

/** Who reads it, said where it is ticked. */
export const MOST_WEEKS_WHO_READS =
  "The programme’s lead and our admins read your answer. Your facilitators see only the sessions you tick, on their register.";

// ---------------------------------------------------------------------------
// The short form behind "No, I need a different time"
// ---------------------------------------------------------------------------

export const FORM_INTRO =
  "You keep your place. Tell us why this time doesn’t work most weeks and when would, and we’ll look at moving you to another group.";

/** For somebody who only misses a week or two, which is the other answer. */
export const ODD_WEEK_NOTE = "Only missing the odd week? Choose Most weeks, not all instead.";

export const REASON_LABEL = "Why doesn’t this time work?";
export const REASON_HINT = "For example, a lecture or a shift at that time.";

export const ALTERNATIVES_LABEL = "Which other times would work?";
export const ALTERNATIVES_HINT = "Days and times, like Monday or Wednesday evenings.";

/** Who reads it, said where it is written. */
export const WHO_READS = "The programme’s lead and our admins read this. Your group and its facilitators don’t.";

/** Before the society's address, which the card and the email draw as a link. */
export const OR_EMAIL = "You can also email";

export const SEND = "Send";
export const SENDING = "Sending…";
export const CANCEL = "Cancel";

/** What the card says once an answer is saved. */
export function savedWords(kind: "yes" | "mostWeeks" | "cant"): string {
  if (kind === "yes") return "Thanks. You’ve told us you can make it.";
  if (kind === "mostWeeks") return "Thanks. You’ve told us you can make it most weeks.";
  return "Thanks. We’ll look at moving you, and you keep your place in the meantime.";
}

/** A save that did not reach the server. */
export const DIDNT_SAVE = "That didn’t save. Check your connection and try again.";

// ---------------------------------------------------------------------------
// The "Your group" email's section (`./emailSection.ts`)
// ---------------------------------------------------------------------------

/** What "No, I need a different time" leads to: another group, or, on an incubator's one weekly session, whatever can be done. */
export function moveWords(incubator: boolean): string {
  return incubator ? "we’ll see what we can do" : "we’ll do our best to move you to another group";
}

/** The sentences after the question, before the society's address. */
export function emailAskWords(incubator: boolean): string {
  return (
    "Tell us on your programme page. If you’ll miss the odd week, say which and we’ll record you as excused. " +
    `If you can’t make most weeks, say why and which other times would work, and ${moveWords(incubator)}. ` +
    "You keep your place either way."
  );
}

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const ANSWER_REFUSAL = {
  body: "Expected a JSON object body.",
  kind: "Choose one of the three answers.",
  group: "Say which group this answer is about.",
  reasonMissing: "Say why this time doesn’t work for you.",
  alternativesMissing: "Say which other times would work for you.",
  /** "Most weeks, not all" with no list of sessions: none is a list. */
  sessions: "Say which of your group’s sessions you can’t make, or none.",
  /** Nothing of a group to answer about here: no seat, a seat not told yet, not taking part, or the run gone. */
  notAsked: "There’s no group time for you to answer here.",
  /** Their group changed after the page was opened: the answer would be about a group they are not in. */
  moved: "Your group has changed since this page was opened. Reload the page to see your group now.",
  /** A facilitator who holds a place sits in the group they facilitate. */
  facilitating: `You facilitate this group, so its time is one to sort out with the programme’s lead. Email ${ANSWER_BY_EMAIL_ADDRESS}.`,
} as const;

/** "Keep why to 500 characters." */
export function tooLongWords(what: "reason" | "alternatives", max: number): string {
  return what === "reason" ? `Keep why to ${max} characters.` : `Keep the other times to ${max} characters.`;
}

/**
 * A session the form named that cannot be recorded or taken back, and why,
 * in the ticket's own words: "Tue 17 Nov: That session has already started,
 * so tell your facilitators yourself."
 */
export function sessionRefusalWords(day: string, why: string): string {
  return day ? `${day}: ${why}` : why;
}

// ---------------------------------------------------------------------------
// What staff read beside a person (the board's cards and the circles view):
// the programme's lead and admins only.
// ---------------------------------------------------------------------------

/** A card's mark for somebody who said they can make it. */
export const MARK_CAN_MAKE = "Can make it";
/** A card's mark for somebody who said they need a different time. */
export const MARK_CANT_MAKE = "Can’t make this time";

/**
 * A card's mark for somebody who said most weeks, not all: the weeks of the
 * sessions they can't make, "Misses week 3", "Misses weeks 3 and 5", or
 * with none named "Can make most weeks". A week's two sessions are one week.
 */
export function mostWeeksMark(weekNumbers: readonly number[]): string {
  const weeks = [...new Set(weekNumbers)].sort((a, b) => a - b);
  if (weeks.length === 0) return "Can make most weeks";
  if (weeks.length === 1) return `Misses week ${weeks[0]}`;
  return `Misses weeks ${weeks.slice(0, -1).join(", ")} and ${weeks[weeks.length - 1]}`;
}

/** The mark's accessible name: "Ana can’t make this time". */
export function markLabel(name: string, kind: "yes" | "mostWeeks" | "cant"): string {
  if (kind === "yes") return `${name} can make it`;
  if (kind === "mostWeeks") return `${name} can make it most weeks`;
  return `${name} can’t make this time`;
}

/**
 * The fold under a "Can’t make this time" mark, on the board and in Circles,
 * and under a most weeks answer that kept what they wrote: "Why", then
 * "Would work".
 */
export const CANT_DETAILS = "Why, and what would work";
export const WHY = "Why";
export const WOULD_WORK = "Would work";

// ---------------------------------------------------------------------------
// "They meant some weeks": staff reading an answer of No, I need a different
// time as Most weeks, not all (`./someWeeks.ts`), for an admin or the
// programme's lead, where that answer shows.
// ---------------------------------------------------------------------------

/** The button under a can't's fold. */
export const SOME_WEEKS = "They meant some weeks";

export const SOME_WEEKS_INTRO =
  "Choose the sessions they can’t make. Their answer becomes Most weeks, not all, their words stay here, and each session you choose records them as excused on its register. Nobody is emailed.";

/** While the group's sessions are read. */
export const SOME_WEEKS_LOADING = "Reading their group’s sessions…";

/** A read of them that did not come back. */
export const SOME_WEEKS_DIDNT_LOAD = "Their group’s sessions didn’t load. Check your connection and try again.";

/** With no session still to come: the week they meant may be over. */
export const SOME_WEEKS_NONE =
  "Their group has no sessions coming up. Saving still changes their answer to Most weeks, not all.";

/** Beside a session they already told us about themselves. */
export const ALREADY_EXCUSED = "Already excused, on their own word";

export const SAVE = "Save";
export const SAVING = "Saving…";

/** What the route answers once saved. */
export const SOME_WEEKS_SAVED = "Saved. Their answer is now Most weeks, not all.";

/**
 * The audit row's sentence: what changed, and which sessions this recorded
 * (not the ones the person had already told us about themselves), never the
 * person's words. "Changed from No, I need a different time to Most weeks,
 * not all, recording them excused for week 3 (Tue 17 Nov)."
 */
export function someWeeksAuditDetail(recorded: readonly { weekNumber: number; day: string }[]): string {
  const from = `Changed from ${ANSWER_CANT} to ${ANSWER_MOST_WEEKS}`;
  if (recorded.length === 0) return `${from}, recording no session.`;
  const each = recorded.map(({ weekNumber, day }) => (day ? `week ${weekNumber} (${day})` : `week ${weekNumber}`));
  const list = each.length === 1 ? each[0] : `${each.slice(0, -1).join(", ")} and ${each[each.length - 1]}`;
  return `${from}, recording them excused for ${list}.`;
}

export const SOME_WEEKS_REFUSAL = {
  body: "Expected a JSON object body.",
  sessions: "Say which of their group’s sessions they can’t make, or none.",
  /** Neither an admin nor the lead of the programme that names the run. */
  notStaff: "Only an admin or the programme’s lead can change somebody’s answer.",
  noRun: "That run isn’t there.",
  /** No seat on the run in a live group, or the person is no longer taking part. */
  noSeat: "They aren’t in a group on this run any more.",
  /** Their answer is not No, I need a different time about the group they are in now. */
  notCant: "Their answer has changed since this page was opened. Reload the page to see it now.",
  noSession: "That isn’t one of their group’s sessions.",
  started: "That session has already started.",
  cancelled: "That session isn’t happening.",
  finished: "That session’s register is already finished.",
  notHeld: "Their facilitators have said that session didn’t happen.",
  marked: "Their facilitators have already filled in that session’s register for them.",
  full: "That session’s register is full.",
  failed: "That didn’t save. Try again.",
} as const;
