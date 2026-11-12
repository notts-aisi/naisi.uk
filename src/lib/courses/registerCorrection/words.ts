import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { countsWords } from "@/lib/courses/registerCover/words";
import type { FinishCounts } from "@/lib/courses/registerCover/model";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";

/**
 * THE WORDS OF CORRECTING A FINISHED REGISTER, in one place: a line as the
 * register's page says it, the refusals of the correction routes and the
 * request routes, and the sentences a group's history keeps. No server
 * imports, so a page in the browser can say the same thing.
 *
 * Times are put into words by the house clock (`londonLabels`): "9:40am",
 * "Tue 10 Nov".
 */

/** A line as the register's page says it: "In the room", "Arrived late, online", "Absent", "Not set". */
export function lineWords(mark: AttendanceStatus | null, online: boolean): string {
  switch (mark) {
    case "present":
      return online ? "Online" : "In the room";
    case "late":
      return online ? "Arrived late, online" : "Arrived late, in the room";
    case "left-early":
      return online ? "Left early, online" : "Left early, in the room";
    case "absent":
      return "Absent";
    case "excused":
      return "Excused";
    default:
      return "Not set";
  }
}

/** "1 line" or "5 lines". */
export function linesWords(count: number): string {
  return count === 1 ? "1 line" : `${count} lines`;
}

/** "week 3’s register", or "the register of week 3’s session 2" for a week's second session. */
export function registerWords(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `the register of week ${weekNumber}’s session ${occurrence}` : `week ${weekNumber}’s register`;
}

/** The same, starting a sentence. */
export function registerWordsCapital(weekNumber: number, occurrence: number): string {
  const said = registerWords(weekNumber, occurrence);
  return `${said[0].toUpperCase()}${said.slice(1)}`;
}

/** "Week 3", or "Week 3’s session 2". */
export function sessionLabel(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `Week ${weekNumber}’s session ${occurrence}` : `Week ${weekNumber}`;
}

/** "Why: “...”", or "" with no reason. */
export function whyQuoted(reason: string): string {
  const said = reason.replace(/\s+/g, " ").trim();
  return said ? `Why: “${said}”` : "";
}

/**
 * "at 9:40am" when it was asked on the London day it was corrected, "on Tue
 * 10 Nov at 9:40am" otherwise.
 */
