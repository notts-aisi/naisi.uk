import { dayAndClockWords } from "@/lib/courses/writtenAnswerWords";
import { londonDayLabel } from "@/lib/courses/londonLabels";

/**
 * THE WORDS OF A PERSON'S PAGE: the team's page under a programme
 * (`.../programmes/[programmeId]/people/[uid]`) and a facilitator's cut of it
 * behind their group's door (`/learn/[runId]/group/[groupId]/people/[uid]`).
 * Staff words only: no member ever reads this page. Every time is printed
 * through the house clock (`dayAndClockWords`, `londonDayLabel`).
 */

export const COURSEWORK = "Coursework";
export const COURSEWORK_HINT = "Each week as it was set for them. Read a week to see what they wrote, with the question beside each answer.";
export const ATTENDANCE = "Attendance";
export const ATTENDANCE_HINT = "From the registers. Counts only.";
export const FEEDBACK = "Feedback";
export const FEEDBACK_WHO = "They see these on their week pages";
export const APPLICATION = "Application";
export const EVENTS_WHO = "Admins only";
export const ACTIVITY = "Activity";
export const ACTIVITY_WHO = "Admins only";
export const ACTIVITY_HINT = "From their coursework and their place, newest first.";

export const WEEK = "Week";
export const DONE = "Done";
export const READINGS = "Readings";
export const REFLECTION = "Reflection";
export const WRITTEN_ANSWER = "Written answer";
export const TEAM_RATING = "Team rating";

export const IN_THE_ROOM = "In the room";
export const ONLINE = "Online";

export const NO_WEEKS = "No week of this programme is written yet, so there is no coursework to show.";
export const NO_REGISTERS = "No register has marked them yet.";
export const NO_FEEDBACK = "Nobody has given them feedback yet.";
export const NO_ACTIVITY = "Nothing recorded yet.";
export const NOT_IN_A_GROUP = "Not in a group yet";
export const NOT_TOLD = "Not told yet";
export const NOT_WRITTEN = "Not written";
export const NOT_SENT = "Not sent";
export const NOT_RATED = "Not rated";
export const NONE_ASKED = "None this week";
export const STILL_TO_COME = "Still to come";
export const NOT_MARKED = "Not marked";
export const DID_NOT_HAPPEN = "Didn’t happen";

export const PERSON_NOT_HERE_TITLE = "Nobody to show here";
export const PERSON_NOT_HERE = "There is nobody by that address on this programme, or they aren’t yours to read here.";
export const BACK_TO_PEOPLE = "Go to People";

/** The facilitator's line at the foot of their cut. */
export const FACILITATOR_FOOT =
  "You see their work and attendance for your group, and the feedback you wrote. Applications, notes and contact details are for the programme team.";
export const YOUR_FEEDBACK = "Your feedback";
export const YOUR_FEEDBACK_NONE = "You haven’t written them any feedback yet.";
export const BACK_TO_GROUP = "Back to the group";

/** "Read week 2". */
export function readWeekWords(weekNumber: number): string {
  return `Read week ${weekNumber}`;
}

/** "Week 2 · Wed 11 Nov", or "Week 2" with no date. */
export function weekLineWords(weekNumber: number, dateLabel: string | null): string {
  return dateLabel ? `Week ${weekNumber} · ${dateLabel}` : `Week ${weekNumber}`;
}

/** "Saved Mon 9 Nov, 9:02pm". */
export function savedWords(at: Date): string {
  return `Saved ${dayAndClockWords(at)}`;
}

/** "Sent Thu 5 Nov, 2:02pm", with " · late" when it was. */
export function sentWords(at: Date, late: boolean): string {
  return `Sent ${dayAndClockWords(at)}${late ? " · late" : ""}`;
}

/** "Started", for an answer begun and never sent. */
export const ANSWER_STARTED = "Started, not sent";

/** "2 of 3". */
export function readingsWords(ticked: number, of: number): string {
  return `${ticked} of ${of}`;
}

/** "7 of 10 · Claudia", or "7 of 10" with no name on record. */
export function ratingWords(rating: number, by: string): string {
  return by ? `${rating} of 10 · ${by}` : `${rating} of 10`;
}

/** "Rahul, Sat 7 Nov", or "Sat 7 Nov" with no name on record. */
export function feedbackByWords(by: string, at: Date | null): string {
  const day = at ? londonDayLabel(at) : "";
  return [by, day].filter(Boolean).join(", ");
}

/** "Week 1 written answer", "Week 1 as a whole". */
export function feedbackOnWords(weekNumber: number, on: "writtenAnswer" | "week"): string {
  return on === "writtenAnswer" ? `Week ${weekNumber} written answer` : `Week ${weekNumber} as a whole`;
}

/** "Wednesdays at 3pm", with the group: "Group C · Wednesdays at 3pm". */
export function groupLineWords(group: string, when: string | null): string {
  return when ? `${group} · ${when}` : group;
}

/** "Weeks 1 and 2 were with another group." for a facilitator, who is never told which. */
export function elsewhereWords(weeks: readonly number[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return `Week ${weeks[0]} was with another group.`;
  const head = weeks.slice(0, -1).join(", ");
  return `Weeks ${head} and ${weeks[weeks.length - 1]} were with another group.`;
}

/** The activity lines. */
export function savedReflectionWords(weekNumber: number): string {
  return `Saved a reflection in week ${weekNumber}`;
}
export function sentAnswerWords(weekNumber: number): string {
  return `Sent week ${weekNumber}’s written answer`;
}
/** Never a group's name: a move keeps the day Publish first told them, so a name could pair the wrong group with it. */
export const TOLD_THEIR_GROUP = "Publish told them their group";
export function feedbackEmailedWords(weekNumber: number): string {
  return `Emailed feedback on week ${weekNumber}`;
}

/** When an activity line happened. */
export function activityWhenWords(at: Date): string {
  return dayAndClockWords(at);
}
