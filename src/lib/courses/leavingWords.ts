/**
 * THE WORDS OF LEAVING A PROGRAMME: the link at the foot of the programme
 * page, the confirmation it leads to, and the page somebody reads once they
 * have left (board wk-left-phone).
 *
 * The left page's words are the board's. The confirmation is not drawn on any
 * board: its words are written in the boards' voice and listed for Claude
 * Design. Every name and date in them is a slot filled from a record by the
 * caller: the programme's short name, the group, the lead, the day they left.
 *
 * Pure, with no imports, so the confirmation form in the browser, the server
 * pages and the tests all read the same sentences.
 */

/** The society's address, as the boards write it. */
export const SOCIETY_ADDRESS = "ai-safety@uonsu.com";

/** The link at the foot of the programme page (wk-programme). */
export const LEAVE_LINK = "Leave the programme";

// ---------------------------------------------------------------------------
// The confirmation
// ---------------------------------------------------------------------------

/** "Leave AGI Strategy?" */
export function leaveHeading(name: string): string {
  return `Leave ${name}?`;
}

/**
 * What leaving does, in three sentences. `groupName` is their own group's,
 * or null when the record names none.
 */
export function leaveLines(groupName: string | null): string[] {
  return [
    groupName
      ? `You’ll leave ${groupName} straight away and give your place back.`
      : "You’ll leave straight away and give your place back.",
    "Your marks so far stay, and you keep your notes and the reading list. The weekly emails stop.",
    `You can’t undo this yourself. If you change your mind, email ${SOCIETY_ADDRESS} and we’ll see what we can do.`,
  ];
}

export const REASON_LABEL = "Why are you leaving? (optional)";

/**
 * Who reads the reason, said beside the box. On a programme the form places
 * people on, its lead and admins read it on the programme's Overview; on an
 * open run nobody reads it but admins.
 */
export function reasonReaders(input: {
  kind: "open" | "form";
  leadFirstName: string | null;
  name: string;
}): string {
  if (input.kind === "open") return "Only admins read this.";
  return input.leadFirstName
    ? `Only ${input.leadFirstName}, who leads ${input.name}, and admins read this.`
    : "Only the programme’s lead and admins read this.";
}

/** "Type", then the course's title in bold, then "to confirm". */
export const CONFIRM_BEFORE = "Type";
export const CONFIRM_AFTER = "to confirm";

/** The button, and what it says while the press is on its way. */
export function leaveButton(name: string): string {
  return `Leave ${name}`;
}
export const LEAVING = "Leaving…";
export const STAY = "Stay";

/** In place of the form when the course has no title to type: the leave route's own sentence. */
export const UNTITLED_COURSE =
  "This course has no title yet, so there's nothing to type as confirmation. Email the team and we'll take you off it.";

/** Said when the press could not reach the site at all. */
export const LEAVE_UNREACHABLE = "That didn’t go through: check your connection and try again.";
/** Said when the site answered with no sentence of its own. */
export const LEAVE_FAILED = "That didn’t go through. Try again.";

// ---------------------------------------------------------------------------
// The page once they have left (wk-left-phone)
// ---------------------------------------------------------------------------

export const BACK_TO_PROGRAMMES = "My programmes";

/** "You left AGI Strategy" */
export function leftHeading(name: string): string {
  return `You left ${name}`;
}

/** "That was on Fri 13 Nov. Thanks for coming along." `day` is null when no date is on record. */
export function leftOnLine(day: string | null): string {
  return day ? `That was on ${day}. Thanks for coming along.` : "Thanks for coming along.";
}

export const WHAT_STAYS = "What stays here";
export const NOTES_LINK = "Your notes and reflections";

/**
 * The reading list's link, from the weeks that are published and the weeks
 * the programme teaches: "The reading list for all 6 weeks" once every week
 * is out, "…for weeks 1 to 3" or "…for week 1" while the first few are, and
 * "…for the 2 weeks published so far" otherwise. Null when no week is
 * published: there is nothing to read yet.
 */
export function readingListLink(published: readonly number[], taught: number): string | null {
  const weeks = [...new Set(published)].sort((a, b) => a - b);
  if (weeks.length === 0) return null;
  if (taught > 1 && weeks.length >= taught) return `The reading list for all ${taught} weeks`;
  if (weeks.length === 1) return `The reading list for week ${weeks[0]}`;
  const fromOne = weeks.every((week, at) => week === at + 1);
  if (fromOne) return `The reading list for weeks 1 to ${weeks[weeks.length - 1]}`;
  return `The reading list for the ${weeks.length} weeks published so far`;
}

export const YOUR_MARKS = "Your marks";
/** "Week 1, Tue 3 Nov", or "Week 1" when the session has no date. */
export function markRowLabel(weekNumber: number, day: string | null): string {
  return day ? `Week ${weekNumber}, ${day}` : `Week ${weekNumber}`;
}
/** A finished register that did not mark them. */
export const NOT_MARKED = "Not marked";
/** A session its register says did not happen. */
export const DID_NOT_HAPPEN = "Didn’t happen";

export const CHANGED_YOUR_MIND = "Changed your mind?";
/** "Email", the address as a link, then "and we’ll see what we can do." */
export const CHANGED_BEFORE = "Email";
export const CHANGED_AFTER = "and we’ll see what we can do.";

export const STILL_AROUND = "Still around";
export const EVENTS_OPEN = "Events are open to everyone.";

// ---------------------------------------------------------------------------
// Their notes and reflections, and the reading list
// ---------------------------------------------------------------------------

export const NOTES_HEADING = "Your notes and reflections";
export const NOTES_NONE = "You didn’t write any notes or reflections.";
/** "Rated 4 of 5" */
export function ratedWords(rating: number): string {
  return `Rated ${rating} of 5`;
}
export const YOUR_NOTE = "Your note";
export const YOUR_COMMENT = "Your comment";

export const READING_HEADING = "The reading list";
export const READING_NONE = "No week is published yet.";
/** "Week 3: Who decides what AGI means", or "Week 3" with no title. */
export function weekHeading(weekNumber: number, title: string): string {
  const named = title.trim();
  return named ? `Week ${weekNumber}: ${named}` : `Week ${weekNumber}`;
}
export const OPTIONAL = "Optional";