export function askedWhenWords(askedAt: Date, correctedAt: Date): string {
  const sameDay = londonDayLabel(askedAt) === londonDayLabel(correctedAt);
  return sameDay ? `at ${londonClockLabel(askedAt)}` : `on ${londonDayLabel(askedAt)} at ${londonClockLabel(askedAt)}`;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/** The correction routes' refusals. */
export const CORRECTION_REFUSAL = {
  body: "Expected a JSON object body.",
  /** A page from before reasons were asked sent none: one plain sentence. */
  oldPage: "A correction needs a reason now. Reload the page, and say why.",
  reason: "Say why it’s being corrected.",
  reasonText: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason.",
  /** A facilitator of the group, after Finish. */
  facilitator: "A finished register is corrected by an admin or the programme’s lead. Ask for a correction on the line instead.",
  /** The held switch, sent to a line's correction. */
  held: "Whether a session happened is corrected for the whole column: choose It didn’t happen or It did happen.",
  flag: "Expected true or false.",
  kind: "Choose what was wrong.",
  notFinished: "That register isn’t finished, so it’s still its facilitators’ to change.",
  noRegister: "There’s no register for that session yet.",
  alreadyNotHeld: "That register already says the session didn’t happen. Choose It did happen to put it back.",
  nothingInTheRoom: "Nobody on this register is down as in the room, so there’s nothing to change.",
  nothingToMove: "There are no lines on this register to move.",
  nothingToClear: "There are no lines on this register to clear.",
  toWeek: "Choose the week whose session these lines belong to.",
  sameWeek: "Choose another week: these lines are on this week’s register already.",
  pace: "Choose keep pace or push the rest back.",
  date: "Say the session’s date as it was shown.",
  tell: "Choose whether to tell the group.",
  emailCount: "Say how many people the button said it would email.",
  /** It did happen, asked of a session nothing says did not happen. */
  happened: "That session happened, as far as its register says, so there’s nothing to put back.",
  /** It did happen, for a week whose cancel pushed the rest back. */
  pushedBack: "The weeks after it have moved since, so that’s a change of time, not a correction: change it on the group’s page.",
  /** It did happen, for a session whose start has not come. */
  notYet: "That session hasn’t started yet, so it can’t have happened.",
  lines: "Say how each person was there: in the room, online, absent, arrived late, left early or excused.",
  lineUnknown: "Somebody on that list isn’t on this register.",
  changed: "That session has just changed. Check it, and press again.",
} as const;

/**
 * It didn't happen, or It did happen, asked of a week's second session:
 * whether a session happened is changed for a week's first session only (a
 * week's change of time is the week's, and moves its first session).
 */
export function secondSessionWords(weekNumber: number): string {
  return `Whether a session happened is changed for a week’s first session only, and this is week ${weekNumber}’s second.`;
}

/** A person on the register the press did not say anything about. */
export function lineMissingWords(name: string): string {
  return `Say how ${name} was there.`;
}

/** The week the lines would move to has a register somebody took. */
export function targetTakenWords(weekNumber: number): string {
  return `Week ${weekNumber}’s register has been taken, so these lines can’t move there.`;
}

/** The week the lines would move to has not met yet. */
export function targetNotStartedWords(weekNumber: number): string {
  return `Week ${weekNumber}’s session hasn’t happened yet, so these lines can’t belong to it.`;
}

/** The week the lines would move to did not happen. */
export function targetCancelledWords(weekNumber: number): string {
  return `Week ${weekNumber}’s session didn’t happen, so these lines can’t belong to it.`;
}

/** The week the lines would move to is being covered by somebody. */
export function targetCoveredWords(weekNumber: number): string {
  return `Somebody is covering week ${weekNumber}’s register, so these lines can’t move there.`;
}

/** The week the lines would move to is not one of the group's sessions. */
export function targetMissingWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t one of this group’s sessions.`;
}

/** The request routes' refusals. */
export const REQUEST_REFUSAL = {
  body: "Expected a JSON object body.",
  notFound: "Request not found",
  week: "Say which week’s session this is about.",
  person: "Say whose line this is about.",
  to: "Choose what the line should say.",
  reason: "Say why it should change.",
  reasonText: "The reason must be text.",
  reasonLine: "The reason must be one line.",
  reasonLink: "Leave links out of the reason.",
  /** Somebody who corrects registers themselves asked. */
  corrects: "You can correct this register yourself, so there’s nothing to ask.",
  /** The register is not finished. */
  notFinished: "That register isn’t finished, so you can still change it yourself.",
  /** A correction for this line is waiting already. */
  waiting: "There’s already a correction waiting for that line.",
  /** The session did not happen. */
  notHeld: "That session didn’t happen, so there’s no line to correct.",
  /** Only the asker withdraws. */
  notYours: "Only the person who asked can withdraw it.",
  withdrawn: "That request was withdrawn.",
  decided: "That request has been decided already.",
  /** The asker cannot approve or decline their own request. */
  ownRequest: "You asked for this, so somebody else decides it.",
  reply: "Write a reply to say why it’s declined.",
  replyText: "The reply must be text.",
  replyLink: "Leave links out of the reply.",
  alreadyYours: "You have it already.",
  /** The register or the person is gone from the group. */
  gone: "That line isn’t on the register any more, so nothing was changed. Decline the request to close it.",
} as const;

/** The line already says what the request asks for. */
export function askSameWords(words: string): string {
  return `That line already says ${words}.`;
}

/** The line no longer says what the request says it does: approving would correct something else. */
export function lineChangedWords(nowSays: string): string {
  return `That line now says ${nowSays}, not what the request says it did, so nothing was changed. The request is still waiting.`;
}

/** "The reason must be 300 characters or fewer." */
export function tooLongWords(what: "reason" | "reply", max: number): string {
  return `The ${what} must be ${max} characters or fewer.`;
}

// ---------------------------------------------------------------------------
// The group's history
// ---------------------------------------------------------------------------

/**
 * "Corrected week 1’s register: Daniel Kim, Absent to In the room. Asked by
 * Rahul at 9:40am. Why: “Daniel was there all session.”"
 */
export function lineCorrectedDetail(input: {
  weekNumber: number;
  occurrence: number;
  name: string;
  from: string;
  to: string;
  reason: string;
  asked: { firstName: string; at: Date } | null;
  at: Date;
}): string {
  const asked = input.asked
    ? ` Asked by ${input.asked.firstName.trim() || "a facilitator"} ${askedWhenWords(input.asked.at, input.at)}.`
    : "";
  const why = whyQuoted(input.reason);
  return `Corrected ${registerWords(input.weekNumber, input.occurrence)}: ${input.name}, ${input.from} to ${input.to}.${asked}${why ? ` ${why}` : ""}`;
}

/** "Name In the room, Name Absent", or "" for more than a sentence can carry. */
function namedLines(lines: readonly { name: string; words: string }[]): string {
  if (lines.length === 0 || lines.length > 12) return "";
  return lines.map((line) => `${line.name} ${line.words}`).join(", ");
}

/** "Corrected week 1’s register: it was held online. 5 lines from In the room to Online. Why: “...”" */
export function heldOnlineDetail(weekNumber: number, occurrence: number, count: number, reason: string): string {
  const why = whyQuoted(reason);
  return `Corrected ${registerWords(weekNumber, occurrence)}: it was held online. ${linesWords(count)} from In the room to Online.${why ? ` ${why}` : ""}`;
}

/**
 * "Moved week 1’s register to week 2: its 5 lines belonged to that session.
 * They replaced what was on week 2’s register: Dev Kim Excused (said in
 * advance). Why: “...”"
 */
export function movedDetail(
  from: { weekNumber: number; occurrence: number },
  to: { weekNumber: number; occurrence: number },
  count: number,
  reason: string,
  replaced: readonly { name: string; words: string }[] = [],
): string {
  const target = to.occurrence > 1 ? `week ${to.weekNumber}’s session ${to.occurrence}` : `week ${to.weekNumber}`;
  const named = namedLines(replaced);
  const over =
    replaced.length === 0
      ? ""
      : ` They replaced ${named ? "what was" : `${linesWords(replaced.length)}`} on ${registerWords(to.weekNumber, to.occurrence)}${named ? `: ${named}` : ""}.`;
  const why = whyQuoted(reason);
  return `Moved ${registerWords(from.weekNumber, from.occurrence)} to ${target}: its ${linesWords(count)} belonged to that session.${over}${why ? ` ${why}` : ""}`;
}

/** "Cleared week 1’s register: it was taken for the wrong session. 5 lines cleared: Aisha Rahman In the room, … Why: “...”" */
export function clearedDetail(
  weekNumber: number,
  occurrence: number,
  lines: readonly { name: string; words: string }[],
  reason: string,
): string {
  const named = namedLines(lines);
  const why = whyQuoted(reason);
  return (
    `Cleared ${registerWords(weekNumber, occurrence)}: it was taken for the wrong session. ` +
    `${linesWords(lines.length)} cleared${named ? `: ${named}` : ""}.${why ? ` ${why}` : ""}`
  );
}

/** "Week 1 did happen, and is back in everyone’s attendance: 2 in the room, 3 absent. Why: “...”" */
export function didHappenDetail(weekNumber: number, occurrence: number, counts: FinishCounts, reason: string): string {
  const said = countsWords(counts);
  const why = whyQuoted(reason);
  return `${sessionLabel(weekNumber, occurrence)} did happen, and is back in everyone’s attendance${said ? `: ${said}` : ""}.${why ? ` ${why}` : ""}`;
}
