/**
 * THE WORDS OF "OUTSIDE THE TIMES THEY GAVE", on Publish's own page, and of
 * the notes route's answers, in one place.
 *
 * No gendered pronoun and no dash of either kind. Pure, so the page, the
 * route and a test read the same sentences.
 */

import { PLACEMENT_NOTE_LIMIT } from "./model";

/** "Outside the times they gave (3)". */
export function outsideTitle(count: number): string {
  return `Outside the times they gave (${count})`;
}

export const OUTSIDE_LINE =
  "Each person here is in a group that meets at a time they said they can’t make. Publish waits until each has a note of your own, which goes above the details in their “Your group” email, or Send without a note. The site still writes their group, day, time and facilitators, and leaves the room out until the group has one.";

/** "Group B · Tuesdays at 6pm", or the group alone with no day and time. */
export function groupLine(groupName: string, meets: string | null): string {
  return meets ? `${groupName} · ${meets}` : groupName;
}

/**
 * How much of their group's session falls in the times they gave, as the
 * site reads those times: "Free for 60 of its 120 minutes." or "Not a time
 * they gave us."
 */
export function overlapWords(minutes: number, of: number): string {
  if (minutes <= 0) return "Not a time they gave us.";
  return `Free for ${minutes} of its ${of} minutes, by the times they gave us.`;
}

/** Said in place of the chart for somebody with no week to draw. */
export const NO_WEEK_TO_SHOW = "Their week isn’t on the form, so there is nothing to draw.";

export const WRITE = "Write a note";
export const DRAFT = "Draft with Claude";
export const DRAFT_AGAIN = "Draft again with Claude";
export const DRAFTING = "Claude is drafting…";
export const WITHOUT = "Send without a note";
export const SAVE = "Save note";
export const SAVING = "Saving…";
export const CANCEL = "Cancel";
export const EDIT = "Edit the note";
export const CHANGE = "Change";

/** Where somebody stands, under their name. */
export function notedWords(by: string | null): string {
  return `Note saved${by ? ` by ${by}` : ""}. It goes above the details in their email.`;
}

export function withoutWords(by: string | null): string {
  return `Goes without a note${by ? `, chosen by ${by}` : ""}.`;
}

export const MISSING = "Needs a note, or Send without a note.";

export const DRAFT_HINT = "Claude’s draft, from their application. It isn’t sent unless you save it.";

export function drawnFromWords(basis: string): string {
  return `Drawn from: ${basis}`;
}

export const PLACEHOLDER =
  "A few sentences of your own. The site writes their group, day, time and facilitators under them.";

/** Under the box: what Claude is told and what it never is. Admins only see it. */
export const CLAUDE_FENCE =
  "Claude is sent their application and the programme’s description, and told only that their group meets outside the times they gave: never their times, the group’s, or anybody’s name.";

export const LOADING = "Reading who is outside the times they gave…";

// ---------------------------------------------------------------------------
// The route's refusals
// ---------------------------------------------------------------------------

export const NOT_SIGNED_IN = "Not signed in";
export const FORBIDDEN = "Forbidden";
export const SAY_WHO = "Say who this note is for.";
export const SAY_CHOICE = "Say whether this is a note or Send without a note.";
export const WRITE_IT = "Write the note, or choose Send without a note.";
export const TOO_LONG = `Keep the note to ${PLACEMENT_NOTE_LIMIT} characters.`;
export const ONLY_ADMINS_DRAFT = "Only an admin can ask Claude to draft a note.";
export const CLAUDE_OFF = "Claude isn’t set up on this site yet.";
export const OWN_NOTE = "You can’t write a note to yourself. Choose Send without a note, or ask another admin.";
export const DRAFT_FAILED = "Claude’s answer couldn’t be read. Try again.";

/** Somebody the press does not wait on: told already, moved inside their times, or not on the run. */
export function notWaitingWords(name: string): string {
  return `${name} isn’t waiting for a note: they have been told their group, or the group they’re in now meets at a time they gave. Reload the page.`;
}

/** The person was moved since the page was drawn. */
export function movedWords(name: string): string {
  return `${name} has moved to another group since this page loaded. Reload the page and choose again.`;
}

/** Claude drafts from an application on the form, and this person has none there. */
export function noApplicationWords(name: string): string {
  return `${name} applied to the run itself, not on the form, so there is no application for Claude to draft from. Write the note by hand.`;
}
