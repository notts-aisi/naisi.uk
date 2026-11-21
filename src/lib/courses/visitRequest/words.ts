import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { sessionWhenWords, type ExcusedEmailWords } from "../excused/words";
import { dayWords } from "../sessionChange/words";

/**
 * ASKING TO GO TO ANOTHER GROUP'S SESSION FOR ONE WEEK: every sentence the
 * person, the admins who decide it and its emails say, in one file, so the
 * pages, the routes and their tests read the same words.
 *
 * The person's words are the approved ones, word for word; where a fact is
 * missing, a sentence changes only by leaving that fact out. Names are first
 * names on the person's own page, as everywhere there. "An admin decides."
 * and never a promise about how soon. Times go through the house clock
 * (`londonLabels`, `dayWords`). No dash of either kind. Pure, with no server
 * import, so the browser draws the same words.
 */

function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function groupName(name: string | null | undefined): string {
  return line(name) || "another group";
}

function possessive(name: string): string {
  return `${line(name)}’s`;
}

/** "Tue 10 Nov, 1:40pm": always the day and the time. */
function dayAndClock(at: Date): string {
  return `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

// ---------------------------------------------------------------------------
// The way in, on the card
// ---------------------------------------------------------------------------

/** The card's button. */
export const GO_TO_ANOTHER_SESSION = "Go to another session this week";

// ---------------------------------------------------------------------------
// The form's page
// ---------------------------------------------------------------------------

export const ANOTHER_SESSION_TITLE = "Another session this week";

/** "You stay in Group C. An admin approves it. Week 2’s work is due at the session you go to." */
export function introWords(homeName: string, weekNumber: number): string {
  return `You stay in ${groupName(homeName)}. An admin approves it. Week ${weekNumber}’s work is due at the session you go to.`;
}

/** "Group sessions in week 2". */
export function sessionsLegendWords(weekNumber: number): string {
  return `Group sessions in week ${weekNumber}`;
}

export const ANYTHING_TO_ADD = "Anything to add (optional)";
export const ONE_AT_A_TIME = "One request at a time. You can withdraw it until it’s decided.";

/** Said once the request is sent. */
export const SENT_DECIDED = "Sent. You’ll get an email when it’s decided.";

/** The form, and the ask route, refusing. */
export const ASK_REFUSAL = {
  body: "Expected a JSON object body.",
  chooseFirst: "Choose a session first.",
  noneWithAPlace: "No other session has a place this week.",
  justFilled: "That session has just filled up. Choose another.",
  alreadyWaiting: "You already have a request waiting. Withdraw it to send another.",
  /** Every ask somebody cannot make this week: no place, no week, a visit already standing, their session started. */
  nothingToAsk: "There’s no session this week you can ask to swap now.",
  /** A session the form no longer offers: called off, started, or no longer one of the week's. */
  notOffered: "That session can’t be chosen now. Choose another.",
  reasonText: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason.",
} as const;

// ---------------------------------------------------------------------------
// The card while it waits, and after
// ---------------------------------------------------------------------------

export const WAITING = "Waiting";

/** "Sent today, 1:05pm", or "Sent Tue 10 Nov, 1:05pm" another day. */
export function sentWhenWords(at: Date, now: Date): string {
  return londonDayLabel(at) === londonDayLabel(now) ? `Sent today, ${londonClockLabel(at)}` : `Sent ${dayAndClock(at)}`;
}

/** "You asked to go to Group I’s session on Wed 11 Nov, 6pm. An admin decides." The session as it is now. */
export function askedLineWords(hostName: string, host: { dateKey: string; startTimeLocal: string }): string {
  const when = sessionWhenWords(host.dateKey, host.startTimeLocal);
  return `You asked to go to ${possessive(groupName(hostName))} session${when ? ` on ${when}` : ""}. An admin decides.`;
}

/** A reply sent without deciding, on the card and under the row: "Zach: “Is Thursday any better?”" */
export function replyLineWords(firstName: string, text: string): string {
  return `${line(firstName) || "An admin"}: “${line(text)}”`;
}

/** The host session called off or marked not held while it waits. */
export function cantGoAheadWords(hostName: string, hostDateKey: string): string {
  const day = dayWords(hostDateKey);
  return `${possessive(groupName(hostName))} session${day ? ` on ${day}` : ""} isn’t happening, so this request can’t go ahead. Withdraw it, or choose another session.`;
}

/** After withdrawing: "You withdrew your request to go to Group I." */
export function withdrewWords(hostName: string): string {
  return `You withdrew your request to go to ${groupName(hostName)}.`;
}

/** The withdraw route, refusing. */
export const WITHDRAW_REFUSAL = {
  decided: "It’s already been decided, so it can’t be withdrawn now.",
  closed: "That request has closed, so it can’t be withdrawn now.",
  notYours: "That request isn’t yours to withdraw.",
} as const;

/** At the top: "Your request to go to Group I on Wed 11 Nov wasn’t approved. Zach: “…”" */
export function declinedMessageWords(input: { hostName: string; hostDateKey: string; deciderFirstName: string; reply: string }): string {
  const day = dayWords(input.hostDateKey);
  const head = `Your request to go to ${groupName(input.hostName)}${day ? ` on ${day}` : ""} wasn’t approved.`;
  return line(input.reply) ? `${head} ${replyLineWords(input.deciderFirstName, input.reply)}` : head;
}

export const DISMISS = "Dismiss";
export const NOTHING_TO_DISMISS = "There’s nothing to dismiss.";

/** On the visiting card: "Approved by Zach, Tue 10 Nov, 1:40pm: “Approved. Enjoy Group I.”", or with no reply, "… 1:40pm." */
export function approvedByWords(firstName: string, at: Date, reply: string): string {
  const said = `Approved by ${line(firstName) || "an admin"}, ${dayAndClock(at)}`;
  return line(reply) ? `${said}: “${line(reply)}”` : `${said}.`;
}

// ---------------------------------------------------------------------------
// "Your requests"
// ---------------------------------------------------------------------------

/** One row's title: "Group I for week 2". */
export function rowTitleWords(hostName: string, weekNumber: number): string {
  return `${groupName(hostName)} for week ${weekNumber}`;
}

export type OwnVisitRowState = "waiting" | "approved" | "declined" | "withdrawn" | "closed";

export const ROW_CHIP: Record<OwnVisitRowState, string> = {
  waiting: "Waiting",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

/**
 * The row's line: "Sent Tue 10 Nov, 1:05pm", "Approved by Zach, Tue 10 Nov,
 * 1:40pm", "Declined by Zach, Tue 10 Nov, 1:40pm", "Withdrawn by you,
 * 11:20am" (the day added another day), "Not decided before Wed 11 Nov, 6pm".
 */
export function rowLineWords(input: {
  state: OwnVisitRowState;
  by: string;
  at: Date | null;
  askedAt: Date | null;
  now: Date;
  /** For a request closed by itself: when the earlier session started. */
  lapse: { dateKey: string; startTimeLocal: string } | null;
}): string {
  const who = line(input.by) || "an admin";
  switch (input.state) {
    case "waiting":
      return input.askedAt ? `Sent ${dayAndClock(input.askedAt)}` : ROW_CHIP.waiting;
    case "closed": {
      const when = input.lapse ? sessionWhenWords(input.lapse.dateKey, input.lapse.startTimeLocal) : "";
      return when ? `Not decided before ${when}` : "Not decided in time";
    }
    case "withdrawn":
      if (!input.at) return ROW_CHIP.withdrawn;
      return londonDayLabel(input.at) === londonDayLabel(input.now)
        ? `Withdrawn by you, ${londonClockLabel(input.at)}`
        : `Withdrawn by you, ${dayAndClock(input.at)}`;
    default:
      if (!input.at) return ROW_CHIP[input.state];
      return `${input.state === "approved" ? "Approved" : "Declined"} by ${who}, ${dayAndClock(input.at)}`;
  }
}

// ---------------------------------------------------------------------------
// Staff: the Requests page and one request's page
// ---------------------------------------------------------------------------

export const MOVES_AND_VISITS = "Moves and visits";
export const ONE_WEEK_AT_ANOTHER_SESSION = "One week at another session";

/** "Group C to Group I, Wed 11 Nov". */
export function rowAboutWords(homeName: string, hostName: string, hostDateKey: string): string {
  const day = dayWords(hostDateKey);
  return `${line(homeName) || "Their group"} to ${groupName(hostName)}${day ? `, ${day}` : ""}`;
}

/** "Daniel Kim: one week at another session". */
export function requestTitleWords(name: string): string {
  return `${line(name) || "NAISI member"}: one week at another session`;
}

/** A decided row: "Approved by Zach Levin, Tue 10 Nov, 1:40pm". `when` is the day and time already said. */
export function decidedRowWords(state: "approved" | "declined", byName: string, when: string): string {
  const said = `${state === "approved" ? "Approved" : "Declined"} by ${line(byName) || "an admin"}`;
  return when ? `${said}, ${when}` : said;
}

export const ASKS_FOR = "Asks for";
export const HANDLING = "Handling";
export const DECLINE_AND_SEND_THE_REPLY = "Decline and send the reply";

/** "Group I’s session has moved to Fri 13 Nov, 6pm since Daniel asked." */
export function movedSinceWords(hostName: string, now: { dateKey: string; startTimeLocal: string }, firstName: string): string {
  const when = sessionWhenWords(now.dateKey, now.startTimeLocal);
  return `${possessive(groupName(hostName))} session has moved${when ? ` to ${when}` : ""} since ${line(firstName) || "they"} asked.`;
}

/** A request nobody decided before the earlier session started, on its page and from the routes. */
export function closedStaffWords(lapse: { dateKey: string; startTimeLocal: string } | null): string {
  const when = lapse ? sessionWhenWords(lapse.dateKey, lapse.startTimeLocal) : "";
  return `Nobody decided this before ${when || "the session"}, so it closed by itself. Nobody was emailed.`;
}

/** A request whose person no longer holds that place that week (taken off the run, left, or moved for good). */
export function goneStaffWords(firstName: string): string {
  return `${line(firstName) || "They"} no longer ${line(firstName) ? "holds" : "hold"} that place that week, so this request closed by itself. Nobody was emailed.`;
}

/** The decide routes, refusing a request that has left waiting. */
export function notWaitingWords(status: "approved" | "declined" | "withdrawn"): string {
  return status === "withdrawn" ? "This request was withdrawn." : "This request has been decided already.";
}

/** Under the list, for an admin: who reads these, and who is emailed. */
export const VISITS_WHO_SEES =
  "Requests to go to another session are for admins only. Asking emails the admins unless they switch it off above. Approving emails the person and both groups’ facilitators; declining or replying emails the person.";

/** One line of the request's history. */
export function historyWords(what: string, by: string, personFirstName: string): string {
  const who = by.trim().split(/\s+/)[0] || "Somebody";
  switch (what) {
    case "asked":
      return `${line(personFirstName) || who} sent this`;
    case "withdrawn":
      return `${line(personFirstName) || who} withdrew it`;
    case "dismissed":
      return `${line(personFirstName) || who} dismissed the reply`;
    case "taken":
      return `${who} took it`;
    case "approved":
      return `${who} approved it`;
    case "declined":
      return `${who} declined it`;
    default:
      return `${who} replied`;
  }
}

/** What a reply or a decline did, from the route's answer: "Declined. Emailed Daniel.", "Replied. Nobody was emailed." */
export function saidWords(action: "decline" | "reply", firstName: string, sent: boolean): string {
  const head = action === "decline" ? "Declined." : "Replied.";
  return sent ? `${head} Emailed ${line(firstName) || "the person"}.` : `${head} Nobody was emailed.`;
}

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

/**
 * To each admin who decides requests and has not switched it off: "Daniel Kim
 * asked to go to Group I’s session for week 2". Never the person's own words.
 */
export function newVisitRequestEmailWords(input: {
  personName: string;
  hostName: string;
  homeName: string;
  weekNumber: number;
  host: { dateKey: string; startTimeLocal: string };
  askedAt: Date;
}): ExcusedEmailWords {
  const person = line(input.personName) || "Somebody";
  const host = groupName(input.hostName);
  const when = sessionWhenWords(input.host.dateKey, input.host.startTimeLocal);
  return {
    subject: `${person} asked to go to ${possessive(host)} session for week ${input.weekNumber}`,
    before: [
      `${person} asked on ${londonDayLabel(input.askedAt)} at ${londonClockLabel(input.askedAt)} to go to ${possessive(host)} week ${input.weekNumber} session${when ? ` (${when})` : ""} instead of ${possessive(line(input.homeName) || "their own group")}.`,
    ],
    quote: null,
    after: [],
    button: "Open the request",
    footnote: "You get this because you decide requests. You can switch it off on the Requests page.",
  };
}

/** "About your request for week 2": declined, to the person, with the reply. */
export function declinedEmailWords(input: {
  weekNumber: number;
  hostName: string;
  homeName: string;
  deciderFirstName: string;
  reply: string;
  /** Their own group's session that week, or null with none. */
  own: { dateKey: string; startTimeLocal: string } | null;
  /** Excused from their own group's session that week: the "as usual" sentence is untrue there, and left out. */
  excusedAtHome: boolean;
}): ExcusedEmailWords {
  const decider = line(input.deciderFirstName) || "An admin";
  const own = input.own ? sessionWhenWords(input.own.dateKey, input.own.startTimeLocal) : "";
  const home = line(input.homeName) || "your group";
  return {
    subject: `About your request for week ${input.weekNumber}`,
    before: [`Your request to go to ${possessive(groupName(input.hostName))} session for week ${input.weekNumber} wasn’t approved.`],
    quote: line(input.reply) ? `${decider} says: “${line(input.reply)}”` : null,
    after: input.excusedAtHome ? [] : [own ? `You’re with ${home} as usual on ${own}.` : `You’re with ${home} as usual.`],
    button: "Open your programme page",
    footnote: null,
  };
}

/** A reply without deciding, to the person: the reply email of requests to be excused, with the request named. */
export function replyEmailWords(input: { weekNumber: number; hostName: string; deciderFirstName: string; reply: string }): ExcusedEmailWords {
  const decider = line(input.deciderFirstName) || "An admin";
  return {
    subject: `About your request for week ${input.weekNumber}`,
    before: [`${decider} replied to your request to go to ${possessive(groupName(input.hostName))} session for week ${input.weekNumber}.`],
    quote: `${decider} says: “${line(input.reply)}”`,
    after: ["It’s still waiting for a decision. You’ll get an email when it’s decided."],
    button: "Open your programme page",
    footnote: null,
  };
}

/** The approved email's first sentence and the quoted reply, which a visit staff arranged leaves out. */
export function approvedPersonEmailParts(deciderFirstName: string, reply: string): { first: string; quote: string | null } {
  const decider = line(deciderFirstName) || "An admin";
  return { first: "Your request is approved.", quote: line(reply) ? `${decider} says: “${line(reply)}”` : null };
}
