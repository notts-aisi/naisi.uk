import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { dayWords, hoursWords, namesWords, weeksWords } from "@/lib/courses/sessionChange/words";
import { approvedByWords, youAskedWords } from "./words";

/**
 * THE WORDS SOMEBODY TAKING PART READS ABOUT BEING EXCUSED, on their own
 * programme page: the way in from their session's card, the short flow that
 * asks, the card in each state afterwards, and the list of their own
 * requests. One file for the one surface, so the page and its tests read the
 * same sentences.
 *
 * NEVER A COUNT and never an allowance: nothing here adds weeks up. A reason
 * appears only as the person's own words on their own card. Times go through
 * the house clock (`londonLabels`). No dash of either kind, and never "mark".
 * Pure, with no server import, so the browser draws the same words.
 */

// ---------------------------------------------------------------------------
// The way in, and the first step
// ---------------------------------------------------------------------------

/** "Can’t make Wed 11 Nov?": the sheet's heading. */
export function cantMakeDayWords(day: string): string {
  return day ? `Can’t make ${day}?` : "Can’t make it?";
}

export const CLOSE = "Close";

/**
 * Over today's "Joining online", in the sheet, where the session is held in a
 * room: "Try joining online first. You stay in Group C." Going to another
 * group's session that week will be offered here too, once one-week visits
 * exist.
 */
export function joinOnlineFirstWords(groupName: string): string {
  const group = groupName.trim();
  return group ? `Try joining online first. You stay in ${group}.` : "Try joining online first. You stay in your group.";
}

/** Under the first step, and under the request's heading. */
export const AN_ADMIN_DECIDES = "An admin decides, usually the same day.";

// ---------------------------------------------------------------------------
// Asking, before the session
// ---------------------------------------------------------------------------

/** "Week 2", or "Week 2, session 2". */
function weekName(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `Week ${weekNumber}, session ${occurrence}` : `Week ${weekNumber}`;
}

/** "From Group C’s week 2 session, Wed 11 Nov, 3pm. An admin decides, usually the same day." */
export function askFromWords(input: { groupName: string; weekNumber: number; occurrence: number; when: string }): string {
  const group = input.groupName.trim() || "your group";
  const session = input.occurrence > 1 ? `week ${input.weekNumber}’s session ${input.occurrence}` : `week ${input.weekNumber} session`;
  return `From ${group}’s ${session}${input.when ? `, ${input.when}` : ""}. ${AN_ADMIN_DECIDES}`;
}

export const WEEKS_THIS_COVERS = "Weeks this covers";
export const SHOW_LATER_WEEKS = "Show later weeks";

/** How many weeks the list shows before "Show later weeks". */
export const WEEKS_SHOWN_FIRST = 3;

/** "Week 2 · Wed 11 Nov", one choice in the list. */
export function weekChoiceWords(weekNumber: number, occurrence: number, dateKey: string): string {
  const day = dayWords(dateKey);
  return day ? `${weekName(weekNumber, occurrence)} · ${day}` : weekName(weekNumber, occurrence);
}

export const WHAT_WILL_HAPPEN = "What will happen";

/** One row of "What will happen". */
export type HappenRow = { label: string; text: string };

/** "Rahul sees", "Rahul and Sofia see", "Your facilitators see". */
function seesLabel(names: readonly string[]): string {
  const named = names.map((name) => name.trim()).filter(Boolean);
  if (named.length === 0) return "Your facilitators see";
  return `${namesWords(named)} ${named.length === 1 ? "sees" : "see"}`;
}

/** Who reads the reason, said plainly, and how long it is kept: the privacy policy's promise. */
export const WHO_READS_THE_REASON = "Only admins read it, and it’s deleted when your programme closes.";

/**
 * "What will happen" for the weeks ticked, as the request's page says it
 * before it is sent: one week, or several decided week by week.
 */
