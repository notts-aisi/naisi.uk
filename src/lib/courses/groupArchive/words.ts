/**
 * THE WORDS OF ARCHIVING AND RESTORING A GROUP, from the run editor's group
 * card and the group's own page: each refusal is one sentence, read by
 * whoever may archive the group (an admin, a course approver, the lead of the
 * programme that names the run), naming the group as the card prints it and
 * the real numbers.
 *
 * Pure: no reads, no clock.
 */

/** One line of typed text, or "". */
function line(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** A group's name as the group card prints it. */
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

/** A refused press's sentences, and the two the route answers before it reads a group. */
export const ARCHIVE_REFUSAL = {
  body: "archived must be true or false.",
  destroying: "This run is being destroyed, so its groups can’t be archived or restored.",
} as const;

/**
 * Somebody still holds a place in the group, and can be moved to another of
 * the run's groups: "Group I still has 3 people in it. Move them to another
 * group first, then archive it."
 */
export function stillHasPeopleWords(name: string, count: number): string {
  return `${groupName(name)} still has ${peopleWords(count)} in it. Move them to another group first, then archive it.`;
}

/**
 * Somebody still holds a place in the group, and the run has no other group
 * that still meets (an incubator's one group, or a run's last group).
 */
export function stillHasPeopleOnlyGroupWords(name: string, count: number): string {
  return (
    `${groupName(name)} still has ${peopleWords(count)} in it, and its run has no other group that still meets ` +
    "to move them to, so it stays as it is while they hold their places."
  );
}

/**
 * Somebody still holds a place in the group, and the run is over (by its
 * status or because its last session has ended): archiving would take their
 * attendance and who finished off the record, so the sentence says to
 * archive the run instead, as the run editor's Archive does. `archivesRuns`
 * is an admin or a course approver; the programme's lead asks an admin.
 */
export function stillHasPeopleRunClosedWords(name: string, count: number, archivesRuns: boolean): string {
  const instead = archivesRuns ? "archive the run instead, under Archive in the run editor" : "ask an admin to archive the run instead";
  return (
    `${groupName(name)} still has ${peopleWords(count)} in it, and nobody can be moved on this run any more, ` +
    `so it stays as it is: to put the term away, ${instead}.`
  );
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
 * register is finished." A move's week is the staff move's to choose, not
 * the presser's, so the sentence says when archiving will go through.
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
 * A one-week visit to one of the group's sessions still to come: "Group I
 * still has 2 visits to come, in week 5. Cancel them, or archive the group
 * once that session has met and its register is finished." A visit cannot be
 * cancelled once the visitor's own session that week has started, so the
 * sentence says the other way through too.
 */
export function visitsToComeWords(name: string, count: number, weeks: readonly number[]): string {
  const visits = count === 1 ? "1 visit" : `${count} visits`;
  const them = count === 1 ? "it" : "them";
  const once =
    weeks.length === 1 ? "that session has met and its register is finished" : "those sessions have met and their registers are finished";
  return `${groupName(name)} still has ${visits} to come, in ${weeksWords(weeks)}. Cancel ${them}, or archive the group once ${once}.`;
}

/**
 * A register of a session that has started is neither finished nor marked
 * as not having happened: "Group I’s register for week 2 isn’t finished.
 * Finish it, or say the session didn’t happen, then archive the group: an
 * unfinished register counts for nothing once a group is archived."
 */
export function unfinishedRegistersWords(name: string, weeks: readonly number[]): string {
  const one = weeks.length === 1;
  return (
    `${groupName(name)}’s ${one ? "register" : "registers"} for ${weeksWords(weeks)} ${one ? "isn’t" : "aren’t"} finished. ` +
    `Finish ${one ? "it" : "them"}, or say the ${one ? "session" : "sessions"} didn’t happen, then archive the group: ` +
    "an unfinished register counts for nothing once a group is archived."
  );
}

/**
 * Restoring the group would leave somebody facilitating it who holds a place
 * in another group, which every other door refuses: "Group I can’t be
 * restored while 1 of its facilitators holds a place in Group J: a
 * facilitator who holds a place sits in the group they facilitate. Take them
 * off Group I’s facilitators first, then restore it."
 */
export function facilitatorSitsElsewhereWords(
  name: string,
  count: number,
  otherGroups: readonly string[],
  changesFacilitators: boolean,
): string {
  const group = groupName(name);
  const who = count === 1 ? "1 of its facilitators holds a place" : `${count} of its facilitators hold places`;
  // Only an admin can take a facilitator off an archived group: in the run editor.
  const next = changesFacilitators
    ? `Take them off ${group}’s facilitators in the run editor first, then restore it.`
    : `Ask an admin to take them off ${group}’s facilitators in the run editor, then restore it.`;
  return (
    `${group} can’t be restored while ${who} in ${andList(otherGroups.map(groupName))}: ` +
    `a facilitator who holds a place sits in the group they facilitate. ${next}`
  );
}
