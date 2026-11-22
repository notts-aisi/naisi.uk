/**
 * THE WORDS OF ARCHIVING AND RESTORING A GROUP, from the group's own page
 * under its programme (an admin or the programme's lead), the older run
 * editor's card on a run no programme names (an admin), and the
 * facilitator's own page of a group that has been archived. Each refusal is
 * one sentence naming the group as its page prints it and the real numbers,
 * and the page draws the way to put it right beside it (`ArchiveFix` in
 * `plan.ts`). Staff are named as the reader may see them
 * (`sentenceNameFor`); a facilitator reads the programme's lead's first name.
 *
 * Pure: no reads, no clock.
 */

/** One line of typed text, or "". */
function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** A group's name as its page prints it. */
export function groupName(name: string | null | undefined): string {
  return line(name) || "Untitled group";
}

/** "Group J", "Group J and Group K", "Group J, Group K and Group L". */
export function andList(items: readonly string[]): string {
  const clean = items.map(line).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/** "week 2", "weeks 2 and 3", "weeks 1, 2 and 4". "" for none. */
export function weeksWords(weeks: readonly number[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return `week ${weeks[0]}`;
  return `weeks ${andList(weeks.map(String))}`;
}

/** "1 person", "3 people". */
function peopleWords(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}

/** "Agnes’s", "James’s". */
function possessive(name: string): string {
  return `${line(name) || "Their"}’s`;
}

// ---------------------------------------------------------------------------
// Archiving: under the six rows, the question, and after
// ---------------------------------------------------------------------------

/** Under the six rows: "Archive Group C…". */
export function archiveLinkWords(name: string): string {
  return `Archive ${groupName(name)}…`;
}

/** Under "Archive Group C…": what it does and keeps. */
export function archiveLineWords(name: string): string {
  return `Takes ${groupName(name)} out of allocation, lists and reminders. Its registers and history stay.`;
}

/** The question's title: "Archive Group E?". */
export function archiveQuestionTitle(name: string): string {
  return `Archive ${groupName(name)}?`;
}

/** The question's body. */
export function archiveQuestionBody(name: string): string {
  const group = groupName(name);
  return (
    `${group} leaves the board, All groups and every reminder, and drops out of allocation. ` +
    "It stays on the run for the record, with its registers and history, and can be restored."
  );
}

/** Under the question and the restore question alike. */
export const NOBODY_IS_EMAILED = "Nobody is emailed.";

/** The question's two buttons: "Archive Group E" and "Keep Group E". */
export function archiveButtonWords(name: string): string {
  return `Archive ${groupName(name)}`;
}
export function keepButtonWords(name: string): string {
  return `Keep ${groupName(name)}`;
}

/** While the press is on its way. */
export const ARCHIVING = "Archiving…";

/** Back on All groups, once it went through: "Group E is archived. Nobody was emailed." */
export function archivedSaidWords(name: string): string {
  return `${groupName(name)} is archived. Nobody was emailed.`;
}

// ---------------------------------------------------------------------------
// What archiving refuses, each with what puts it right
// ---------------------------------------------------------------------------

/** What the panel says for a press the route would not take from this account at all. */
export const ARCHIVE_SIGNED_OUT = "You’ve been signed out. Sign in again, then come back to this group.";
export const ARCHIVE_NOT_YOURS = "Only an admin or the programme’s lead archives or restores a group, and this account isn’t one of them now.";

/** A refused press's sentences that name nothing, and the body the route answers before it reads a group. */
export const ARCHIVE_REFUSAL = {
  body: "archived must be true or false.",
  destroying: "This run is being destroyed, so its groups can’t be archived or restored.",
} as const;

/** Why a run is over, for the one sentence that says so. */
export type RunOverHow = "completed" | "cancelled" | "archived" | "last-session";

/**
 * The run is over, so no group of it is archived or restored: "AGI
 * Strategy’s run is completed, so its groups stay as they are for the
 * record." Its status says why when it is completed, cancelled or archived;
 * a run still marked running whose last session has been says that instead,
 * never "completed".
 */
export function runOverWords(programmeName: string, how: RunOverHow): string {
  const run = `${possessive(programmeName || "This programme")} run`;
  const why =
    how === "completed"
      ? "is completed"
      : how === "cancelled"
        ? "is cancelled"
        : how === "archived"
          ? "is archived"
          : "has had its last session";
  return `${run} ${why}, so its groups stay as they are for the record.`;
}

/**
 * The run's last group that still meets: "Group A is Alignment’s only group,
 * so it can’t be archived. To end the programme early, an admin cancels the
 * cohort."
 */
export function lastGroupWords(name: string, programmeName: string): string {
  return (
    `${groupName(name)} is ${possessive(programmeName || "the programme")} only group, so it can’t be archived. ` +
    "To end the programme early, an admin cancels the cohort."
  );
}

/**
 * Somebody still holds a place in the group: "Group C still has 6 people in
 * it. Move them to another group first, then archive it." When some of them
 * facilitate it too, whom the board will not move, it says to take them off
 * its facilitators first.
 */
export function stillHasPeopleWords(name: string, count: number, facilitating = 0): string {
  const base = `${groupName(name)} still has ${peopleWords(count)} in it. Move them to another group first, then archive it.`;
  if (facilitating <= 0) return base;
  const who = facilitating === 1 ? "One of them facilitates it too" : `${facilitating} of them facilitate it too`;
  return `${base} ${who}: take ${facilitating === 1 ? "them" : "those"} off its facilitators on Facilitators before moving ${facilitating === 1 ? "them" : "everybody"}.`;
}

/**
 * A freed place offered in the group's name and not answered yet: "Group D
 * has 1 freed place offered and not answered yet. Archive it once that
 * person has answered."
 */
export function freedOffersWords(name: string, count: number): string {
  return count === 1
    ? `${groupName(name)} has 1 freed place offered and not answered yet. Archive it once that person has answered.`
    : `${groupName(name)} has ${count} freed places offered and not answered yet. Archive it once they have answered.`;
}

/**
 * Somebody moved to another group from a week still to come is in this one
 * until then: "Group I is still 2 people’s group for week 4, before their
 * move to another group. Archive it once that session has met and its
 * register is finished." A move's week is the staff move's to choose, so the
 * sentence says when archiving will go through.
 */
export function movingLaterWords(name: string, count: number, weeks: readonly number[]): string {
  const whose = count === 1 ? "1 person’s" : `${count} people’s`;
  const once =
    weeks.length === 1 ? "that session has met and its register is finished" : "those sessions have met and their registers are finished";
  return (
    `${groupName(name)} is still ${whose} group for ${weeksWords(weeks)}, before their move to another group. ` +
    `Archive it once ${once}.`
  );
}

/**
 * A one-week visit to one of the group's sessions still to come, naming the
 * visitor and the day: "Agnes Ilori is visiting Group E’s week 3 session on
 * Fri 20 Nov. Call the visit off on Agnes’s page first, then archive the
 * group." Once the visitor's own session that week has started a visit can
 * no longer be called off (`planCallOff`), and the sentence says the way
 * through that is left.
 */
export function visitToComeWords(input: {
  visitorName: string;
  visitorFirstName: string;
  name: string;
  weekNumber: number;
  /** "Fri 20 Nov", or "" for a session with no date. */
  dayLabel: string;
  callable: boolean;
}): string {
  const on = input.dayLabel ? ` on ${input.dayLabel}` : "";
  const visiting = `${line(input.visitorName) || "Somebody"} is visiting ${groupName(input.name)}’s week ${input.weekNumber} session${on}`;
  return input.callable
    ? `${visiting}. Call the visit off on ${possessive(input.visitorFirstName || input.visitorName)} page first, then archive the group.`
    : `${visiting}, and it’s too late to call the visit off. Archive the group once that session has met and its register is finished.`;
}

/**
 * One of the group's sessions has been given to somebody to cover. Nothing
 * on the site takes a given session back: moving the session or calling it
 * off under Change this week ends the cover, and nothing tells the person
 * covering, so the sentence says to. Once the session has started the cover
 * holds until midnight and Change this week is not offered, so the sentence
 * says when archiving will go through.
 */
export function givenCoverWords(input: {
  name: string;
  weekNumber: number;
  holderName: string;
  holderFirstName: string;
  started: boolean;
}): string {
  const holder = line(input.holderName) || "Somebody";
  const first = line(input.holderFirstName) || holder;
  const session = `${groupName(input.name)}’s week ${input.weekNumber} session`;
  return input.started
    ? `${session} was given to ${holder} to cover, and it stays theirs until midnight. Archive the group after that.`
    : `${session} has been given to ${holder} to cover. Move it or call it off under Change this week first, then archive the group. ` +
        `The site doesn’t tell ${first}, so let them know.`;
}

/**
 * A register of a session that has started, in a week somebody's place
 * names for the group, is neither finished nor marked as not having
 * happened: "Group C’s register for week 2 isn’t finished. Finish it, or
 * say the session didn’t happen, then archive the group: an unfinished
 * register counts for nothing once a group is archived."
 */
export function unfinishedRegistersWords(name: string, weeks: readonly number[]): string {
  const one = weeks.length === 1;
  return (
    `${groupName(name)}’s ${one ? "register" : "registers"} for ${weeksWords(weeks)} ${one ? "isn’t" : "aren’t"} finished. ` +
    `Finish ${one ? "it" : "them"}, or say the ${one ? "session" : "sessions"} didn’t happen, then archive the group: ` +
    "an unfinished register counts for nothing once a group is archived."
  );
}

/** The ways to put a refusal right, as the page links them. */
export const OPEN_PEOPLE_IN_GROUPS = "Open People in groups";
/** "Open week 2’s register". */
export function openRegisterWords(weekNumber: number): string {
  return `Open week ${weekNumber}’s register`;
}
/** "Open Agnes’s page". */
export function openPersonWords(firstName: string): string {
  return `Open ${possessive(firstName || "their")} page`;
}
/** "Change week 3’s session": the week, on the group's own page, where Change this week is. */
export function changeWeekWords(weekNumber: number): string {
  return `Change week ${weekNumber}’s session`;
}

// ---------------------------------------------------------------------------
// The archived group's page, for the lead and admins
// ---------------------------------------------------------------------------

export const ARCHIVED_CHIP = "Archived";

/**
 * "Group F was archived on Mon 2 Nov by Maya Rao. It is out of allocation,
 * lists and reminders. Its registers and history stay here." A group
 * archived before the day and the name were kept says "Group F is
 * archived." in place of the first sentence.
 */
export function archivedSentence(name: string, dayLabel: string, byName: string): string {
  const group = groupName(name);
  const first = dayLabel
    ? byName
      ? `${group} was archived on ${dayLabel} by ${byName}.`
      : `${group} was archived on ${dayLabel}.`
    : `${group} is archived.`;
  return `${first} It is out of allocation, lists and reminders. Its registers and history stay here.`;
}

/** "How Group F met". */
export function howMetTitle(name: string): string {
  return `How ${groupName(name)} met`;
}

/** Under the six rows, read only. */
export const NOTHING_CHANGES_WHILE_ARCHIVED = "Nothing here changes while the group is archived. Restore it first.";

/** "Nobody in the group", the Places row of a group nobody is in. */
export const NOBODY_IN_THE_GROUP = "nobody in the group";

// ---------------------------------------------------------------------------
// Restoring: the question, the refusals, and after
// ---------------------------------------------------------------------------

/** "Restore Group F…", which opens the question. */
export function restoreLinkWords(name: string): string {
  return `Restore ${groupName(name)}…`;
}

/** "Restore Group F?". */
export function restoreQuestionTitle(name: string): string {
  return `Restore ${groupName(name)}?`;
}

/**
 * "Group F comes back on the board, All groups and reminders, as it was when
 * it was archived: Fridays, 11am to 1pm, no room." `when` is the day and time
 * as the page prints it, or "" with none; `room` likewise.
 */
export function restoreQuestionBody(name: string, when: string, room: string): string {
  const parts = [line(when) || "no day or time", line(room) || "no room"];
  return `${groupName(name)} comes back on the board, All groups and reminders, as it was when it was archived: ${parts.join(", ")}.`;
}

/** One facilitator who now holds a place in another group of the run, or in no group ("" for `groupName`). */
export type SitsElsewhere = { name: string; groupName: string };

/**
 * Before the press, when a facilitator now sits in another group of the
 * run: "Rahul Mehta now sits in Group B as one of its people, so Group F
 * comes back with no facilitator. Add one on Facilitators." With somebody
 * left, it says who. "" with nobody elsewhere.
 */
export function sitsElsewhereWords(name: string, elsewhere: readonly SitsElsewhere[], staying: readonly string[]): string {
  if (elsewhere.length === 0) return "";
  const group = groupName(name);
  const one = elsewhere[0];
  const where =
    elsewhere.length === 1
      ? line(one.groupName)
        ? `${line(one.name) || "One of its facilitators"} now sits in ${groupName(one.groupName)} as one of its people`
        : `${line(one.name) || "One of its facilitators"} now holds a place on the run in no group`
      : `${andList(elsewhere.map((each) => `${line(each.name) || "One of its facilitators"} (${line(each.groupName) ? groupName(each.groupName) : "no group"})`))} now hold places elsewhere on the run`;
  const left = staying.map(line).filter(Boolean);
  return left.length === 0
    ? `${where}, so ${group} comes back with no facilitator. Add one on Facilitators.`
    : `${where}, so ${group} comes back with ${andList(left)} as its ${left.length === 1 ? "facilitator" : "facilitators"}.`;
}

/** The question's two buttons. */
export const KEEP_IT_ARCHIVED = "Keep it archived";
export function restoreButtonWords(name: string): string {
  return `Restore ${groupName(name)}`;
}

/** While the press is on its way. */
export const RESTORING = "Restoring…";

/** "Another group is now called Group F. Rename that group first, then restore this one." */
export function nameTakenWords(name: string): string {
  return `Another group is now called ${groupName(name)}. Rename that group first, then restore this one.`;
}

/** On the group's own page once it went through: "Group F is back. Nobody was emailed." */
export function restoredSaidWords(name: string): string {
  return `${groupName(name)} is back. Nobody was emailed.`;
}

/**
 * The Remind press about a session that passed while the group was archived:
 * "Group F’s session on Tue 24 Nov passed while it was archived, so no
 * register is owed and nobody is reminded."
 */
export function notOwedWords(name: string, dayLabel: string): string {
  return `${groupName(name)}’s session on ${line(dayLabel) || "that day"} passed while it was archived, so no register is owed and nobody is reminded.`;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Beside who did it: "Archived Group F." */
export function archivedHistoryWords(name: string): string {
  return `Archived ${groupName(name)}.`;
}

/** Beside who did it: "Restored Group F." */
export function restoredHistoryWords(name: string): string {
  return `Restored ${groupName(name)}.`;
}

// ---------------------------------------------------------------------------
// What a facilitator of an archived group is told
// ---------------------------------------------------------------------------

/** "Group F was archived on Mon 2 Nov.", or "Group F is archived." for a group archived before the day was kept. */
export function facilitatorArchivedTitle(name: string, dayLabel: string): string {
  return dayLabel ? `${groupName(name)} was archived on ${dayLabel}.` : `${groupName(name)} is archived.`;
}

/** "Its registers are kept. Maya, the programme’s lead, can tell you more." */
export function facilitatorArchivedLine(leadFirstName: string | null): string {
  const lead = line(leadFirstName);
  return lead ? `Its registers are kept. ${lead}, the programme’s lead, can tell you more.` : "Its registers are kept. An admin can tell you more.";
}

// ---------------------------------------------------------------------------
// The doors that change a group refuse an archived one
// ---------------------------------------------------------------------------

/** The facilitators route, on an archived group. */
export const FACILITATORS_ARCHIVED = "That group has been archived, so its facilitators can’t change. Restore it first.";
/** The route that covers a session or gives it to somebody, on an archived group. */
export const COVER_ARCHIVED = "That group has been archived, so none of its sessions can be covered or given to anybody. Restore it first.";
/** The group's own pace, on an archived group. */
export const PACE_ARCHIVED = "That group has been archived, so its pace can’t change. Restore it first.";
/** Writing to the group, on an archived group. */
export const EMAIL_ARCHIVED = "That group has been archived, so nobody is written to through it. Restore it first.";
/** The meeting link route, on an archived group. */
export const LINK_ARCHIVED = "That group has been archived, so its meeting link can’t change. Restore it first.";

/** Under the older run editor's Archived switch, for anybody but an admin. */
export const ARCHIVE_IS_AN_ADMINS = "Only an admin archives or restores a group here.";
