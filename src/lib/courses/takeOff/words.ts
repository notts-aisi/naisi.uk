import { couldBeFollowed } from "../followable";

/**
 * TAKING SOMEBODY OFF A RUN: every sentence the question asks, the line the
 * press comes back with, and the two emails it sends, the person's and each
 * of their group's facilitators'. The route builds all of them
 * (`POST /api/courses/runs/[runId]/enrolments/[uid]/remove`) from what it
 * read, so the sheet prints what the route says and nothing it worked out
 * itself, and the emails say what the sheet said they would.
 *
 * THE REASON IS IN NO EMAIL. The optional line staff type goes to the person
 * alone, as typed, and nowhere else: not the facilitators' email, not the
 * group's History, not the log.
 *
 * Every sentence stays true in every case the route allows: no group, a group
 * with one facilitator or none, a seat that gives no place back, somebody who
 * gave their place back themselves, a visit still to come. A typed value (a
 * name, a group's name) is printed as typed, on one line; the email's
 * template escapes it.
 *
 * Pure: no reads, no clock. Client safe.
 */

/** One line of typed text, or "". */
function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** "Priya", "Priya and Sam", "Priya, Sam and Ola". */
function andList(items: readonly string[]): string {
  const clean = items.map(line).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/** A group's name with "’s": "Group C’s". */
function possessive(name: string): string {
  return `${line(name)}’s`;
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** "two", or "11". */
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

// ---------------------------------------------------------------------------
// What the question is built from
// ---------------------------------------------------------------------------

/** One visit still to come that taking them off calls off, with how many of its host's facilitators are emailed. */
export type TakeOffVisit = { hostName: string; weekNumber: number; emails: number };

/** Everything the question says, as the route read it. */
export type TakeOffFacts = {
  /** The person as the viewer sees them ("Rahul Mehta" for the committee): the title alone. */
  personName: string;
  /** The name they go by: every other sentence. */
  firstName: string;
  /** "AGI Strategy", or the course's own name for a run no programme names. */
  programmeName: string;
  /** The group their seat is in, or null for no group yet. */
  groupName: string | null;
  /** Their place on the programme goes back on the form. */
  givesPlaceBack: boolean;
  /** They are emailed: they have an address. */
  personEmailed: boolean;
  /** Their group's facilitators who are emailed, by the name each goes by: none unless they were told their group. */
  facilitators: readonly string[];
  /** How many facilitators the group has, emailed or not. */
  groupFacilitators: number;
  /** The visits it calls off with an email to their hosts' facilitators. */
  visits: readonly TakeOffVisit[];
  /** How many people it emails, each counted once. */
  people: number;
};

/** The sheet, as the route answers it: every sentence it prints. */
export type TakeOffSheet = {
  /** "Take Rahul Mehta off AGI Strategy?" */
  title: string;
  /** What happens to the seat and the place, and what is kept. */
  seat: string;
  /** Who is emailed, and to say what. */
  emailed: string;
  /** The box for a line to the person, or null when they are not emailed. */
  box: { label: string; hint: string } | null;
  /** "Keep Rahul". */
  keep: string;
  /** "Take Rahul off and email 3 people". */
  go: string;
};

// ---------------------------------------------------------------------------
// The question
// ---------------------------------------------------------------------------

/** "Take Rahul Mehta off AGI Strategy?" */
export function titleWords(facts: Pick<TakeOffFacts, "personName" | "programmeName">): string {
  return `Take ${line(facts.personName) || "them"} off ${line(facts.programmeName)}?`;
}

/**
 * "Their seat in Group C is freed and their place on AGI Strategy is given
 * back. Their registers and work so far are kept." With no group, the seat's
 * part goes; with no place to give back (the run is past its last session,
 * the seat's place did not come from the form, or they gave it back
 * themselves), the place's part goes.
 */
export function seatWords(facts: Pick<TakeOffFacts, "groupName" | "givesPlaceBack" | "programmeName">): string {
  const group = line(facts.groupName);
  const place = `their place on ${line(facts.programmeName)} is given back`;
  const kept = "Their registers and work so far are kept.";
  if (group && facts.givesPlaceBack) return `Their seat in ${group} is freed and ${place}. ${kept}`;
  if (group) return `Their seat in ${group} is freed. ${kept}`;
  if (facts.givesPlaceBack) return `T${place.slice(1)}. ${kept}`;
  return kept;
}

/**
 * The group's facilitators' sentence, or "": "Priya and Sam, Group C’s
 * facilitators, are emailed to say Rahul has left the group." When some of
 * the group's facilitators are not emailed (the one who pressed, or one with
 * no address), it says how many of them are.
 */
function facilitatorsSentence(facts: Pick<TakeOffFacts, "facilitators" | "groupFacilitators" | "groupName" | "firstName">): string {
  const names = facts.facilitators.map(line).filter(Boolean);
  if (names.length === 0) return "";
  const group = possessive(line(facts.groupName) || "the group");
  const all = names.length >= facts.groupFacilitators;
  const who =
    names.length === 1
      ? all
        ? `${names[0]}, ${group} facilitator,`
        : `${names[0]}, one of ${group} facilitators,`
      : all
        ? `${andList(names)}, ${group} facilitators,`
        : `${andList(names)}, ${numberWord(names.length)} of ${group} facilitators,`;
  return `${who} ${names.length === 1 ? "is" : "are"} emailed to say ${line(facts.firstName)} has left the group.`;
}

/** "Group E’s facilitators are emailed to say Rahul’s week 3 visit is off." One for each visit that emails anybody. */
function visitSentence(visit: TakeOffVisit, firstName: string): string {
  const host = possessive(line(visit.hostName) || "Untitled group");
  const whose = visit.emails === 1 ? `${host} facilitator is` : `${host} facilitators are`;
  return `${whose} emailed to say ${possessive(firstName)} week ${visit.weekNumber} visit is off.`;
}

/**
 * "Rahul is emailed to say their place has ended. Priya and Sam, Group C’s
 * facilitators, are emailed to say Rahul has left the group." Each part only
 * when somebody it names is emailed; "Nobody is emailed." when nobody is.
 */
export function emailedWords(facts: TakeOffFacts): string {
  const first = line(facts.firstName);
  const parts = [
    facts.personEmailed ? `${first} is emailed to say their place has ended.` : "",
    facilitatorsSentence(facts),
    ...facts.visits.filter((visit) => visit.emails > 0).map((visit) => visitSentence(visit, first)),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Nobody is emailed.";
}

/** The button: "Take Rahul off and email 3 people", "Take Rahul off and email Rahul", or "Take Rahul off" when it emails nobody. */
export function goWords(facts: Pick<TakeOffFacts, "firstName" | "people" | "personEmailed">): string {
  const first = line(facts.firstName);
  if (facts.people === 0) return `Take ${first} off`;
  if (facts.people === 1) return facts.personEmailed ? `Take ${first} off and email ${first}` : `Take ${first} off and email 1 person`;
  return `Take ${first} off and email ${facts.people} people`;
}

/** The whole sheet. */
export function sheetWords(facts: TakeOffFacts): TakeOffSheet {
  const first = line(facts.firstName);
  return {
    title: titleWords(facts),
    seat: seatWords(facts),
    emailed: emailedWords(facts),
    box: facts.personEmailed
      ? { label: `A line for ${first} (optional)`, hint: `Only ${first} sees this. The facilitators’ email never carries a reason.` }
      : null,
    keep: `Keep ${first}`,
    go: goWords(facts),
  };
}

/** While the press is on its way. */
export const TAKING_OFF = "Taking them off…";
/** While the question is being asked of the route. */
export const ASKING = "Checking who is emailed…";

/**
 * What the press came to: "Rahul is off AGI Strategy. 3 people were
 * emailed.", or, when not every email went, "Rahul is off AGI Strategy. 2 of
 * 3 emails were sent." A failed send never undoes the removal.
 */
export function doneWords(input: { firstName: string; programmeName: string; people: number; personOnly: boolean; emails: number; sent: number }): string {
  const head = `${line(input.firstName)} is off ${line(input.programmeName)}.`;
  if (input.emails === 0) return `${head} Nobody was emailed.`;
  if (input.sent < input.emails) return `${head} ${input.sent} of ${input.emails} ${input.emails === 1 ? "email was" : "emails were"} sent.`;
  if (input.people === 1) return input.personOnly ? `${head} ${line(input.firstName)} was emailed.` : `${head} 1 person was emailed.`;
  return `${head} ${input.people} people were emailed.`;
}

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

/** 409: the count changed between the question and the press. */
export function changedWords(people: number): string {
  const who = people === 0 ? "nobody" : people === 1 ? "1 person" : `${people} people`;
  return `Taking them off now emails ${who}, so nothing was changed. Check it, then press again.`;
}

/** The question, and a second press, for somebody already off the run. */
export const ALREADY_OFF = "They’re already off the run.";

/** The line for the person: what is wrong with it, said before anything is written. */
export const LINE_LIMIT = 300;
export const LINE_REFUSAL = {
  text: "The line must be text.",
  oneLine: "The line must be one line.",
  link: "Leave links out of the line.",
  long: `The line must be ${LINE_LIMIT} characters or fewer.`,
} as const;

/**
 * The line typed for the person, held the way a reply to somebody's request
 * is held (`parseExcusedReply`): one line, no link, capped. Empty is no line.
 */
export function parseTakeOffLine(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: LINE_REFUSAL.text };
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };
  if (/[\r\n]/.test(value)) return { ok: false, error: LINE_REFUSAL.oneLine };
  if (value.length > LINE_LIMIT) return { ok: false, error: LINE_REFUSAL.long };
  if (couldBeFollowed(value)) return { ok: false, error: LINE_REFUSAL.link };
  return { ok: true, value };
}

/** The limits on how often taking somebody off emails, past which nothing is written or sent. */
export const TAKE_OFF_LIMIT_WORDS = {
  person: (firstName: string, limit: number) =>
    `${line(firstName) || "They"} ${line(firstName) ? "has" : "have"} been taken off this run ${limit} times in the last day, so nothing was changed and nobody was emailed. Try again tomorrow, or ask an admin.`,
  presser: (limit: number) => `You’ve taken people off ${limit} times in the last day, so nothing was changed and nobody was emailed. Try again tomorrow, or ask an admin.`,
  unread: "The limits on these emails couldn’t be checked, so nothing was changed or sent. Try again.",
} as const;

// ---------------------------------------------------------------------------
// The emails
// ---------------------------------------------------------------------------

/** One email's words: its subject and its paragraphs. */
export type TakeOffEmailWords = { subject: string; lines: string[] };

/** The reply that reaches a person: every email of this kind closes on it. */
const REPLY = "reply to this email and it reaches the NAISI team.";

/**
 * To the person: "Your place on AGI Strategy has ended". "and you’re no
 * longer in Group C" only for somebody Publish had told their group; "as you
 * asked" for somebody who had given their place back themselves. The line
 * typed for them, if any, as its own paragraph, exactly as typed.
 */
export function personEmailWords(input: {
  firstName: string;
  programmeName: string;
  runLabel: string;
  /** The group they had been told, or null. */
  toldGroupName: string | null;
  /** They had given their place back themselves. */
  asked: boolean;
  /** The line typed for them, or "". */
  line: string;
}): TakeOffEmailWords {
  const programme = line(input.programmeName);
  const label = line(input.runLabel);
  const first = line(input.firstName);
  const group = line(input.toldGroupName);
  const opening = first ? `Hi ${first}, your place` : "Your place";
  const ended =
    `${opening} on ${programme}${label ? ` (${label})` : ""} has ended` +
    `${input.asked ? ", as you asked" : ""}` +
    `${group ? `, and you’re no longer in ${group}` : ""}.`;
  const typed = typeof input.line === "string" ? input.line.trim() : "";
  return {
    subject: `Your place on ${programme} has ended`,
    lines: [
      ended,
      ...(typed ? [typed] : []),
      `Your work so far stays on your account. If you think this is a mistake, or you’d like to talk about it, ${REPLY}`,
    ],
  };
}

/**
 * To each of the group's facilitators: "Rahul has left Group C". "They come
 * off your register from week 3" names the group's next session still to
 * come (`registerWeek`), and goes when the group has no session left.
 */
export function facilitatorEmailWords(input: {
  facilitatorFirstName: string;
  personFirstName: string;
  groupName: string;
  programmeName: string;
  /** The week of the group's next session that has not started, or null when none is left. */
  registerWeek: number | null;
}): TakeOffEmailWords {
  const person = line(input.personFirstName) || "Somebody";
  const group = line(input.groupName) || "your group";
  const greeting = line(input.facilitatorFirstName) ? `Hi ${line(input.facilitatorFirstName)}, ` : "";
  const opening = `${greeting}${person} is no longer in ${group} on ${line(input.programmeName)}.`;
  const register = input.registerWeek !== null ? ` They come off your register from week ${input.registerWeek}.` : "";
  return {
    subject: `${person} has left ${group}`,
    lines: [`${opening}${register} You don’t need to do anything. Questions? Reply to this email and it reaches the NAISI team.`],
  };
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** The group's History, under People: "Maya Rao took Rahul Mehta off the run." Never the line typed for them. */
export function historyWords(actorName: string, personName: string): string {
  return `${line(actorName) || "Somebody"} took ${line(personName) || "somebody"} off the run.`;
}

/** Course run's "Taken off the programme": who took them off and when, as far as the seat says. "" for neither. */
export function takenOffByWords(byName: string | null, dayLabel: string | null): string {
  const by = line(byName);
  const day = line(dayLabel);
  if (by && day) return `Taken off by ${by} on ${day}`;
  if (by) return `Taken off by ${by}`;
  if (day) return `Taken off on ${day}`;
  return "";
}
