import type { LengthSource } from "@/lib/applications/handover/times";
import { clockLabel } from "@/lib/applications/review/availabilityView";
import { listInWords } from "@/lib/applications/review/people";
import { NEW_GROUP_SESSION_MINUTES, lengthWords } from "@/lib/courses/sessionLength";

/**
 * What the times picture says, in the words of the st-times board.
 *
 * Times are written the way the site writes them ("9am", "6pm", "7:30pm"),
 * days "Mon" to "Sun" where the board abbreviates and in full where it reads
 * a sentence out.
 *
 * A person is named, and never given a pronoun: the site stores none.
 *
 * Pure, with no server import.
 */

/** Indexed by `Date.getDay()`: 0 is Sunday. */
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayShort = (weekday: number): string => DAY_SHORT[weekday] ?? "";
export const dayLong = (weekday: number): string => DAY_LONG[weekday] ?? "";

/** "Tue 6pm". */
export const whenShort = (weekday: number, start: number): string =>
  `${dayShort(weekday)} ${clockLabel(start)}`;

/** "2 hours", "1 hour", "90 minutes": the one function, kept with the lengths themselves. */
export { lengthWords };

/** "2-hour", "1-hour", "90-minute": the length before "session". */
export function lengthBefore(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`;
}

/** "90 minutes or 2 hours". */
function orWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** The first sentence under the views: how many of the people holding a place said when they are free. */
export function saidSentence(said: number, holders: number, programmeName: string): string {
  if (holders === 0) return `Nobody holds a place on ${programmeName} now.`;
  if (holders === 1) {
    return said === 1
      ? "The only person holding a place has said when they’re free."
      : "The only person holding a place hasn’t said when they’re free.";
  }
  if (said === 0) return `None of the ${holders} people holding a place have said when they’re free.`;
  return `${said} of the ${holders} people holding a place ${said === 1 ? "has" : "have"} said when they’re free.`;
}

/** How long the sessions counted are, and where that length came from. */
export function lengthSentence(source: LengthSource, counted: number): string {
  const counts = `This counts ${lengthBefore(counted)} sessions`;
  if (source.kind === "groups") {
    const said = `Sessions last ${lengthWords(source.minutes)}.`;
    return counted === source.minutes ? said : `${said} ${counts}.`;
  }
  if (source.kind === "mixed") {
    const said = `Your groups’ sessions last ${orWords(source.lengths.map(lengthWords))}.`;
    return counted === source.most ? `${said} ${counts}, the length most of them have.` : `${said} ${counts}.`;
  }
  const said = "No group has a session time yet.";
  return counted === NEW_GROUP_SESSION_MINUTES
    ? `${said} ${counts}, the length a new group starts with.`
    : `${said} ${counts}.`;
}

/** The grid's heading: "Who can make a 2-hour session starting at…". */
export const gridHeading = (minutes: number): string =>
  `Who can make a ${lengthBefore(minutes)} session starting at…`;

/** The grid's caption, for a screen reader: "People free for a 2-hour session, by start time". */
export const gridCaption = (minutes: number): string =>
  `People free for a ${lengthBefore(minutes)} session, by start time`;

/** "Group C meets then." / "Group B and Group D meet then." */
function meetsThen(groupNames: readonly string[]): string {
  if (groupNames.length === 0) return "";
  return ` ${listInWords(groupNames)} ${groupNames.length === 1 ? "meets" : "meet"} then.`;
}

/** A cell read out: "Monday 9am: 3 of 27 free" or "Wednesday 1pm: 11 of 27 free. Group C meets then." */
export function cellLabel(
  weekday: number,
  start: number,
  count: number,
  said: number,
  groupNames: readonly string[],
): string {
  const free = `${dayLong(weekday)} ${clockLabel(start)}: ${count} of ${said} free`;
  return groupNames.length === 0 ? free : `${free}.${meetsThen(groupNames)}`;
}

/**
 * A group's tag in the corner of its cell. The letter after "Group" when a
 * group is named that way ("Group C" is "C"), otherwise the first letter of
 * its name.
 */
export function groupTag(name: string): string {
  const trimmed = name.trim();
  const after = /^group\s+(\S{1,3})$/i.exec(trimmed);
  if (after) return after[1].toUpperCase();
  return (Array.from(trimmed)[0] ?? "?").toUpperCase();
}

/** "22 free". */
export const freeCount = (count: number): string => `${count} free`;

/** "Your 4 groups". */
export const yourGroups = (count: number): string => `Your ${count} ${count === 1 ? "group" : "groups"}`;

/**
 * A group's line under its name: "Thu 6pm · 18 can make it". With the
 * group's own length when the groups' lengths differ:
 * "Thu 6pm · 90 minutes · 12 can make it".
 */
export function groupLine(
  session: { weekday: number; startMinute: number | null; durationMinutes: number },
  canMake: number | null,
  withLength: boolean,
): string {
  if (canMake === null || session.startMinute === null) return "No session time set";
  const when = whenShort(session.weekday, session.startMinute);
  return withLength
    ? `${when} · ${lengthWords(session.durationMinutes)} · ${canMake} can make it`
    : `${when} · ${canMake} can make it`;
}

/** "26 of 27 can make at least one of these times." */
export const fitSentence = (canMakeOne: number, said: number): string =>
  `${canMakeOne} of ${said} can make at least one of these times.`;

/**
 * One person no group suits, by name and with no pronoun: "Joel Adeyemi
 * can’t: free on Fridays only."
 */
export function cantLine(name: string, freeDays: readonly number[], minutes: number): string {
  if (freeDays.length === 0) {
    return `${name} can’t: not free for a ${lengthBefore(minutes)} session at any of these start times.`;
  }
  const days = freeDays.map((weekday) => `${dayLong(weekday)}s`);
  return days.length === 1 ? `${name} can’t: free on ${days[0]} only.` : `${name} can’t: free on ${listInWords(days)}.`;
}

/** "See Joel Adeyemi". */
export const seePerson = (name: string): string => `See ${name}`;
