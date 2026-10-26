/**
 * THE WORDS OF LEAVING A PROGRAMME: the link at the foot of the programme
 * page, the confirmation it leads to, and the page somebody reads once they
 * have left (board wk-left-phone).
 *
 * The left page's words are the board's. The confirmation is not drawn on any
 * board: its words are written in the boards' voice and listed for the
 * boards' designers to confirm. Every name and date in them is a slot filled
 * from a record by the caller: the programme's short name, the group, the
 * lead, the day they left.
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
 * What leaving does, in three lines. `groupName` is their own group's, or
 * null when the record names none; `sharesNotes` is whether the run's groups
 * share notes (`runSharesGroupNotes`: a run that places people does, an open
 * run does not). The second line says what stays and with whom, and that the
 * programme's page shows them nothing more once they have left: it has to
 * stay as true as the page it describes.
 */
export function leaveLines(groupName: string | null, sharesNotes: boolean): string[] {
  const stays = sharesNotes
    ? "Your marks so far stay on your group’s register, and the notes you shared stay with the group."
    : "Your marks so far stay on your group’s register.";
  return [
    groupName
      ? `You’ll leave ${groupName} straight away and give your place back.`
      : "You’ll leave straight away and give your place back.",
    `${stays} After you leave, your programme’s page shows only that you left. The weekly emails stop.`,
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

/**
 * The answer for a seat that is not this person's to leave by themselves
 * (they applied to the run itself, on its older form, so an admin takes them
 * off). Said by the leave route, and by a reply of "I can’t make it" from
 * somebody in a group on such a seat, in the same words.
 */
export const NOT_YOURS_TO_LEAVE =
  "Leaving this course isn't something you can do yourself. Email the team and we'll sort it out with you.";

/**
 * The leave route's answer once the run's last session is over: leaving has
 * closed, as the board for after the end draws no way out. `name` is the
 * course's title, as the member's own page says it has ended. Not on any
 * board: written in the boards' voice. A reply of "I can’t make it" from
 * somebody in a group after the end is answered in these words too.
 */
export function endedNothingToLeave(name: string): string {
  return `${name} has ended, so there’s nothing to leave. If you need something changed, email ${SOCIETY_ADDRESS}.`;
}

/**
 * NOT DRAWN. Leaving, for a facilitator who holds a place: the programme's
 * lead or an admin takes them off the group's facilitators first, which
 * leaves their place where it is, and then they can leave. Written in the
 * boards' voice; said on their programme's page where the way out would be,
 * and by both doors' refusals.
 */
export function facilitatingCantLeave(groupName: string): string {
  return `You facilitate ${groupName}, so you can’t leave the programme here. Ask the programme’s lead or an admin to take you off its facilitators first, then you can leave.`;
}

/**
 * What a press is answered with when leaving is closed to this person
 * (`leavePathFor`'s answer), the same from both doors. `courseTitle` is the
 * run's, as stored.
 */
export function leaveClosedLine(
  answer: { closed: "ended" | "not-theirs" } | { closed: "facilitating"; groupName: string },
  courseTitle: string,
): string {
  if (answer.closed === "facilitating") return facilitatingCantLeave(answer.groupName);
  return answer.closed === "ended" ? endedNothingToLeave(courseTitle.trim() || "This programme") : NOT_YOURS_TO_LEAVE;
}

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

export const CHANGED_YOUR_MIND = "Changed your mind?";
/** "Email", the address as a link, then "and we’ll see what we can do." */
export const CHANGED_BEFORE = "Email";
export const CHANGED_AFTER = "and we’ll see what we can do.";

// ---------------------------------------------------------------------------
// Their notes and reflections, and the reading list, for somebody taking part
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
