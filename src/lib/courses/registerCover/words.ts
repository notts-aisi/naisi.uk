import { clockWords, dayWords, endClockWords, namesWords } from "@/lib/courses/sessionChange/words";
import type { FinishCounts } from "./model";

/**
 * THE WORDS OF COVERING A REGISTER, in one place: the cover route's
 * refusals, the email to somebody given a session, the optional notice to
 * the group, the register's own refusals for what is no longer its to do,
 * and the sentences a group's history keeps. No server imports, so a page
 * in the browser can say the same thing.
 *
 * Dates are civil dates ("2026-11-10") and times stored "HH:MM", put into
 * words by the session change's own helpers, so the house clock is the one
 * every email and page already reads.
 */

export const COVER_REFUSAL = {
  body: "Expected a JSON object body.",
  week: "Say which week’s session this is about.",
  person: "Say who is covering, or leave it out to take it yourself.",
  reason: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason. It goes into the group’s history.",
  tell: "Choose whether to tell the group.",
  emailCount: "Say how many people the button said it would email.",
  flag: "Expected true or false.",
  /** "I'm covering it" with the tick to tell the group: only a session given to somebody is told. */
  tellSelf: "The group is told only when somebody else is covering. Untick Tell the group.",
  /** Somebody who facilitates the group asked to cover it. */
  facilitates: "You facilitate this group, so take the register as usual.",
  /** A session the group does not hold. */
  session: "That isn’t one of this group’s sessions.",
  /** The register is finished. */
  finished: "That register is finished, so nobody can take it now.",
  /** One of the group's facilitators has started the register. */
  started: "One of the group’s facilitators has started this register, so it doesn’t need covering.",
  /** The session has no date, so no day to give it until. */
  undated: "That session has no day or time yet, so it can’t be given to anybody.",
  /** Giving a session to themselves. */
  yourself: "To take it yourself, choose I’m covering it.",
  /** The person given it has no account that stands. */
  noAccount: "That person can’t be given a session: they need an approved account.",
  /** The person given it facilitates the group. */
  theyFacilitate: "They facilitate this group already, so they can take the register as usual.",
  overCap: "Too many people to email in one send. Untick Tell the group.",
  nobodyToEmail: "Nobody in the group can be emailed yet. Untick Tell the group.",
} as const;

/** The count on the button no longer holds: what it would email now. */
export function coverCountChangedWords(emails: number): string {
  return `The group has changed since this was opened: it would now email ${emails === 1 ? "1 person" : `${emails} people`}. Check and press again.`;
}

/** The register's own refusals for what a cover changes. */
export const REGISTER_COVER_REFUSAL = {
  /** A lead, or somebody covering who is not a facilitator, sending the register's notes. */
  notes: "A register’s notes are its facilitators’ and admins’, so this wasn’t saved. Save the marks without them.",
  /** A NEW "didn't happen" on the register's own switch. */
  didNotHappen:
    "It didn’t happen is now under Change this week, where you choose what happens to the weeks after it. Nothing was saved.",
  /** The list of who was here, sent by somebody who does not facilitate the group. */
  hereNotFacilitator: "Only one of the group’s facilitators says which of them were here.",
  /** The list of who was here, naming somebody who is not one of the group's facilitators. */
  hereNotInGroup: "Somebody on that list isn’t one of the group’s facilitators.",
  /** The facilitator record's route: somebody who is not one of the group's facilitators. */
  notAFacilitator: "That person isn’t one of this group’s facilitators.",
  /** The facilitator record's route: a session that has not started. */
  notStarted: "That session hasn’t started yet, so there’s nothing to record.",
  state: "Choose there, arrived late or not there.",
  arrivedAt: "Say when they arrived, between the session’s start and end.",
  sameAsNow: "That’s already what it says.",
} as const;

// ---------------------------------------------------------------------------
// The session as an email says it
// ---------------------------------------------------------------------------

/** What an email or a history row needs to know about the session. */
export type CoverSessionFacts = {
  groupName: string;
  weekNumber: number;
  /** "2026-11-10". */
  dateKey: string;
  /** "16:00". */
  startTimeLocal: string;
  durationMinutes: number;
  /** "Monica Partridge E05", or "" with none. */
  room: string;
  /** Held online that week. */
  online: boolean;
  /** The session falls on today's London date. */
  today: boolean;
};

/** "today, Tue 10 Nov, 4pm to 6pm" or "on Tue 17 Nov, 4pm to 6pm". */
function whenWords(facts: CoverSessionFacts): string {
  const day = dayWords(facts.dateKey);
  const start = clockWords(facts.startTimeLocal);
  const end = endClockWords(facts.startTimeLocal, facts.durationMinutes);
  const time = start && end ? `${start} to ${end}` : start;
  const date = [day, time].filter(Boolean).join(", ");
  return facts.today ? `today, ${date}` : `on ${date}`;
}

/** Where it meets, never a link: the room, "online", or nothing. */
function whereWords(facts: CoverSessionFacts): string {
  if (facts.online) return "online";
  return facts.room.trim();
}

// ---------------------------------------------------------------------------
// The email to somebody given a session (transactional, to one person)
// ---------------------------------------------------------------------------

export type CoverEmailWords = { subject: string; lines: string[]; button: string };

/**
 * "You're covering Group E today at 4pm", and its first lines. Never a
 * meeting link: the register's page is the one link, and it says where.
 */
