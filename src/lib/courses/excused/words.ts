import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { clockWords, dayWords, namesWords, weeksWords } from "@/lib/courses/sessionChange/words";

/**
 * THE WORDS OF ASKING TO BE EXCUSED FROM A WEEK, in one place: the two facts
 * a group's facilitators and the programme's lead are shown, the three kinds
 * of being excused staff tell apart, the routes' refusals, the emails and
 * the sentence a group's history keeps. No server imports, so a page in the
 * browser can say the same thing.
 *
 * NEVER THE REASON in anything a facilitator, a lead or the group's history
 * reads: nothing here takes it, but for the person's own words on their own
 * card. Times through the house clock (`londonLabels`). No dash of either
 * kind.
 */

// ---------------------------------------------------------------------------
// What a facilitator and a lead are shown: one of two facts, nothing else
// ---------------------------------------------------------------------------

/** The two facts, per person per session. */
export type ExcuseFact = "waiting" | "excused";

export const ASKED_WAITING = "Asked to be excused, waiting";
export const EXCUSED = "Excused";

/** The words of a fact. */
export function factWords(fact: ExcuseFact): string {
  return fact === "waiting" ? ASKED_WAITING : EXCUSED;
}

// ---------------------------------------------------------------------------
// The kinds of being excused, told apart for admins (and the person's own card)
// ---------------------------------------------------------------------------

/**
 * How somebody came to be excused from one session:
 *  - `approved`: an admin approved their request;
 *  - `time-set`: they ticked it when they answered "Can you make this time?"
 *    with "Most weeks, not all";
 *  - `before-requests`: they said so in advance, on a line told before
 *    requests existed (the instant "Can't make it", `REQUESTS_BEGAN`);
 *  - `in-advance`: they said so in advance on their own word, since then (a
 *    facilitator who holds a place, an old page still open) or on a tick kept
 *    from an earlier asking of the time question.
 */
export type ExcusedKind = "approved" | "time-set" | "in-advance" | "before-requests";

export const SAID_WHEN_TIME_SET = "Said when the time was set";
export const SAID_IN_ADVANCE = "Said in advance";
export const SAID_BEFORE_REQUESTS = "Said in advance, before requests";
export const APPROVED = "Approved";

export function excusedKindWords(kind: ExcusedKind): string {
  switch (kind) {
    case "approved":
      return APPROVED;
    case "time-set":
      return SAID_WHEN_TIME_SET;
    case "before-requests":
      return SAID_BEFORE_REQUESTS;
    default:
      return SAID_IN_ADVANCE;
  }
}

/** "Never, this term.", "Once this term.", "Twice this term.", "3 times this term." Staff only. */
export function timesThisTermWords(count: number): string {
  if (count <= 0) return "Never, this term.";
  if (count === 1) return "Once this term.";
  if (count === 2) return "Twice this term.";
  return `${count} times this term.`;
}

/** Said beside the count, wherever staff read it. */
export const NEVER_A_COUNT = "Members never see a count or an allowance.";

// ---------------------------------------------------------------------------
// The flow's own words, for the pages
// ---------------------------------------------------------------------------

export const ASK_TO_BE_EXCUSED = "Ask to be excused";
export const SEND_THE_REQUEST = "Send the request";
export const WITHDRAW_THE_REQUEST = "Withdraw the request";
export const NO_MEDICAL_DETAILS = "Please don’t include medical details or anything about your health. A few words are enough.";
export const WHY_A_LINE = "Why (a line is enough)";
export const APPROVE_AND_EMAIL = "Approve and email";
export const REPLY_WITHOUT_DECIDING = "Reply without deciding";

/** "Send the request", or "Send the request for 2 weeks". */
export function sendTheRequestWords(weeks: number): string {
  return weeks > 1 ? `${SEND_THE_REQUEST} for ${weeks} weeks` : SEND_THE_REQUEST;
}

/** "Approve and email 2 people", "Approve and email Grace". */
export function approveButtonWords(emails: number, onlyName: string): string {
  if (emails === 1 && onlyName) return `Approve and email ${onlyName}`;
  return emails === 1 ? "Approve and email 1 person" : `Approve and email ${emails} people`;
}

