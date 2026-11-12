import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import { dayWords, hoursWords, namesWords, weeksWords } from "@/lib/courses/sessionChange/words";
import type { ExcusedEvent } from "@/lib/firestore/courseExcusedRequests";
import { excusedKindWords, type ExcusedKind } from "./words";

/**
 * THE WORDS ADMINS READ ABOUT A REQUEST TO BE EXCUSED: its row on the
 * Requests page, and its own page (the person, the reason, each week with
 * its decision, what approving will do, who is emailed, how often they have
 * been excused this term, the history). Admins only: nothing here is shown to
 * a facilitator, the programme's lead or the person.
 *
 * Times go through the house clock. Every name and count is a slot filled
 * from a record. No dash of either kind. Pure, with no server import.
 */

const instant = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
};

/** "Mon 9 Nov, 9:43am", or "today, 9:43am" on the day itself. */
function dayAndClock(iso: string | null | undefined, now: Date): string {
  const at = instant(iso);
  if (!at) return "";
  return londonDayLabel(at) === londonDayLabel(now) ? `today, ${londonClockLabel(at)}` : `${londonDayLabel(at)}, ${londonClockLabel(at)}`;
}

/** "week 2", or "week 2, session 2". */
function weekLower(weekNumber: number, occurrence: number): string {
  return occurrence > 1 ? `week ${weekNumber}, session ${occurrence}` : `week ${weekNumber}`;
}

/** "weeks 5 and 6", or "week 2". */
function weeksLower(weeks: readonly { weekNumber: number; occurrence: number }[]): string {
  if (weeks.length === 1) return weekLower(weeks[0].weekNumber, weeks[0].occurrence);
  return weeksWords([...new Set(weeks.map((week) => week.weekNumber))]);
}

// ---------------------------------------------------------------------------
// The Requests page
// ---------------------------------------------------------------------------

/** The card that lists them, for admins. */
export const EXCUSED_LIST_TITLE = "Asked to be excused";

/** A row's kind, beside the person's name. */
export function excusedRowKindWords(weeks: readonly { weekNumber: number; occurrence: number }[]): string {
  return `Excused for ${weeksLower(weeks)}`;
}

/** "Group C, week 2", "Group C, weeks 5 and 6". */
export function excusedRowAboutWords(groupName: string, weeks: readonly { weekNumber: number; occurrence: number }[]): string {
  const group = groupName.trim() || "A group";
  return `${group}, ${weeksLower(weeks)}`;
}