export function coverEmailWords(facts: CoverSessionFacts, giverFirstName: string): CoverEmailWords {
  const group = facts.groupName.trim() || "a group";
  const start = clockWords(facts.startTimeLocal);
  const when = facts.today ? `today${start ? ` at ${start}` : ""}` : `on ${dayWords(facts.dateKey)}${start ? ` at ${start}` : ""}`;
  const where = whereWords(facts);
  const giver = giverFirstName.trim() || "Somebody running the programme";
  return {
    subject: `You’re covering ${group} ${when}`,
    lines: [
      `${giver} has given you ${group}’s session ${whenWords(facts)}${where ? `, ${where}` : ""}. Take the register, open the check-in and write the report from the link below.`,
      "It’s yours for this session only, until midnight.",
    ],
    button: "Open the register",
  };
}

// ---------------------------------------------------------------------------
// The optional notice to the group (a notice, off unless ticked)
// ---------------------------------------------------------------------------

export type CoverNoticeWords = { subject: string; lines: string[] };

/**
 * "Ola is running today's session": who is running it and that the rest is
 * as usual. Never the reason: why somebody can't make it is not the group's.
 */
export function coverNoticeWords(
  facts: CoverSessionFacts,
  person: { firstName: string; name: string; committee: boolean },
  coveringFirstNames: readonly string[],
): CoverNoticeWords {
  const group = facts.groupName.trim() || "your group";
  const first = person.firstName.trim() || person.name.trim() || "Somebody";
  const full = person.name.trim() || first;
  const start = clockWords(facts.startTimeLocal);
  const which = facts.today ? "today’s session" : `the session on ${dayWords(facts.dateKey)}`;
  const day = facts.today ? "today" : `on ${dayWords(facts.dateKey)}`;
  const where = whereWords(facts);
  const who = person.committee ? `${full} from the committee` : full;
  const at = start ? ` at ${start}` : "";
  const place = where === "online" ? ", online as planned" : where ? `, as usual in ${where}` : "";
  const away = coveringFirstNames.length > 0 ? `${namesWords(coveringFirstNames)} can’t make it ${day}, so ` : "";
  const sentence = away
    ? `${away}${who} is running ${group}’s session${at}${place}.`
    : `${who} is running ${group}’s session ${day}${at}${place}.`;
  return { subject: `${first} is running ${which}`, lines: [sentence] };
}

// ---------------------------------------------------------------------------
// The group's history
// ---------------------------------------------------------------------------

/** "Josh's place", "Josh and Priya's place", or "" when nobody facilitates the group. */
function placeOf(names: readonly string[]): string {
  return names.length > 0 ? `${namesWords(names)}’s place` : "";
}

/** "Took week 2's register in Josh's place." */
export function tookDetail(weekNumber: number, coveringNames: readonly string[], reason: string): string {
  const place = placeOf(coveringNames);
  const base = place ? `Took week ${weekNumber}’s register in ${place}.` : `Took week ${weekNumber}’s register.`;
  return reason ? `${base} Reason: ${reason}` : base;
}

/** "Gave week 2's session to Ola Nowak, in Josh's place." */
export function gaveDetail(
  weekNumber: number,
  personName: string,
  coveringNames: readonly string[],
  reason: string,
  emailedGroup: number,
): string {
  const place = placeOf(coveringNames);
  const base = place
    ? `Gave week ${weekNumber}’s session to ${personName}, in ${place}.`
    : `Gave week ${weekNumber}’s session to ${personName}.`;
  const told = emailedGroup > 0 ? ` The group was told (${emailedGroup === 1 ? "1 person" : `${emailedGroup} people`}).` : "";
  return `${base}${reason ? ` Reason: ${reason}` : ""}${told}`;
}

const PRESENCE_WORDS = { there: "there", late: "arrived late", "not-there": "not there" } as const;

/** "Josh: not there, now there." for a facilitator's entry changed by an admin or a lead. */
export function presenceChangedDetail(
  weekNumber: number,
  facilitatorName: string,
  before: keyof typeof PRESENCE_WORDS | null,
  after: keyof typeof PRESENCE_WORDS,
  arrived: string,
): string {
  const was = before ? PRESENCE_WORDS[before] : "nothing recorded";
  const now = after === "late" && arrived ? `arrived late, at ${arrived}` : PRESENCE_WORDS[after];
  return `Changed whether ${facilitatorName} was at week ${weekNumber}’s session: ${was}, now ${now}.`;
}

/** "3 in the room, 1 online, 1 absent, 1 excused", leaving out what is none; "" for an empty register. */
export function countsWords(counts: FinishCounts): string {
  return [
    counts.room > 0 ? `${counts.room} in the room` : "",
    counts.online > 0 ? `${counts.online} online` : "",
    counts.absent > 0 ? `${counts.absent} absent` : "",
    counts.excused > 0 ? `${counts.excused} excused` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * "Finished week 1's register. 3 in the room, 1 absent, 1 excused.", and
 * ", covering for Josh" when somebody took it in a facilitator's place.
 */
export function finishedDetail(weekNumber: number, counts: FinishCounts, coveringFor: readonly string[]): string {
  const covering = coveringFor.length > 0 ? `, covering for ${namesWords(coveringFor)}` : "";
  const said = countsWords(counts);
  return `Finished week ${weekNumber}’s register${covering}.${said ? ` ${said[0].toUpperCase()}${said.slice(1)}.` : ""}`;
}