export function happenRows(input: { weekNumbers: readonly number[]; facilitatorFirstNames: readonly string[] }): HappenRow[] {
  const named = input.facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  const weeks = [...new Set(input.weekNumbers)].sort((a, b) => a - b);
  const sees: HappenRow = { label: seesLabel(named), text: "That you’ve asked, then Excused if it’s approved. Never your reason." };
  const reason: HappenRow = { label: "Your reason", text: WHO_READS_THE_REASON };
  if (weeks.length <= 1) {
    const week = weeks[0] ?? 0;
    return [
      sees,
      { label: "Your work", text: `${week ? `Week ${week}’s work` : "That week’s work"} is still due by your session, and its reminders still come.` },
      {
        label: "If approved",
        text: `The register says Excused by itself. ${named.length > 0 ? `You and ${namesWords(named)} get an email.` : "You get an email."}`,
      },
      reason,
    ];
  }
  const label = weeksWords(weeks);
  return [
    { label: "Decided", text: "Week by week: you might hear yes for one and not the other." },
    sees,
    { label: "Your work", text: `${label.charAt(0).toUpperCase()}${label.slice(1)} are still due by your sessions, with their reminders.` },
    reason,
  ];
}

/** "Send the request", or "Send the request for 2 weeks". */
export { sendTheRequestWords, NO_MEDICAL_DETAILS, WHY_A_LINE, ASK_TO_BE_EXCUSED, WITHDRAW_THE_REQUEST } from "./words";

export const SENDING = "Sending…";

/** Said once the request is sent: nobody is emailed until it is decided. */
export const SENT = "Sent. Nobody is emailed until an admin decides, and then you get an email.";

/** A press that never reached the server, or an answer with no sentence of its own. */
export const DIDNT_SEND = "That didn’t send. Try again.";

/** Nothing ticked: the press is held back with the route's own sentence. */
export const CHOOSE_A_WEEK = "Choose the weeks you can’t make.";

// ---------------------------------------------------------------------------
// Asking, after the session
// ---------------------------------------------------------------------------

/** "Last session · week 2": over the card of a session that has ended. */
export function lastSessionWords(weekNumber: number, occurrence = 1): string {
  return `Last session · ${occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`}`;
}

/** "Your session · week 3": over the card of a session under way. */
export function yourSessionWords(weekNumber: number, occurrence = 1): string {
  return `Your session · ${occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`}`;
}

export const MISSED_IT = "Missed it for a reason? You can ask to be excused after a session, for example if you were ill.";