/** "Decline and email Grace". */
export function declineButtonWords(firstName: string): string {
  return `Decline and email ${firstName.trim() || "them"}`;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export const EXCUSED_REFUSAL = {
  body: "Expected a JSON object body.",
  /** Not one of the group's people, told their group: says nothing of a group they were not told about. */
  notYours: "This isn’t a session of a group you’re in.",
  /** A facilitator of the group, who also holds a place in it. */
  facilitates: "You facilitate this group, so you can’t ask to be excused from its sessions here.",
  weeks: "Choose the weeks you can’t make.",
  sameWeek: "Choose each week once.",
  tooMany: "Ask about 10 weeks at most in one request.",
  reason: "Say why, in a line.",
  reasonText: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason.",
  /** The programme has closed: nothing more is asked. */
  closed: "Your programme has closed, so it’s too late to ask to be excused.",
  notFound: "Request not found",
  /** Only the person who asked withdraws. */
  onlyAsker: "Only the person who asked can withdraw it.",
  /** The person who asked never decides it. */
  ownRequest: "You asked for this, so somebody else decides it.",
  week: "Say which week this is about.",
  notInRequest: "That week isn’t part of this request.",
  nothingWaiting: "Nothing in this request is waiting, so there’s nothing to withdraw.",
  reply: "Write a reply to say why it’s declined.",
  replyEmpty: "Write a reply.",
  replyText: "The reply must be text.",
  replyLine: "The reply must be one line.",
  replyLink: "Leave links out of the reply.",
  tooManyReplies: "This request has had as many replies as it can keep.",
  /** The group or its programme is gone: nothing to write on. */
  gone: "That group isn’t there any more, so nothing was changed. Decline it, with a reply, to close it.",
  /** The person left the group, was moved, or the group was archived: nothing was written. */
  left: "They’ve left that group, so nothing was changed. Decline it, with a reply, to close it.",
  /** The register moved under the approval: nothing was written. */
  changed: "That register has just changed. Check it, and press again.",
} as const;

/** "Week 3", or "Week 3’s session 2". */
function weekLabel(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `Week ${weekNumber}’s session ${occurrence}` : `Week ${weekNumber}`;
}

/** "week 3", or "week 3’s session 2". */
function weekLabelLower(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `week ${weekNumber}’s session ${occurrence}` : `week ${weekNumber}`;
}

/** Why one session cannot be asked about, by the reason `askState` gives. */
export function askClosedWords(
  why: "cancelled" | "undated" | "not-held" | "came" | "excused" | "waiting" | "approved" | "not-finished" | "not-absent" | "not-yours",
  weekNumber: number,
  occurrence = 1,
): string {
  const label = weekLabel(weekNumber, occurrence);
  switch (why) {
    case "cancelled":
      return `${label}’s session isn’t happening, so there’s nothing to be excused from.`;
    case "undated":
      return `${label}’s session has no day or time yet, so it can’t be asked about yet.`;
    case "not-held":
      return `${label}’s session didn’t happen, so there’s nothing to be excused from.`;
    case "came":
      return `${label}’s register says you came, so there’s nothing to be excused from.`;
    case "excused":
    case "approved":
      return `You’re already excused from ${weekLabelLower(weekNumber, occurrence)}.`;
    case "waiting":
      return `You’ve already asked to be excused from ${weekLabelLower(weekNumber, occurrence)}, and it’s waiting.`;
    case "not-finished":
      return `${label}’s session has started. You can ask once its register is finished, if it says you were absent.`;
    case "not-absent":
      return `${label}’s register doesn’t say you were absent, so there’s nothing to be excused from.`;
    default:
      return `${label} isn’t one of your group’s sessions.`;
  }
}

/** A week of the request that is no longer waiting. */
export function weekNotWaitingWords(weekNumber: number, occurrence: number, status: "approved" | "declined" | "withdrawn"): string {
  const label = weekLabel(weekNumber, occurrence);
  return status === "withdrawn" ? `${label} was withdrawn.` : `${label} has been decided already.`;
}

/** "The reason must be 200 characters or fewer." */
export function tooLongWords(what: "reason" | "reply", max: number): string {
  return `The ${what} must be ${max} characters or fewer.`;
}

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

/** The session as the emails name it: "Wed 11 Nov, 3pm", or "Wed 11 Nov" with no time. */
export function sessionWhenWords(dateKey: string, startTimeLocal: string): string {
  const day = dayWords(dateKey);
  const clock = clockWords(startTimeLocal);
  return day && clock ? `${day}, ${clock}` : day;
}

/** One email's words: subject, the lines before the quoted reply, the reply, the lines after, a note at the foot. */
export type ExcusedEmailWords = {
  subject: string;
  before: string[];
  /** "Zach says: “...”", or null with no reply. */
  quote: string | null;
  after: string[];
  button: string;
  /** "Rahul is told you’re excused, but not why.", or null. */
  footnote: string | null;
};

/**
 * What approving did, for the person's email: the line will say excused
 * (`before`), says Excused now (`excused-now`), a finished register says they
 * came (`came`), a register still being taken keeps what its facilitators put
 * there (`being-taken`: a member is never told a draft's marks), the session
 * did not happen (`not-held`), a finished register has no line for them
 * (`no-line`), or the register has no room for another line (`full`).
 */
export type ApprovedFor = "before" | "excused-now" | "came" | "being-taken" | "not-held" | "no-line" | "full";

/**
 * "You’re excused from week 2": to the person, with the reply.
 * `facilitatorFirstNames` are the people the facilitators' email went to.
 */
export function approvedEmailWords(input: {
  weekNumber: number;
  occurrence: number;
  groupName: string;
  when: string;
  deciderFirstName: string;
  reply: string;
  outcome: ApprovedFor;
  facilitatorFirstNames: readonly string[];
}): ExcusedEmailWords {
  const week = weekLabelLower(input.weekNumber, input.occurrence);
  const Week = weekLabel(input.weekNumber, input.occurrence);
  const decider = input.deciderFirstName.trim() || "An admin";
  const group = input.groupName.trim() || "your group";
  const after: string[] = [];
  switch (input.outcome) {
    case "before":
      after.push(`${Week}’s work is still due by your session, and its reminders still come until it’s done. If you can come after all, just come along.`);
      break;
    case "excused-now":
      after.push(`Your register says Excused for that session, and ${week}’s work is still open on your programme page.`);
      break;
    case "came":
      after.push(`Your register says you were there, so it stays as it is. ${Week}’s work is still open on your programme page.`);
      break;
    case "being-taken":
      after.push(`Your facilitators are still taking that session’s register, and what they put there stands. ${Week}’s work is still open on your programme page.`);
      break;
    case "no-line":
      after.push(`That session’s register was finished without a line for you, so it stays as it is. ${Week}’s work is still open on your programme page.`);
      break;
    case "full":
      after.push(`That session’s register has no room for another line, so it stays as it is. ${Week}’s work is still open on your programme page.`);
      break;
    default:
      after.push(`That session didn’t happen, so there’s nothing on the register to change.`);
  }
  const names = input.facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  return {
    subject: `You’re excused from ${week}`,
    before: [`${decider} approved your request to be excused from ${group}’s ${week} session${input.when ? `, ${input.when}` : ""}.`],
    quote: input.reply.trim() ? `${decider} says: “${input.reply.trim()}”` : null,
    after,
    button: "Open your programme page",
    footnote: names.length > 0 ? `${namesWords(names)} ${names.length > 1 ? "are" : "is"} told you’re excused, but not why.` : null,
  };
}

/**
 * "Grace Chen is excused from week 2": to each of the group's facilitators.
 * Never the reason, never how often: that the person is excused for that
 * session and there is nothing to do.
 */
export function facilitatorsEmailWords(input: {
  personName: string;
  personFirstName: string;
  weekNumber: number;
  occurrence: number;
  day: string;
  /** The register already says so (approved after the session), or will (before it). */
  already: boolean;
}): ExcusedEmailWords {
  const week = weekLabelLower(input.weekNumber, input.occurrence);
  const first = input.personFirstName.trim() || input.personName.trim() || "They";
  const on = input.day ? ` for ${input.day}` : "";
  return {
    subject: `${input.personName.trim() || "Somebody in your group"} is excused from ${week}`,
    before: [
      input.already
        ? `Your register now shows ${first} as excused${on}. There’s nothing for you to do.`
        : `Your register will show ${first} as excused${on}. There’s nothing for you to do.`,
    ],
    quote: null,
    after: [],
    button: "Open your group",
    footnote: null,
  };
}

/** "About your request for week 3": declined, to the person, with the reply. */
export function declinedEmailWords(input: {
  weekNumber: number;
  occurrence: number;
  day: string;
  deciderFirstName: string;
  reply: string;
  /** Where the session stands now: still to come, met with its register finished as Absent, or met and still being taken. */
  session: "before" | "absent" | "after";
}): ExcusedEmailWords {
  const week = weekLabelLower(input.weekNumber, input.occurrence);
  const decider = input.deciderFirstName.trim() || "An admin";
  const after =
    input.session === "before"
      ? `Your register is taken as usual on the day, and ${week}’s work is still due by your session.`
      : input.session === "absent"
        ? `The register says Absent for that session, and ${week}’s work is still open.`
        : `The register is taken as usual, and ${week}’s work is still open.`;
  return {
    subject: `About your request for ${week}`,
    before: [`Your request to be excused from ${input.day || week} wasn’t approved.`],
    quote: input.reply.trim() ? `${decider} says: “${input.reply.trim()}”` : null,
    after: [after],
    button: "Open your programme page",
    footnote: null,
  };
}

/** One week of a new request, as the admins' email names it. */
export type NewRequestWeek = { weekNumber: number; occurrence: number; dateKey: string; startTimeLocal: string; startsAt: Date | null };

/**
 * "for today" or "for tomorrow": a request whose first session starts within
 * the next 24 hours, by the London day it starts on (the house clock); "" for
 * anything later or already started.
 */
export function soonWords(weeks: readonly NewRequestWeek[], now: Date, todayKey: string, tomorrowKey: string, keyOf: (at: Date) => string): string {
  const soon = weeks
    .map((week) => week.startsAt)
    .filter((at): at is Date => at !== null && at.getTime() > now.getTime() && at.getTime() - now.getTime() <= 24 * 60 * 60 * 1000)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (!soon) return "";
  const key = keyOf(soon);
  return key === todayKey ? "for today" : key === tomorrowKey ? "for tomorrow" : "";
}

/**
 * "Grace Chen asked to be excused from week 2": to each admin who decides
 * requests to be excused and has not switched it off. Who asked, for which
 * group and week or weeks with each session's day and time, when, and the
 * way to the request's page. NEVER the reason, which is deleted from the site
 * when the programme closes and must not live on in an inbox; never a
 * meeting link.
 */
export function newRequestEmailWords(input: {
  personName: string;
  groupName: string;
  weeks: readonly NewRequestWeek[];
  askedAt: Date;
  now: Date;
  /** "for today" or "for tomorrow" (`soonWords`), or "". */
  soon: string;
}): ExcusedEmailWords {
  const person = input.personName.trim() || "Somebody";
  const group = input.groupName.trim() || "their group";
  const label = input.weeks.length === 1 ? weekLabelLower(input.weeks[0].weekNumber, input.weeks[0].occurrence) : weeksWords([...new Set(input.weeks.map((week) => week.weekNumber))]);
  const asked =
    londonDayLabel(input.askedAt) === londonDayLabel(input.now)
      ? `today at ${londonClockLabel(input.askedAt)}`
      : `on ${londonDayLabel(input.askedAt)} at ${londonClockLabel(input.askedAt)}`;
  return {
    subject: `${person} asked to be excused from ${label}${input.soon ? `, ${input.soon}` : ""}`,
    before: [
      `${person} asked ${asked} to be excused from ${group}’s ${label}${input.soon ? `, ${input.soon}` : ""}.`,
      ...input.weeks.map((week) => {
        const when = sessionWhenWords(week.dateKey, week.startTimeLocal);
        return `${weekLabel(week.weekNumber, week.occurrence)}${when ? `: ${when}` : ""}`;
      }),
    ],
    quote: null,
    after: ["Their reason is on the request’s page, for admins only, and isn’t in this email."],
    button: "Open the request",
    footnote: "You get this because you decide requests to be excused. You can switch it off on the Requests page.",
  };
}

/** The switch route's refusal of a body that is not on or off. */
export const REQUEST_EMAILS_REFUSAL = { body: "Say on or off: { on: true } or { on: false }." } as const;

/** Under the switch on the Requests page. */
export const EMAIL_ME_ABOUT_REQUESTS = "Email me about new requests";
export const EMAIL_ME_LINE = "When somebody asks to be excused: who, which weeks and when, never their reason.";

/** A reply without a decision, to the person. */
export function replyEmailWords(input: {
  weekNumbers: readonly number[];
  deciderFirstName: string;
  reply: string;
  /** Some week of it still waits for a decision. */
  waiting: boolean;
}): ExcusedEmailWords {
  const weeks = input.weekNumbers.length > 0 ? weeksWords(input.weekNumbers) : "a week";
  const decider = input.deciderFirstName.trim() || "An admin";
  return {
    subject: `About your request for ${weeks}`,
    before: [`${decider} replied to your request to be excused from ${weeks}.`],
    quote: `${decider} says: “${input.reply.trim()}”`,
    after: input.waiting ? ["It’s still waiting for a decision. You’ll get an email when it’s decided."] : [],
    button: "Open your programme page",
    footnote: null,
  };
}

// ---------------------------------------------------------------------------
// The group's history
// ---------------------------------------------------------------------------

/**
 * "Zach approved Tom Fisher’s request to be excused for week 2. The register
 * changed from Absent to Excused. Emailed Tom and Nadia." Never the reason.
 */
export function approvedCorrectionDetail(input: {
  deciderFirstName: string;
  personName: string;
  weekNumber: number;
  occurrence: number;
  emailedFirstNames: readonly string[];
}): string {
  const decider = input.deciderFirstName.trim() || "An admin";
  const person = input.personName.trim() || "NAISI member";
  const names = input.emailedFirstNames.map((name) => name.trim()).filter(Boolean);
  const emailed = names.length > 0 ? ` Emailed ${namesWords(names)}.` : "";
  return `${decider} approved ${person}’s request to be excused for ${weekLabelLower(input.weekNumber, input.occurrence)}. The register changed from Absent to Excused.${emailed}`;
}

// ---------------------------------------------------------------------------
// The person's own card
// ---------------------------------------------------------------------------

/** "Approved by Zach on Mon 9 Nov, 11:15am". */
export function approvedByWords(firstName: string, at: Date): string {
  return `Approved by ${firstName.trim() || "an admin"} on ${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/** "You asked at 2:50pm", or "You asked on Tue 10 Nov at 2:50pm" another day. */
export function youAskedWords(askedAt: Date, now: Date): string {
  return londonDayLabel(askedAt) === londonDayLabel(now)
    ? `You asked at ${londonClockLabel(askedAt)}`
    : `You asked on ${londonDayLabel(askedAt)} at ${londonClockLabel(askedAt)}`;
}

/** "Withdrawn by you, 11:20am". */
export function withdrawnByYouWords(at: Date, now: Date): string {
  return londonDayLabel(at) === londonDayLabel(now)
    ? `Withdrawn by you, ${londonClockLabel(at)}`
    : `Withdrawn by you, ${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/** "Not excused for week 3." */
export function notExcusedWords(weekNumber: number, occurrence = 1): string {
  return `Not excused for ${weekLabelLower(weekNumber, occurrence)}.`;
}

// ---------------------------------------------------------------------------
// One request's page, for admins: what approving a week will do
// ---------------------------------------------------------------------------

/**
 * What approving one week will do to the register, as the request's page
 * says it before the press: "The register says Excused for Grace, with
 * nothing for Rahul to do."
 */
export function approvingWords(input: {
  write: "in-advance" | "draft" | "correct" | "keep";
  kept?: "came" | "excused" | "not-held" | "no-line" | "full";
  /** The session has started. */
  started: boolean;
  personFirstName: string;
  facilitatorFirstNames: readonly string[];
}): string {
  const person = input.personFirstName.trim() || "them";
  const names = input.facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  const nothingFor = names.length > 0 ? `, with nothing for ${namesWords(names)} to do` : "";
  switch (input.write) {
    case "in-advance":
      return `The register says Excused for ${person}${nothingFor}.`;
    case "draft":
      return input.started
        ? `The register isn’t finished yet: ${person}’s line says Excused, and ${names.length > 0 ? namesWords(names) : "the facilitators"} can still change it.`
        : `The register says Excused for ${person}${nothingFor}.`;
    case "correct":
      return `The register is already finished and says Absent: approving changes it to Excused and logs it in the group’s history.`;
    default:
      switch (input.kept) {
        case "came":
          return `The register says ${person} was there, so it stays as it is. The request is approved all the same.`;
        case "excused":
          return `The register already says Excused for ${person}.`;
        case "not-held":
          return "That session didn’t happen, so the register needs nothing.";
        case "full":
          return "That register is full, so it stays as it is. The request is approved all the same.";
        default:
          return `The register is finished with no line for ${person}, so it stays as it is.`;
      }
  }
}

/** "2 emails: Grace, with your reply; and Rahul, without the reason." */
export function toldWords(personFirstName: string | null, facilitatorFirstNames: readonly string[]): string {
  const parts: string[] = [];
  if (personFirstName !== null) parts.push(`${personFirstName.trim() || "the person"}, with your reply`);
  const names = facilitatorFirstNames.map((name) => name.trim()).filter(Boolean);
  if (names.length > 0) parts.push(`${namesWords(names)}, without the reason`);
  const count = (personFirstName !== null ? 1 : 0) + names.length;
  if (count === 0) return "Nobody is emailed.";
  const list = parts.length === 2 ? `${parts[0]}; and ${parts[1]}` : parts[0];
  return `${count === 1 ? "1 email" : `${count} emails`}: ${list}.`;
}

/** Said on the request's page once the programme has closed and the reason went with it. */
export const REASON_GONE = "The reason was deleted when the programme closed. Only that the person asked is kept.";
