import { sessionWhenWords } from "../excused/words";
import { dayWords } from "../sessionChange/words";
import { couldBeFollowed } from "../followable";
import { sessionWhenLabel } from "../londonLabels";

/**
 * MOVING SOMEBODY TO ANOTHER GROUP FOR GOOD, MID-TERM: every sentence the
 * page, its route and its three emails say. Staff read all of it but the
 * email to the person, whose words are the approved ones, kept here word for
 * word. Nothing here is shown to a member on a page.
 *
 * A typed value (a name, a group's name, a room) is printed as it was typed,
 * one line; the email's template escapes it. A room that could be followed
 * (a link) is never printed: no email carries a meeting link.
 *
 * Pure: no reads, no clock.
 */

// ---------------------------------------------------------------------------
// Small parts
// ---------------------------------------------------------------------------

/** One line of typed text, or "". */
function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** "Leo", "Leo and Ana", "Leo, Ana and Raj". */
export function andList(items: readonly string[]): string {
  const clean = items.map(line).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/** "week 1", "weeks 1 and 2", "weeks 1 to 3". "" for none. Weeks run on without a gap. */
export function weeksWords(weeks: readonly number[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return `week ${weeks[0]}`;
  if (weeks.length === 2) return `weeks ${weeks[0]} and ${weeks[1]}`;
  return `weeks ${weeks[0]} to ${weeks[weeks.length - 1]}`;
}

/** "Weeks 1 and 2", "Week 1": the same, at the start of a sentence. */
function weeksAtStart(weeks: readonly number[]): string {
  const said = weeksWords(weeks);
  return said ? said[0].toUpperCase() + said.slice(1) : "";
}

/** Somebody's name with "’s": "Leo’s". */
function possessive(name: string): string {
  return `${line(name)}’s`;
}

/** A group's name, or a stand-in. */
function groupName(name: string): string {
  return line(name) || "the group";
}

/** "Thursday", from a weekday number (0 is Sunday), or "". */
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------------------------------------------------------------------------
// A group as a line
// ---------------------------------------------------------------------------

/** What a group's line is built from: what the group has, and nothing invented. */
export type GroupLineFacts = {
  name: string;
  /** The group's weekly slot. */
  session: { weekday: number; startTimeLocal: string; durationMinutes: number; location: string };
  /** Its facilitators by first name, never the reader's own. */
  facilitatorFirstNames: readonly string[];
};

/**
 * "Thursdays, 5pm to 7pm, George Green B06, with Harriet": the group's
 * regular time, its room and its facilitators by first name, each left out
 * when the group has none. "" when it has none of them.
 */
export function groupDetailsWords(group: GroupLineFacts): string {
  const parts: string[] = [];
  const when = sessionWhenLabel(group.session);
  if (when) parts.push(when);
  const room = line(group.session.location);
  if (room && !couldBeFollowed(room)) parts.push(room);
  const names = andList(group.facilitatorFirstNames);
  if (names) parts.push(`with ${names}`);
  return parts.join(", ");
}

// ---------------------------------------------------------------------------
// The emails (approved words)
// ---------------------------------------------------------------------------

/** One email's words: its subject, its lines, its button and the line at its foot ("" for none). */
export type MoveEmailWords = {
  subject: string;
  lines: string[];
  button: string;
  footnote: string;
};

/** The facts of a move every email is written from. */
export type MoveEmailFacts = {
  /** The person, whole ("Leo Park") and by first name ("Leo"), as the group pages name them. */
  personName: string;
  personFirstName: string;
  /** Week N: the first week in the new group. */
  weekNumber: number;
  /** The weeks that come with them (`weeksThatCome`): none when the move is from their first week. */
  weeksThatCome: readonly number[];
  /** The new group, as its line says it. */
  to: GroupLineFacts;
  /** The old group's name. */
  fromName: string;
  /** The new group's week N session, its date key: their first session with them. */
  firstSessionDateKey: string;
};

/**
 * To the person: "You’re moving to Group F". Their first word of the move,
 * and the approved words: the new group's line (what it has), their first
 * session, the weeks that come with them (left out when none do), and that
 * they don't go to the old group's sessions. No footnote.
 */
export function personEmailWords(facts: MoveEmailFacts): MoveEmailWords {
  const to = groupName(facts.to.name);
  const details = groupDetailsWords(facts.to);
  const first = dayWords(facts.firstSessionDateKey);
  const weeks = weeksWords(facts.weeksThatCome);
  const lines = [
    `From week ${facts.weekNumber} you’re in ${to}${details ? `: ${details}` : ""}.${first ? ` Your first session with them is ${first}.` : ""}`,
    ...(weeks ? [`Your work and feedback from ${weeks} come with you.`] : []),
    `From week ${facts.weekNumber} you’re no longer in ${groupName(facts.fromName)}, so you don’t need to go to its sessions.`,
  ];
  return { subject: `You’re moving to ${to}`, lines, button: "Open your programme page", footnote: "" };
}

/** To each of the new group's facilitators: "Leo Park joins Group F from week 3". */
export function newFacilitatorsEmailWords(facts: MoveEmailFacts): MoveEmailWords {
  const person = line(facts.personName) || "Somebody";
  const first = line(facts.personFirstName) || person;
  const to = groupName(facts.to.name);
  const day = dayWords(facts.firstSessionDateKey);
  const weeks = weeksWords(facts.weeksThatCome);
  const lines = [
    `${person} is moving to ${to} from week ${facts.weekNumber}${day ? `, starting ${day}` : ""}.`,
    ...(weeks ? [`You can read ${possessive(first)} work from ${weeks}, with the feedback on it.`] : []),
  ];
  return {
    subject: `${person} joins ${to} from week ${facts.weekNumber}`,
    lines,
    button: "Open your group",
    footnote: "This is an automated email, sent because somebody was moved into your group.",
  };
}

/**
 * To each of the old group's facilitators: "Leo Park leaves Group C from
 * week 3". "The feedback you gave stays on Leo’s page, signed by you." only
 * to a facilitator who has given this person feedback (`gaveFeedback`).
 */
export function oldFacilitatorsEmailWords(facts: MoveEmailFacts, gaveFeedback: boolean): MoveEmailWords {
  const person = line(facts.personName) || "Somebody";
  const first = line(facts.personFirstName) || person;
  const lines = [
    `${person} is moving to ${groupName(facts.to.name)} from week ${facts.weekNumber}. ${first} comes off your register from then, and you’ll no longer be able to read ${possessive(first)} work.`,
    ...(gaveFeedback ? [`The feedback you gave stays on ${possessive(first)} page, signed by you.`] : []),
  ];
  return {
    subject: `${person} leaves ${groupName(facts.fromName)} from week ${facts.weekNumber}`,
    lines,
    button: "Open your group",
    footnote: "This is an automated email, sent because somebody was moved out of your group.",
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/** "Leo Park: move to another group for good". */
export function moveTitle(personName: string): string {
  return `${line(personName) || "Somebody"}: move to another group for good`;
}

export const MOVE_TO = "Move to";
export const FROM_WHICH_WEEK = "From which week?";
export const WHAT_WILL_HAPPEN = "What will happen";
export const CANCEL = "Cancel";
export const CLOSE = "Close";
export const MOVING = "Moving…";
export const FULL = "Full";
export const CHOOSE_A_GROUP = "Choose a group";

/** "Why (kept with Leo’s record)". */
export function whyLabel(firstName: string): string {
  return `Why (kept with ${possessive(firstName || "their")} record)`;
}

/** "Optional. Read by the programme’s lead and admins, on both groups’ history. Never emailed." */
export const WHY_HINT = "Optional. The programme’s lead and admins read it on both groups’ history. It is never emailed, and never shown to the person or a facilitator.";

/** The labels of "What will happen", in the board's order. */
export const LINE_LABEL = {
  group: "Group",
  work: "Work",
  copies: "Copies",
  attendance: "Attendance",
  late: "Late, reminders",
  registers: "Registers",
  told: "Told",
  leftBehind: "Left behind",
} as const;

/** "Group F · Thursdays, 5pm to 7pm · George Green B06 · Harriet · 5 people": one choice under "Move to". */
export function groupChoiceWords(group: GroupLineFacts, people: number, full: boolean): string {
  const parts = [groupName(group.name)];
  const when = sessionWhenLabel(group.session);
  if (when) parts.push(when);
  const room = line(group.session.location);
  if (room && !couldBeFollowed(room)) parts.push(room);
  const names = andList(group.facilitatorFirstNames);
  if (names) parts.push(names);
  parts.push(people === 1 ? "1 person" : `${people} people`);
  if (full) parts.push(FULL);
  return parts.join(" · ");
}

/** "Week 3 · Group F meets Thu 19 Nov": the week, stated, never chosen. */
export function weekStatedWords(weekNumber: number, toName: string, firstSessionDateKey: string): string {
  const day = dayWords(firstSessionDateKey);
  return day ? `Week ${weekNumber} · ${groupName(toName)} meets ${day}` : `Week ${weekNumber}`;
}

/**
 * "Weeks 1 and 2 stay with Group C, where Leo met." The weeks before N, by
 * the groups they were spent in (one, or more for somebody moved before).
 * "" when there are none.
 */
export function weeksStayWords(weeks: readonly number[], groupNames: readonly string[], firstName: string): string {
  const said = weeksAtStart(weeks);
  if (!said) return "";
  const names = andList(groupNames.map(groupName));
  const verb = weeks.length === 1 ? "stays" : "stay";
  return `${said} ${verb} with ${names || "the group"}, where ${line(firstName) || "they"} met.`;
}

/**
 * "Leo won’t go to Group C’s session on Wed 11 Nov. To move Leo from week 3
 * instead, come back after that session." Under the week: the old group's
 * session of week N is still to come, and they will now skip it.
 */
export function skipsOldSessionWords(input: { firstName: string; fromName: string; dateKey: string; weekNumber: number }): string {
  const first = line(input.firstName) || "They";
  const day = dayWords(input.dateKey);
  const on = day ? ` on ${day}` : "";
  return `${first} won’t go to ${possessive(groupName(input.fromName))} session${on}. To move ${first} from week ${input.weekNumber + 1} instead, come back after that session.`;
}

/** Group: "From week 3, Leo is in Group F, which then has 6, its limit." */
export function groupLineWords(input: { firstName: string; weekNumber: number; toName: string; then: number; capacity: number | null }): string {
  const first = line(input.firstName) || "They";
  const limit = input.capacity !== null && input.then >= input.capacity ? ", its limit" : "";
  return `From week ${input.weekNumber}, ${first} is in ${groupName(input.toName)}, which then has ${input.then}${limit}.`;
}

/**
 * Work: "Harriet can read Leo’s weeks 1 and 2, with Rahul’s feedback on
 * them. Rahul no longer can; that feedback stays on Leo’s page, signed by
 * Rahul." Who reads whose work is the group they are in now, at once.
 */
export function workLineWords(input: {
  firstName: string;
  weeks: readonly number[];
  newFacilitators: readonly string[];
  oldFacilitators: readonly string[];
  /** The old group's facilitators who gave this person feedback. */
  feedbackFrom: readonly string[];
  toName: string;
  fromName: string;
}): string {
  const first = line(input.firstName) || "their";
  const readers = andList(input.newFacilitators) || `${possessive(groupName(input.toName))} facilitators`;
  const leavers = andList(input.oldFacilitators) || `${possessive(groupName(input.fromName))} facilitators`;
  const givers = andList(input.feedbackFrom);
  const weeks = weeksWords(input.weeks);
  const reads = weeks
    ? `${readers} can read ${possessive(first)} ${weeks}${givers ? `, with ${possessive(givers)} feedback on them` : ""}.`
    : `${readers} can read ${possessive(first)} work.`;
  const stops = givers
    ? `${leavers} no longer can; that feedback stays on ${possessive(first)} page, signed by ${givers}.`
    : `${leavers} no longer can.`;
  return `${reads} ${stops}`;
}

/**
 * Copies: only when an earlier week's copy differs between the two groups.
 * "Group F’s week 2 differs from Group C’s. Leo’s week 2 stays on Group C’s
 * version, with Leo’s answers." Every reader of a week spent in another group
 * reads that group's copy (`copyGroupIdFor` in `src/lib/courses/weekCopy.ts`).
 */
export function copiesLineWords(input: { firstName: string; weeks: readonly number[]; toName: string; fromName: string }): string {
  const first = line(input.firstName);
  const verb = input.weeks.length === 1 ? "differs" : "differ";
  const stays = input.weeks.length === 1 ? "stays" : "stay";
  const weeks = weeksWords(input.weeks);
  const whose = first ? possessive(first) : "Their";
  const answers = first ? possessive(first) : "their";
  return `${possessive(groupName(input.toName))} ${weeks} ${verb} from ${possessive(groupName(input.fromName))}. ${whose} ${weeks} ${stays} on ${possessive(groupName(input.fromName))} version, with ${answers} answers.`;
}

/**
 * Copies, once for each week from the move's week on in which the person has
 * already written on the old group's version while the new group's differs
 * (that week is read on the new group's version after the move; nothing is
 * deleted): "Leo has already written in week 3, on Group C’s version. Group
 * F’s week 3 differs, so what Leo wrote for a question Group F doesn’t ask
 * won’t show on Leo’s week 3 after the move."
 */
export function writtenAheadWords(input: { firstName: string; weekNumber: number; fromName: string; toName: string }): string {
  const first = line(input.firstName);
  const who = first || "This person";
  const wrote = first || "they";
  const whose = first ? possessive(first) : "their";
  const from = groupName(input.fromName);
  const to = groupName(input.toName);
  const week = `week ${input.weekNumber}`;
  return `${who} has already written in ${week}, on ${possessive(from)} version. ${possessive(to)} ${week} differs, so what ${wrote} wrote for a question ${to} doesn’t ask won’t show on ${whose} ${week} after the move.`;
}

/** Attendance: "Weeks 1 and 2 with Group C and every week with Group F read as one record on Leo’s page." */
export function attendanceLineWords(input: { firstName: string; weeks: readonly number[]; stayNames: readonly string[]; toName: string }): string {
  const first = line(input.firstName) || "their";
  const said = weeksAtStart(input.weeks);
  if (!said) return `Every week with ${groupName(input.toName)} reads on ${possessive(first)} page.`;
  return `${said} with ${andList(input.stayNames.map(groupName)) || "the group"} and every week with ${groupName(input.toName)} read as one record on ${possessive(first)} page.`;
}

/** Late, reminders: "Group F’s Thursday times from week 3." */
export function lateLineWords(input: { toName: string; weekday: number; weekNumber: number }): string {
  const day = WEEKDAY_NAMES[input.weekday] ?? "";
  return `${possessive(groupName(input.toName))} ${day ? `${day} ` : ""}times from week ${input.weekNumber}.`;
}

/** Registers: "Leo leaves Group C’s from week 3 and joins Group F’s." */
export function registersLineWords(input: { firstName: string; fromName: string; toName: string; weekNumber: number }): string {
  const first = line(input.firstName) || "They";
  return `${first} leaves ${possessive(groupName(input.fromName))} from week ${input.weekNumber} and joins ${possessive(groupName(input.toName))}.`;
}

/** "A move made here mid-term emails on save; moves in Arrange before groups go out still wait for Publish." */
export const TOLD_TAIL = "A move made here mid-term emails on save; moves in Arrange before groups go out still wait for Publish.";

/** Told: "3 emails: Leo, Harriet and Rahul." and the tail. */
export function toldLineWords(firstNames: readonly string[]): { count: string; rest: string } {
  const n = firstNames.length;
  if (n === 0) return { count: "No emails", rest: `: nobody here has an address on the site. ${TOLD_TAIL}` };
  return { count: n === 1 ? "1 email" : `${n} emails`, rest: `: ${andList(firstNames)}. ${TOLD_TAIL}` };
}

/** The one button: "Move Leo to Group F and email 3 people". */
export function moveButtonWords(firstName: string, toName: string, emails: number): string {
  const first = line(firstName) || "them";
  const base = `Move ${first} to ${groupName(toName)}`;
  if (emails <= 0) return base;
  return `${base} and email ${emails === 1 ? "1 person" : `${emails} people`}`;
}

/** "To Leo": over the email the person will be sent. */
export function toPersonHeading(firstName: string): string {
  return `To ${line(firstName) || "them"}`;
}

/** What the move leaves on the old group from week N on, one item each. */
export type LeftBehind =
  | { kind: "excused"; weekNumber: number }
  | { kind: "most-weeks"; weekNumber: number }
  | { kind: "waiting"; weekNumber: number };

/**
 * Left behind, only when it applies: an approved excusal, or a "most weeks"
 * tick, for one of the old group's sessions from week N on, and a request to
 * be excused still waiting about one.
 */
export function leftBehindWords(firstName: string, fromName: string, items: readonly LeftBehind[]): string {
  const first = line(firstName) || "They";
  const from = possessive(groupName(fromName));
  const of = (kind: LeftBehind["kind"]) => items.filter((item) => item.kind === kind).map((item) => item.weekNumber);
  const sessions = (weeks: number[]) => `${from} ${weeksWords(weeks)} ${weeks.length === 1 ? "session" : "sessions"}`;
  const out: string[] = [];
  const excused = of("excused");
  if (excused.length > 0) out.push(`${first} was excused from ${sessions(excused)}. That no longer applies once ${first} moves.`);
  const ticked = of("most-weeks");
  if (ticked.length > 0) out.push(`${first} ticked ${sessions(ticked)} under “Most weeks, not all”. That no longer applies once ${first} moves.`);
  const waiting = of("waiting");
  if (waiting.length > 0) {
    out.push(
      `${possessive(first)} request to be excused from ${sessions(waiting)} is still waiting. It no longer applies once ${first} moves: decline it with a line on the Requests page.`,
    );
  }
  return out.join(" ");
}

// ---------------------------------------------------------------------------
// The history rows (one on each group)
// ---------------------------------------------------------------------------

/**
 * THE ONE FORM A MOVE'S REASON IS KEPT IN: one line, every run of white
 * space (two spaces, a tab, a non-breaking space) one space, trimmed. It is
 * the form the history's rows read a stored reason back in
 * (`courseAuditChangeOf`), so the reason stored on a row and the reason in
 * its sentence are the same text, and a reader that takes the reason out of
 * the sentence (`withoutReason`, for a facilitator) always finds it. The
 * route keeps a reason in this form (`parseMoveBody`), and the sentences
 * below embed it in this form whatever they are handed.
 */
export function moveReasonForm(reason: string): string {
  return reason.replace(/\s+/g, " ").trim();
}

/**
 * A history row's sentence with its "Reason: ..." taken off, for when the
 * reason itself goes (the account it is about is deleted): the reason as
 * kept, at the sentence's end; else everything from the first " Reason: ".
 */
export function withoutMoveReason(detail: string, reason: string | null): string {
  const why = moveReasonForm(reason ?? "");
  const tail = ` Reason: ${why}`;
  if (why && detail.endsWith(tail)) return detail.slice(0, -tail.length);
  const at = detail.indexOf(" Reason: ");
  return at >= 0 ? detail.slice(0, at) : detail;
}

/** On the old group's history: "Leo Park moved to Group F from week 3." */
export function movedOutDetail(personName: string, toName: string, weekNumber: number, reason: string): string {
  const base = `${line(personName) || "Somebody"} moved to ${groupName(toName)} from week ${weekNumber}.`;
  const why = moveReasonForm(reason);
  return why ? `${base} Reason: ${why}` : base;
}

/** On the new group's history: "Leo Park moved here from Group C, from week 3." */
export function movedInDetail(personName: string, fromName: string, weekNumber: number, reason: string): string {
  const base = `${line(personName) || "Somebody"} moved here from ${groupName(fromName)}, from week ${weekNumber}.`;
  const why = moveReasonForm(reason);
  return why ? `${base} Reason: ${why}` : base;
}

// ---------------------------------------------------------------------------
// What the route and the page refuse
// ---------------------------------------------------------------------------

export const MOVE_REFUSAL = {
  body: "Expected a JSON object body.",
  group: "Choose the group to move them to.",
  week: "Say which week the page said the move is from.",
  emailCount: "Say how many people the button said it would email.",
  reason: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason. It goes into both groups’ history.",
  notYours: "Only the programme’s lead and admins can move somebody to another group.",
  noProgramme: "That programme is not on this form.",
  noRun: "This programme doesn’t name a course run yet, so it has no groups.",
  runGone: "The course run this programme names is no longer on the site.",
  runOver: "The course run is over, so nobody can be moved on it.",
  runArchived: "The course run is archived, so nobody can be moved on it.",
  noPlace: "This person doesn’t hold a place in a group on the run.",
  oneGroup: "This run has one group, so there is no other group to move anybody to.",
  noGroup: "That group isn’t one of this run’s groups.",
  changed: "Something changed while you were looking. Check the page, then press again.",
} as const;

/** "Leo hasn’t been told a group yet. Groups that haven’t gone out are changed in Arrange and told at Publish." */
export function notToldWords(firstName: string): string {
  return `${line(firstName) || "They"} hasn’t been told a group yet. Groups that haven’t gone out are changed in Arrange and told at Publish.`;
}

/** "Leo facilitates Group B, so Leo sits only in Group B." */
export function facilitatesWords(firstName: string, facilitatedName: string): string {
  const first = line(firstName) || "They";
  const group = groupName(facilitatedName);
  return `${first} facilitates ${group}, so ${first} sits only in ${group}.`;
}

/** "Group F no longer meets." */
export function archivedWords(toName: string): string {
  return `${groupName(toName)} no longer meets.`;
}

/** "Leo is already in Group F." */
export function alreadyInWords(firstName: string, toName: string): string {
  return `${line(firstName) || "They"} is already in ${groupName(toName)}.`;
}

/** "Group F is full: 6 of 6. Raise its capacity on the Groups tab first." */
export function fullWords(toName: string, count: number, capacity: number): string {
  return `${groupName(toName)} is full: ${count} of ${capacity}. Raise its capacity on the Groups tab first.`;
}

/**
 * The week rule's refusals, with the names, weeks and times filled in:
 *  - "Group F has already met for week 2, so Leo can’t join it for that week.
 *    To move Leo from week 3, come back after Group C’s week 2 session (Wed
 *    11 Nov, 5pm)."
 *  - "Group C has no sessions left, so there is nothing to move Leo from."
 *  - "Group F has no session for week 3."
 */
export function newHasMetWords(input: { firstName: string; toName: string; fromName: string; weekNumber: number; dateKey: string; startTimeLocal: string }): string {
  const first = line(input.firstName) || "they";
  const when = sessionWhenWords(input.dateKey, input.startTimeLocal);
  return (
    `${groupName(input.toName)} has already met for week ${input.weekNumber}, so ${first} can’t join it for that week. ` +
    `To move ${first} from week ${input.weekNumber + 1}, come back after ${possessive(groupName(input.fromName))} week ${input.weekNumber} session${when ? ` (${when})` : ""}.`
  );
}

/** "Group C has no sessions set, so there is nothing to move Leo from." */
export function oldHasNoneSetWords(firstName: string, fromName: string): string {
  return `${groupName(fromName)} has no sessions set, so there is nothing to move ${line(firstName) || "them"} from.`;
}

/** "Group C still has a week 4 session to come (Fri 20 Nov, 3pm). Move Leo after that session." */
export function oldStillToComeWords(input: { firstName: string; fromName: string; weekNumber: number; dateKey: string; startTimeLocal: string }): string {
  const when = sessionWhenWords(input.dateKey, input.startTimeLocal);
  return `${groupName(input.fromName)} still has a week ${input.weekNumber} session to come${when ? ` (${when})` : ""}. Move ${line(input.firstName) || "them"} after that session.`;
}

/** "Group C no longer meets, so there is nothing to move Leo from.": the group they are in now is archived. */
export function oldNoLongerMeetsWords(firstName: string, fromName: string): string {
  return `${groupName(fromName)} no longer meets, so there is nothing to move ${line(firstName) || "them"} from.`;
}

export function oldHasNoneLeftWords(firstName: string, fromName: string): string {
  return `${groupName(fromName)} has no sessions left, so there is nothing to move ${line(firstName) || "them"} from.`;
}

export function newHasNoneWords(toName: string, weekNumber: number): string {
  return `${groupName(toName)} has no session for week ${weekNumber}.`;
}

/** 409: the week or the count changed between the page and the press. */
export function changedWords(weekNumber: number, emails: number): string {
  return `The move is now from week ${weekNumber} and emails ${emails === 1 ? "1 person" : `${emails} people`}. Check the page, then press again.`;
}

/** What the press says once it is done. */
export function movedWords(input: { firstName: string; toName: string; weekNumber: number; sent: number; failed: number }): string {
  const first = line(input.firstName) || "They";
  const base = `${first} is in ${groupName(input.toName)} from week ${input.weekNumber}.`;
  const sent = input.sent === 1 ? " 1 email sent." : input.sent > 1 ? ` ${input.sent} emails sent.` : "";
  const failed = input.failed > 0 ? ` ${input.failed === 1 ? "1 email" : `${input.failed} emails`} could not be sent; the move is kept.` : "";
  return `${base}${sent}${failed}`;
}

/** On the People tab's row and a group page's row: the way in. */
export const MOVE_LINK = "Move to another group";

/** The page's title when it cannot name anybody, and its way back. */
export const MOVE_PAGE_TITLE = "Move to another group for good";
export const BACK_TO_PEOPLE = "Go to People";
/** The no-script form's button: show what a move to the chosen group would do. */
export const SHOW_WHAT_HAPPENS = "Show what happens";
/** Over a refusal in place of the button. */
export const CANT_MOVE_YET = "This move can’t be made yet";