/** "Ask to be excused for week 2". */
export function askForWeekWords(weekNumber: number, occurrence = 1): string {
  return `Ask to be excused for ${occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`}`;
}

/** "An admin decides. If it’s approved, the register changes from Absent to Excused, and Josh is told." */
export function afterSessionWords(facilitatorFirstNames: readonly string[]): string {
  const named = facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  const told = named.length === 0 ? "your facilitators are told" : `${namesWords(named)} ${named.length === 1 ? "is" : "are"} told`;
  return `An admin decides. If it’s approved, the register changes from Absent to Excused, and ${told}.`;
}

/** "Tue 10 Nov, 4pm to 6pm", the session's own day and hours. */
export function sessionDayAndHours(dateKey: string, startTimeLocal: string, durationMinutes: number): string {
  const day = dayWords(dateKey);
  const hours = startTimeLocal ? hoursWords(startTimeLocal, durationMinutes) : "";
  return [day, hours].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// The card afterwards, one state at a time
// ---------------------------------------------------------------------------

export const ASKED_TO_BE_EXCUSED = "Asked to be excused";
export const EXCUSED = "Excused";
export const NOT_EXCUSED = "Not excused";
export const ABSENT = "Absent";

/** Waiting, before the session: "Waiting for an admin, usually today. Rahul sees only that you’ve asked." */
export function waitingWords(facilitatorFirstNames: readonly string[]): string {
  const named = facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  const who = named.length === 0 ? "Your facilitators see" : `${namesWords(named)} ${named.length === 1 ? "sees" : "see"}`;
  return `Waiting for an admin, usually today. ${who} only that you’ve asked.`;
}

export const CAN_WITHDRAW = "You can withdraw it until it’s decided.";

/** "Started at 3pm": the session under way. */
export function startedAtWords(startsAt: Date): string {
  return `Started at ${londonClockLabel(startsAt)}`;
}

/** Still waiting once the session has started. */
export const STILL_WAITING = "Your request to be excused is still waiting. You’ll hear today.";

/** "You asked at 2:50pm: “My lab is running over.”", their own words back to them. */
export function youAskedWithReasonWords(askedAt: Date, now: Date, reason: string): string {
  const said = youAskedWords(askedAt, now);
  return reason.trim() ? `${said}: “${reason.trim()}”` : `${said}.`;
}

/** "Approved by Zach on Mon 9 Nov, 11:15am: “Hope the appointment goes well.”" */
export function approvedLineWords(firstName: string, at: Date, reply: string): string {
  const said = approvedByWords(firstName, at);
  return reply.trim() ? `${said}: “${reply.trim()}”` : `${said}.`;
}

/** Approved, but the finished register says Absent: what it says, and what they can do. */
export const APPROVED_BUT_ABSENT =
  "Your request to be excused was approved, but the finished register says Absent for this session. If that’s wrong, ask an admin to correct it.";

/** Approved, and they came after all: the facilitator's entry stands. */
export const CAME_AFTER_ALL = "You came after all, so your register shows you there. Being excused stays on your request; nothing else changes.";

/** "Not excused for week 3. Zach: “Thanks for telling us.”" */
export function declinedLineWords(weekNumber: number, occurrence: number, firstName: string, reply: string): string {
  const week = occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`;
  const who = firstName.trim() || "An admin";
  return reply.trim() ? `Not excused for ${week}. ${who}: “${reply.trim()}”` : `Not excused for ${week}.`;
}

/** Under a declined week's register line. */
export const WHAT_THE_REGISTER_SAYS = "What the register says for this session.";

/** "Week 3 · Wed 18 Nov". */
export function weekAndDayWords(weekNumber: number, occurrence: number, dateKey: string): string {
  return weekChoiceWords(weekNumber, occurrence, dateKey);
}

/** "You withdrew your request to be excused at 11:20am.", "… on Tue 10 Nov at 11:20am." */
export function withdrewWords(at: Date, now: Date): string {
  return londonDayLabel(at) === londonDayLabel(now)
    ? `You withdrew your request to be excused at ${londonClockLabel(at)}.`
    : `You withdrew your request to be excused on ${londonDayLabel(at)} at ${londonClockLabel(at)}.`;
}

/** Said once a withdraw has saved. */
export const WITHDRAWN = "Withdrawn. Nobody was emailed.";

export const WITHDRAWING = "Withdrawing…";

// ---------------------------------------------------------------------------
// Their own requests
// ---------------------------------------------------------------------------

export const YOUR_REQUESTS = "Your requests";

/** "Excused for week 2": one week of a request, as the list names it. */
export function excusedForWords(weekNumber: number, occurrence = 1): string {
  return `Excused for ${occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`}`;
}

export type OwnWeekState = "waiting" | "approved" | "declined" | "withdrawn";

export const OWN_STATE_WORDS: Record<OwnWeekState, string> = {
  waiting: "Waiting",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

/** "Approved by Zach, Tue 10 Nov, 1:40pm", "Withdrawn by you, 11:20am": the row's line. */
export function ownRowLineWords(input: {
  state: OwnWeekState;
  by: string;
  at: Date | null;
  askedAt: Date | null;
  now: Date;
}): string {
  const { state, at, now } = input;
  const who = input.by.trim() || "an admin";
  if (state === "waiting") return input.askedAt ? youAskedWords(input.askedAt, now) : "Waiting for an admin";
  if (!at) return OWN_STATE_WORDS[state];
  const when = londonDayLabel(at) === londonDayLabel(now) ? londonClockLabel(at) : `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
  if (state === "withdrawn") return `Withdrawn by you, ${when}`;
  return `${state === "approved" ? "Approved" : "Declined"} by ${who}, ${when}`;
}