/** Where each week stands, once they differ: "Week 5 approved, week 6 waiting". */
export function excusedRowWeeksWords(weeks: readonly { weekNumber: number; occurrence: number; state: string }[]): string {
  if (weeks.length < 2 || new Set(weeks.map((week) => week.state)).size < 2) return "";
  const parts = weeks.map((week) => `${weekLower(week.weekNumber, week.occurrence)} ${week.state}`);
  const joined = parts.join(", ");
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}`;
}

/** Under the list, for an admin: who reads these, and who is emailed. */
export const EXCUSED_WHO_SEES =
  "Requests to be excused are for admins only: the programme’s lead and the group’s facilitators never see them or the reason. Asking emails the admins, never the reason, unless they switch it off above. Each decision emails the person, and approving emails the group’s facilitators too, without the reason.";

// ---------------------------------------------------------------------------
// One request's page
// ---------------------------------------------------------------------------

/** "Grace Chen: excused for week 2", "Kwame Asante: excused for weeks 5 and 6". */
export function requestTitleWords(name: string, weeks: readonly { weekNumber: number; occurrence: number }[]): string {
  return `${name.trim() || "NAISI member"}: excused for ${weeksLower(weeks)}`;
}

/** "Sent Mon 9 Nov, 9:43am". */
export function sentWords(iso: string | null, now: Date): string {
  const when = dayAndClock(iso, now);
  return when ? `Sent ${when}` : "";
}

/** "AGI Strategy Fellowship · Group C with Rahul Mehta". */
export function personLineWords(programme: string, groupName: string, facilitatorNames: readonly string[]): string {
  const group = groupName.trim();
  const named = facilitatorNames.map((name) => name.trim()).filter(Boolean);
  const withWho = group && named.length > 0 ? `${group} with ${namesWords(named)}` : group;
  return [programme.trim(), withWho].filter(Boolean).join(" · ");
}

/** "“An appointment I can’t move.”" */
export function quoted(text: string): string {
  return `“${text.trim()}”`;
}

export const ASKS_TO_BE_EXCUSED_FROM = "Asks to be excused from";

/** "Week 2 · Wed 11 Nov, 3pm to 5pm · Portland A21". */
export function weekLineWords(input: {
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  startTimeLocal: string;
  durationMinutes: number;
  room: string;
}): string {
  const week = input.occurrence > 1 ? `Week ${input.weekNumber}, session ${input.occurrence}` : `Week ${input.weekNumber}`;
  const day = dayWords(input.dateKey);
  const hours = input.startTimeLocal ? hoursWords(input.startTimeLocal, input.durationMinutes) : "";
  const when = [day, hours].filter(Boolean).join(", ");
  return [week, when, input.room.trim()].filter(Boolean).join(" · ");
}

export const ASKED_AFTER = "Asked after the session.";
export const SESSION_NOT_HAPPENING = "That session isn’t happening now.";

export const OFFERED_FIRST = "Offered first";

/** What the flow offered before the request: today, joining online. */
export function offeredFirstWords(online: boolean, firstName: string): string {
  const who = firstName.trim() || "They";
  return online ? `Joining online. ${who} asked to be excused instead.` : "Nothing else that week.";
}

export const WHAT_WILL_HAPPEN = "What will happen";
export const APPROVING = "Approving";
export const TOLD = "Told";

/** After approving's own words: the week's work goes on, as the rules say. */
export function workCarriesOnWords(weekNumber: number): string {
  return `Week ${weekNumber}’s work and reminders carry on, and late counts from the session as for anyone.`;
}

/** "Nadia finished the register at 8:05pm with Tom as Absent.", over approving a correction. */
export function finishedAbsentWords(finisherFirstName: string, at: string, personFirstName: string, now: Date): string {
  const when = instant(at);
  const who = finisherFirstName.trim() || "A facilitator";
  const person = personFirstName.trim() || "them";
  if (!when) return `${who} finished the register with ${person} as Absent.`;
  const clock = londonDayLabel(when) === londonDayLabel(now) ? `at ${londonClockLabel(when)}` : `on ${londonDayLabel(when)} at ${londonClockLabel(when)}`;
  return `${who} finished the register ${clock} with ${person} as Absent.`;
}

/** "Reply to Grace". */
export function replyToWords(firstName: string): string {
  return `Reply to ${firstName.trim() || "them"}`;
}

export const REPLY = "Reply";

/** Under the reply, with several weeks: each is decided on its own. */
export const ONE_EMAIL_PER_DECISION = "Each week is decided on its own, and each decision is one email to the person.";

/** Under the buttons: declining needs the reply. */
export const DECLINE_NEEDS_A_REPLY = "Declining needs a reply, which the person reads.";

/** A reply without deciding, under its button. */
export function replyEmailsWords(firstName: string): string {
  return `${firstName.trim() || "The person"} is emailed the reply, and the request keeps waiting.`;
}

export const SAVING = "Saving…";

/** Said over the decision when the person left the group, was moved, or the group was archived. */
export function leftGroupWords(firstName: string): string {
  return `${firstName.trim() || "They"} isn’t in this group any more, so approving would change nothing and is refused. Decline it, with a reply, to close it.`;
}

/** What a decision did, from the route's answer. */
export function decidedSaidWords(input: {
  action: "approve" | "decline" | "reply";
  firstName: string;
  person: string;
  facilitators: number;
}): string {
  const who = input.firstName.trim() || "The person";
  const personSent = input.person === "sent";
  const told =
    input.action === "approve"
      ? [personSent ? who : "", input.facilitators > 0 ? `${input.facilitators === 1 ? "1 facilitator" : `${input.facilitators} facilitators`}` : ""].filter(Boolean)
      : [personSent ? who : ""].filter(Boolean);
  const emailed = told.length > 0 ? ` Emailed ${namesWords(told)}.` : " Nobody was emailed.";
  const head = input.action === "approve" ? "Approved." : input.action === "decline" ? "Declined." : "Replied.";
  return `${head}${emailed}`;
}

/** A decided week: "Approved by Zach, Mon 9 Nov, 11:15am", "Withdrawn by Grace, today, 11:20am". */
export function decidedWeekWords(input: {
  status: "approved" | "declined" | "withdrawn";
  by: string;
  at: string | null;
  personFirstName: string;
  now: Date;
}): string {
  const when = dayAndClock(input.at, input.now);
  const who = input.status === "withdrawn" ? input.personFirstName.trim() || "the person" : firstOf(input.by) || "an admin";
  const verb = input.status === "approved" ? "Approved" : input.status === "declined" ? "Declined" : "Withdrawn";
  return when ? `${verb} by ${who}, ${when}` : `${verb} by ${who}`;
}

/** What the register did when it was approved. */
export function registerOutcomeWords(outcome: "written" | "corrected" | "kept" | null): string {
  switch (outcome) {
    case "written":
      return "The register says Excused.";
    case "corrected":
      return "The register changed from Absent to Excused, in the group’s history.";
    case "kept":
      return "The register was left as it was.";
    default:
      return "";
  }
}

/** "Grace Chen" to "Grace". */
export function firstOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export const EXCUSED_BEFORE = "Excused before";
export const STAFF_ONLY = "Staff only";
export const MOST_WEEKS_TITLE = "Weeks given under “Most weeks, not all”";
/** Weeks still ahead they are excused from, listed apart and not counted. */
export const COMING_UP = "Coming up";
export const NONE = "None";

/** "Week 1 · Wed 4 Nov" with its kind. */
export function excusedBeforeRow(weekNumber: number, occurrence: number, dateKey: string, kind: ExcusedKind): { week: string; kind: string } {
  const week = occurrence > 1 ? `Week ${weekNumber}, session ${occurrence}` : `Week ${weekNumber}`;
  const day = dayWords(dateKey);
  return { week: day ? `${week} · ${day}` : week, kind: excusedKindWords(kind) };
}

export const WHO_DECIDES = "Who decides";
export const WHO_DECIDES_LINE = "Admins. The programme’s lead and the group’s facilitators see only that the person asked or is excused, never the reason.";

export const HISTORY = "History";

/** One line of the request's history. */
export function historyWords(input: {
  what: ExcusedEvent;
  by: string;
  weekNumber: number | null;
  occurrence: number;
  personFirstName: string;
}): string {
  const who = firstOf(input.by) || "Somebody";
  const week = input.weekNumber ? ` ${weekLower(input.weekNumber, input.occurrence)}` : "";
  switch (input.what) {
    case "asked":
      return `${input.personFirstName.trim() || who} sent this`;
    case "withdrawn":
      return `${input.personFirstName.trim() || who} withdrew${week || " it"}`;
    case "approved":
      return `${who} approved${week || " it"}`;
    case "declined":
      return `${who} declined${week || " it"}`;
    default:
      return `${who} replied`;
  }
}

export const REPLIES = "Replies";

/** "Zach, Mon 9 Nov, 11:15am". */
export function replyByWords(by: string, at: string, now: Date): string {
  const when = dayAndClock(at, now);
  return [firstOf(by) || "An admin", when].filter(Boolean).join(", ");
}

/** The request is the reader's own: somebody else decides it. */
export const YOURS = "You asked for this, so somebody else decides it.";

/** Every week decided or withdrawn. */
export const NOTHING_TO_DECIDE = "Every week of this request is decided or withdrawn.";
