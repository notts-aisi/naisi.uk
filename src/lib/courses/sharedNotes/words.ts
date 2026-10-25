import { dayWords, namesWords } from "../sessionChange/words";

/**
 * THE WORDS OF THE NOTES A GROUP SHARES (C29), in one place: the week's page
 * (board wk-week-phone's "Notes shared with your group"), the programme's
 * Attendance tab, where its lead and admins read them, and the shared notes
 * routes' refusals.
 *
 * The board's own words are kept exactly, apostrophes included, and every
 * name, date and week in them is a slot filled from a record by the caller.
 * Words the board does not draw (the box under "Add a note", deleting a note,
 * a facilitator's heading, the lead and admins in the sentence under the
 * notes) are written in the same voice and are listed in the build notes for
 * the boards' designers to confirm.
 *
 * No sentence here carries a dash of either kind, and no pronoun is guessed.
 * Pure, with no imports beyond the house date words, so the server pages,
 * the pages in the browser, the routes and the tests read the same sentences.
 */

/** A member's heading over their group's notes, as the board draws it. */
export const NOTES_SHARED_WITH_YOUR_GROUP = "Notes shared with your group";

/**
 * Anybody else's heading over one group's notes, the group named, so a
 * facilitator of two groups, the lead and an admin never read one group's
 * notes under another's name: "Notes shared with Group B".
 */
export function notesSharedWithHeading(groupName: string): string {
  return `Notes shared with ${groupName.trim() || "the group"}`;
}

/** Who is reading the sentence under the notes. */
export type SharedNotesReader = "member" | "facilitator" | "lead" | "admin";

/**
 * The sentence under the notes, naming everyone who reads them. The board's
 * "Everyone in Group B and your facilitators can see these." with the
 * programme's lead and admins, who read them too: "Everyone in Group B, your
 * facilitators, Claudia and admins can see these." The lead is named by first
 * name, "you" to the lead, and left out on a run no programme with a lead
 * names. Anybody but a member reads "its facilitators".
 */
export function sharedNotesWhoLine(input: {
  groupName: string;
  reader: SharedNotesReader;
  /** The programme's lead's first name, or null when the run has no lead who stands. */
  leadFirstName: string | null;
}): string {
  const member = input.reader === "member";
  const group = input.groupName.trim() || (member ? "your group" : "the group");
  const lead = input.reader === "lead" ? "you" : (input.leadFirstName ?? "").trim();
  const readers = [`Everyone in ${group}`, member ? "your facilitators" : "its facilitators", lead, "admins"].filter(Boolean);
  return `${namesWords(readers)} can see these.`;
}

/** "Chloe · Tue 17 Nov", over one note. */
export function sharedNoteByline(firstName: string, dateKey: string): string {
  return [firstName.trim(), dayWords(dateKey)].filter(Boolean).join(" · ");
}

/** "Week 3:", before a note's words: the week whose page it was written on. */
export function sharedNoteWeekLabel(weekNumber: number): string {
  return `Week ${weekNumber}:`;
}

/** The board's button under the notes. */
export const ADD_A_NOTE = "Add a note";
/** The box it opens, its button, and the way back. */
export const YOUR_NOTE = "Your note";
export const NOTE_PLACEHOLDER = "A thought on this week’s reading, or a question for the session";
export const SAVE_NOTE = "Save note";
export const SAVING_NOTE = "Saving…";
export const CANCEL = "Cancel";
export const NOTE_SAVED = "Note saved.";
export const NO_NOTES_YET = "No notes yet.";

/** Deleting a note, offered to the person who wrote it and nobody else. */
export const DELETE_NOTE = "Delete";
export const DELETE_NOTE_YES = "Delete note";
export const KEEP_NOTE = "Keep it";
export const DELETING_NOTE = "Deleting…";
export const NOTE_DELETED = "Note deleted.";

/** The question before a note goes, for everyone who can see it. */
export const DELETE_NOTE_QUESTION = "Delete this note? It goes for everyone who can see it.";

/** A screen reader's name for one note's delete button: "Delete your note from Tue 17 Nov". */
export function deleteNoteLabel(dateKey: string): string {
  const day = dayWords(dateKey);
  return day ? `Delete your note from ${day}` : "Delete your note";
}

/** The shared notes routes' refusals, each a sentence a person can act on. */
export const SHARED_NOTE_REFUSAL = {
  body: "That note didn’t come through. Try again.",
  empty: "Write your note in the box first, then save it.",
  week: "That week isn’t one of this programme’s weeks.",
  notYours: "Only the people in this group and its facilitators can add a note here.",
  notYoursToDelete: "Only the person who wrote a note can delete it.",
  network: "That didn’t go through: check your connection and try again.",
} as const;

/** "That note is too long: keep it to 1,000 characters." */
export function sharedNoteTooLongWords(max: number): string {
  return `That note is too long: keep it to ${new Intl.NumberFormat("en-GB").format(max)} characters.`;
}
