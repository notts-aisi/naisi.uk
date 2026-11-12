import { clockWords, dayWords, hoursWords, roomAndCampusWords, ROOM_TO_BE_CONFIRMED_LINE } from "../sessionChange/words";

/**
 * THE WORDS OF "FROM A WEEK ONWARDS": a group's new regular day, time,
 * length, room or campus from one week on
 * (`POST /api/courses/groups/[groupId]/session/regular`). The route's
 * refusals, and the notice the group and its facilitators are sent, in the
 * design's words where it gives them ("Group A now meets on Tuesdays,
 * 5:30pm" / "From today, Tue 10 Nov, Group A meets on Tuesdays, 5:30pm to
 * 7:30pm.") and in the same voice where it does not.
 *
 * Pure: the house's own clock and dates, nothing else.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesdays", from a stored weekday (0 = Sunday). "" for none. */
export function weekdaysWords(weekday: number): string {
  const day = WEEKDAYS[weekday];
  return day ? `${day}s` : "";
}

export const REGULAR_REFUSAL = {
  body: "Expected a JSON object body.",
  week: "Say which week the new time starts from.",
  weekday: "Choose the day it meets.",
  time: "Write the time like 6pm.",
  length: "Choose how long each session is, up to 8 hours.",
  room: "Say which room it’s in, or tick Room to be confirmed.",
  roomOrToBeConfirmed: "Either type the room or tick Room to be confirmed, not both.",
  roomLink: "A room can’t be a link. Set the meeting link instead.",
  campus: "Choose University Park, Jubilee or Online.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason. It goes into an email, and a link to a session never does.",
  tell: "Choose whether to tell the group.",
  emailCount: "Say how many people the button said it would email.",
  flag: "Expected true or false.",
  gone: "That group isn’t on this programme any more.",
  notTaught: "That isn’t one of the group’s weeks. Choose a week it meets in.",
  same: "That’s already when and where the group meets. Change the day, the time, the length, the room or the campus.",
  full: "This would set more of the group’s weeks apart than a group can hold (20). Ask an admin.",
  overCap: "Too many people to email in one send. Turn off Tell the group, then tell them with an update from Messages.",
  nobodyToEmail: "Nobody in the group can be emailed yet. Turn off Tell the group to change it without telling them.",
} as const;

/** "The reason must be 200 characters or fewer." */
export function reasonTooLongWords(max: number): string {
  return `The reason must be ${max} characters or fewer.`;
}

/** The starting week met: "Week 2 met: its register has been taken. Take ... start from week 3." */
export function startMetWords(weekNumber: number): string {
  return `Week ${weekNumber} met: its register has been taken, so its time can’t change. Start from week ${weekNumber + 1}.`;
}

/** A later week met already, which a new regular time would re-date. */
export function laterMetWords(weekNumber: number): string {
  return `Week ${weekNumber}’s register has been taken, so it met and its time can’t change. Start from week ${weekNumber + 1}.`;
}

/** The starting week's session would land on a time that has passed. */
export function startsInPastWords(weekNumber: number, dateKey: string, hhmm: string): string {
  return `Week ${weekNumber} would then be on ${dayWords(dateKey)}, ${clockWords(hhmm)}, which has passed. Start from week ${weekNumber + 1}, or put week ${weekNumber} right on its own first.`;
}

/** "The number of people this emails has changed to 7. Check it, then press again." */
export function countChangedWords(emails: number): string {
  return `The number of people this emails has changed to ${emails}. Check it, then press again.`;
}

/** "Week 1 stays as it was, on Mon 2 Nov." / "Weeks 1 to 3 stay as they were." */
export function earlierWeeksWords(earlier: readonly { weekNumber: number; dateKey: string }[]): string {
  if (earlier.length === 0) return "";
  if (earlier.length === 1) {
    const [only] = earlier;
    return only.dateKey
      ? `Week ${only.weekNumber} stays as it was, on ${dayWords(only.dateKey)}.`
      : `Week ${only.weekNumber} stays as it was.`;
  }
  const first = earlier[0].weekNumber;
  const last = earlier[earlier.length - 1].weekNumber;
  return earlier.length === 2
    ? `Weeks ${first} and ${last} stay as they were.`
    : `Weeks ${first} to ${last} stay as they were.`;
}

