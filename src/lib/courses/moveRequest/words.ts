import { londonClockLabel, londonDayLabel, sessionWhenLabel } from "../londonLabels";
import type { ExcusedEmailWords } from "../excused/words";
import { couldBeFollowed } from "../followable";

/**
 * ASKING TO CHANGE GROUP FOR THE REST OF THE PROGRAMME: every sentence the
 * person, the admins who decide it and its emails say that is its own, in one
 * file, so the pages, the routes and their tests read the same words. Words
 * a request to go to another session already says the same way (Waiting,
 * "Sent today, 1:05pm", the row lines, Dismiss, the refusals of the reason
 * and of a withdraw) are that kind's (`../visitRequest/words.ts`) and are not
 * repeated here.
 *
 * The person's words are the approved ones, word for word; where a fact is
 * missing, a sentence changes only by leaving that fact out. First names on
 * the person's own page. "An admin decides." and never a promise about how
 * soon. Times go through the house clock (`londonLabels`). No dash of either
 * kind. Pure, with no server import, so the browser draws the same words.
 */

function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function groupName(name: string | null | undefined): string {
  return line(name) || "another group";
}

/** "Leo", "Leo and Ana", "Leo, Ana and Raj". */
function andList(items: readonly string[]): string {
  const clean = items.map(line).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

// ---------------------------------------------------------------------------
// The ways in: the button on the programme page's card, and the foot of the one-week form
// ---------------------------------------------------------------------------

export const CHANGE_GROUP_FOR_GOOD = "Change group for good";

/** At the foot of the one-week form, before the link "Change group for good". */
export const NEED_A_DIFFERENT_GROUP = "Need a different group every week?";

// ---------------------------------------------------------------------------
// The form's page
// ---------------------------------------------------------------------------

export const CHANGE_GROUP_INTRO = "From the next week whose session hasn’t happened. An admin decides. Your work, its feedback and your attendance come with you.";
export const GROUPS_WITH_A_PLACE = "Groups with a place";
export const WHY_NEEDED = "Why (needed)";

/** One group offered: "Group I · Wednesdays, 6pm to 8pm", from its usual time. */
export function groupChoiceTitleWords(name: string, session: { weekday: number; startTimeLocal: string; durationMinutes: number }): string {
  const when = sessionWhenLabel(session);
  return when ? `${groupName(name)} · ${when}` : groupName(name);
}

/** Its line under it: "University Park · Monica Partridge C12 · Lucy · 1 place left", each part left out when missing. */
export function groupChoiceDetailWords(input: { campus: string; room: string; facilitatorFirstNames: readonly string[]; placesLeft: number | null }): string {
  const room = line(input.room);
  const parts = [line(input.campus), room && !couldBeFollowed(room) ? room : "", andList(input.facilitatorFirstNames)].filter(Boolean);
  if (input.placesLeft !== null) parts.push(input.placesLeft === 1 ? "1 place left" : `${input.placesLeft} places left`);
  return parts.join(" · ");
}

/** The form, and the ask route, refusing. */
export const MOVE_ASK_REFUSAL = {
  body: "Expected a JSON object body.",
  chooseFirst: "Choose a group first.",
  sayWhy: "Say why first: a line is enough.",
  noneWithAPlace: "No other group has a place right now.",
  justFilled: "That group has just filled up. Choose another.",
  /** A group the form no longer offers: no longer meeting, theirs already, or not one of the run's. */
  notOffered: "That group can’t be chosen now. Choose another.",
  /** Every ask somebody cannot make: no place in a group, an incubator, a group they facilitate, no session left to move from. */
  nothingToAsk: "There’s no other group you can ask to move to now.",
} as const;

// ---------------------------------------------------------------------------
// The card, and "Your requests"
// ---------------------------------------------------------------------------

/** While it waits: "You asked to move to Group I for good. An admin decides." */
export function movingWaitingWords(toName: string): string {
  return `You asked to move to ${groupName(toName)} for good. An admin decides.`;
}

/** Declined, at the top: "Your request to move to Group I wasn’t approved. Zach: “…”" */
export function moveDeclinedMessageWords(input: { toName: string; deciderFirstName: string; reply: string }): string {
  const head = `Your request to move to ${groupName(input.toName)} wasn’t approved.`;
  return line(input.reply) ? `${head} ${line(input.deciderFirstName) || "An admin"}: “${line(input.reply)}”` : head;
}

/** Approved, at the top until their first session with the new group starts: "You’re in Group I from week 3. …" */
export function movedInWords(toName: string, weekNumber: number): string {
  return `You’re in ${groupName(toName)} from week ${weekNumber}. Your work, its feedback and your attendance came with you.`;
}

/** Withdraw pressed again on a request already withdrawn. */
export const ALREADY_WITHDRAWN = "It’s already been withdrawn.";

/** One row of "Your requests": "Move to Group I". */
export function moveRowTitleWords(toName: string): string {
  return `Move to ${groupName(toName)}`;
}

// ---------------------------------------------------------------------------
// Staff: the Requests page and one request's page
// ---------------------------------------------------------------------------

/** One request's page, and its row's link: "Chloe Nguyen: change group for good". */
export function moveRequestTitleWords(name: string): string {
  return `${line(name) || "NAISI member"}: change group for good`;
}

/** A request that went by itself, on its page and from the routes: why, then "so this request closed by itself. Nobody was emailed." */
export function moveGoneStaffWords(gone: { why: "over" | "place" | "moved" | "group"; groupName?: string }, firstName: string): string {
  const first = line(firstName);
  const tail = "so this request closed by itself. Nobody was emailed.";
  switch (gone.why) {
    case "over":
      return `The programme is over, ${tail}`;
    case "moved":
      return `${first || "They"} ${first ? "has" : "have"} been moved since asking, ${tail}`;
    case "group":
      return `${line(gone.groupName) || "That group"} no longer meets, ${tail}`;
    default:
      return `${first || "They"} no longer ${first ? "holds" : "hold"} a place that can be moved, ${tail}`;
  }
}

/** Under the list, for an admin: who reads these, and who is emailed. */
export const MOVES_WHO_SEES =
  "Requests to change group are for admins only. Asking emails the admins unless they switch it off above. Approving emails the person and both groups’ facilitators; declining or replying emails the person.";

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

/**
 * To each admin who decides requests and has not switched it off: "Leo Park
 * asked to change group". Never the person's own words.
 */
export function newMoveRequestEmailWords(input: { personName: string; fromName: string; toName: string; askedAt: Date }): ExcusedEmailWords {
  const person = line(input.personName) || "Somebody";
  return {
    subject: `${person} asked to change group`,
    before: [
      `${person} asked on ${londonDayLabel(input.askedAt)} at ${londonClockLabel(input.askedAt)} to move from ${line(input.fromName) || "their group"} to ${groupName(input.toName)} for the rest of the programme.`,
    ],
    quote: null,
    after: [],
    button: "Open the request",
    footnote: "You get this because you decide requests. You can switch it off on the Requests page.",
  };
}

/** "About your request to change group": declined, to the person, with the reply. */
export function moveDeclinedEmailWords(input: { toName: string; fromName: string; deciderFirstName: string; reply: string }): ExcusedEmailWords {
  const decider = line(input.deciderFirstName) || "An admin";
  return {
    subject: "About your request to change group",
    before: [`Your request to move to ${groupName(input.toName)} wasn’t approved.`],
    quote: line(input.reply) ? `${decider} says: “${line(input.reply)}”` : null,
    after: [`You’re still in ${line(input.fromName) || "your group"}.`],
    button: "Open your programme page",
    footnote: null,
  };
}

/** A reply without deciding, to the person: the reply email of a request to go to another session, with the request named for a move. */
export function moveReplyEmailWords(input: { toName: string; deciderFirstName: string; reply: string }): ExcusedEmailWords {
  const decider = line(input.deciderFirstName) || "An admin";
  return {
    subject: "About your request to change group",
    before: [`${decider} replied to your request to move to ${groupName(input.toName)}.`],
    quote: `${decider} says: “${line(input.reply)}”`,
    after: ["It’s still waiting for a decision."],
    button: "Open your programme page",
    footnote: null,
  };
}
