import { ATTENDANCE_STATUS_LABEL, type AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { factWords, type ExcuseFact } from "./words";

/**
 * THE WORDS A GROUP'S FACILITATORS AND THE PROGRAMME'S LEAD READ ABOUT
 * REQUESTS TO BE EXCUSED, on the register and the group's page: one of two
 * facts per person per session ("Asked to be excused, waiting" or
 * "Excused"), and nothing else. Nothing here takes a reason, a reply, who
 * decided or how often: the facts are all these readers are sent.
 *
 * Nothing here asks them to do anything either: a waiting request never
 * holds a register up, and their own entry on the day wins over an approval.
 * No dash of either kind. Pure, with no server import.
 */

export { ASKED_WAITING, EXCUSED, factWords } from "./words";

/** "Week 3", or "Week 3, session 2", from a register's session key ("w03", "w03-2"). */
export function sessionKeyWords(sessionKey: string): string {
  const match = /^w(\d{2,3})(?:-(\d))?$/.exec(sessionKey);
  if (!match) return "";
  const week = Number(match[1]);
  return match[2] ? `Week ${week}, session ${Number(match[2])}` : `Week ${week}`;
}

/** Over the register: who has asked about a session still to come. */
export const ASKED_TITLE = "Asked to be excused";

/** "Week 3: Tom Fisher", one row over the register. */
export function excuseRowWords(sessionKey: string, name: string): string {
  const week = sessionKeyWords(sessionKey);
  return week ? `${week}: ${name}` : name;
}

/** Under a waiting fact: nothing for the facilitator to do, and never why. */
export const IF_APPROVED = "If it’s approved, Absent becomes Excused by itself. You never see why.";

/**
 * Excused, and they came after all: the facilitator's own entry counts.
 * "Grace came after all, so In the room counts. Being excused stays on
 * Grace’s request; nothing else changes."
 */
export function cameAfterAllWords(firstName: string, mark: AttendanceStatus, online: boolean): string {
  const who = firstName.trim() || "They";
  // Present in the room reads as the register's own words, "In the room".
  const counts = online ? "Online" : mark === "present" ? "In the room" : ATTENDANCE_STATUS_LABEL[mark];
  return `${who} came after all, so ${counts} counts. Being excused stays on ${firstName.trim() ? `${firstName.trim()}’s` : "their"} request; nothing else changes.`;
}

/** "Excused for week 2", beside a person on the group's page. */
export function excusedForWeekWords(weekNumber: number): string {
  return `Excused for week ${weekNumber}`;
}

/** What the people running a group see about excused weeks, said where they see it. */
export const WHAT_YOU_SEE_TITLE = "What you see about excused weeks";
export const WHAT_YOU_SEE =
  "Only Excused, or Asked to be excused, waiting. Never the reason, and never how often. Excused people still get the week’s reminders, and their work is read as anyone’s.";

/** A fact, said to a screen reader after a cell's mark. */
export function factForScreenReader(fact: ExcuseFact): string {
  return `${factWords(fact)}.`;
}