/** What the notice of a new regular time says, before and after "Can you make this time?". */
export type RegularNotice = {
  subject: string;
  /** The lines above the question: when it meets from when, where, and the reason. */
  before: string[];
  /** The line under it: that earlier weeks stay as they were. */
  after: string[];
  /** Whether the email asks "Can you make this time?" (the day or the time changed). */
  asks: boolean;
};

/**
 * THE NOTICE OF A NEW REGULAR TIME. `fromDateKey` is the first session on
 * the new time; `todayKey` names it "today" when it is. An incubator's
 * people are never told the word group: theirs says "your sessions".
 */
export function regularNoticeWords(input: {
  groupName: string;
  incubator: boolean;
  weekday: number;
  hhmm: string;
  minutes: number;
  room: string;
  campusLabel: string;
  reason: string;
  fromDateKey: string;
  todayKey: string;
  earlier: readonly { weekNumber: number; dateKey: string }[];
  dayOrTimeChanged: boolean;
}): RegularNotice {
  const days = weekdaysWords(input.weekday);
  const who = input.incubator ? "Your sessions" : input.groupName;
  const subject = `${who} now ${input.incubator ? "meet" : "meets"} on ${days}, ${clockWords(input.hhmm)}`;
  const from =
    input.fromDateKey === input.todayKey ? `From today, ${dayWords(input.fromDateKey)}` : `From ${dayWords(input.fromDateKey)}`;
  const when = input.incubator
    ? `${from}, your sessions are on ${days}, ${hoursWords(input.hhmm, input.minutes)}.`
    : `${from}, ${input.groupName} meets on ${days}, ${hoursWords(input.hhmm, input.minutes)}.`;
  const where = input.room.trim()
    ? `It meets in ${roomAndCampusWords(input.room, input.campusLabel)}.`
    : ROOM_TO_BE_CONFIRMED_LINE;
  const reason = input.reason.trim();
  const said = reason ? (/[.!?]$/.test(reason) ? reason : `${reason}.`) : "";
  return {
    subject,
    before: [when, where, said].filter(Boolean),
    after: [earlierWeeksWords(input.earlier)].filter(Boolean),
    asks: input.dayOrTimeChanged,
  };
}

// ---------------------------------------------------------------------------
// A group's room, from the Groups tab
// ---------------------------------------------------------------------------

/**
 * "A room set or changed": "Room for Group A: Monica Partridge C10" and
 * "Group A’s room is booked: Monica Partridge C10, University Park, from Tue
 * 17 Nov, 5:30pm." A room taken away says it is to be confirmed.
 */
export function roomNoticeWords(input: {
  groupName: string;
  incubator: boolean;
  room: string;
  campusLabel: string;
  next: { dateKey: string; hhmm: string } | null;
}): { subject: string; lines: string[] } {
  const room = input.room.trim();
  const owner = input.incubator ? "Your sessions’" : `${input.groupName}’s`;
  const from = input.next ? ` from ${dayWords(input.next.dateKey)}, ${clockWords(input.next.hhmm)}` : "";
  if (!room) {
    return {
      subject: input.incubator ? "Your room is to be confirmed" : `Room for ${input.groupName}: to be confirmed`,
      lines: [`${owner} room is no longer booked${from}.`, ROOM_TO_BE_CONFIRMED_LINE],
    };
  }
  const where = input.campusLabel ? `${room}, ${input.campusLabel}` : room;
  return {
    subject: input.incubator ? `Your room: ${room}` : `Room for ${input.groupName}: ${room}`,
    lines: [`${owner} room is booked: ${where}${from}.`],
  };
}
