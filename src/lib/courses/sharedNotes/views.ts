/**
 * THE SHAPES THE PAGES DRAW NOTES SHARED WITH A GROUP FROM (C29), built field
 * by field on the server by `./readers.ts` and handed to the components that
 * draw them. Types only, so a component in the browser imports them without
 * reaching the server's reader.
 */

/** One note as a page shows it: who wrote it, the week and the day, and its words. */
export type SharedNoteView = {
  id: string;
  groupId: string;
  /** The week whose page it was written on: "Week 3:" before its words. */
  weekNumber: number;
  writerUid: string;
  /** The name the writer goes by, for their initials. */
  writerName: string;
  /** The name over the note: "Chloe". */
  writerFirstName: string;
  /** The London day it was written, "YYYY-MM-DD", or "" when the stamp is missing. */
  dateKey: string;
  /** "Chloe · Tue 17 Nov". */
  byline: string;
  /** Plain text, shown as text. */
  body: string;
  /** The reader wrote it, so the page offers them a way to delete it. */
  mine: boolean;
};

/** One group's notes as one reader is shown them, with what the section says around them. */
export type SharedNotesSection = {
  groupId: string;
  /** "Notes shared with your group", or the group named for anybody but its own people. */
  heading: string;
  /** The sentence under the notes, naming everyone who reads them. */
  whoLine: string;
  /** The reader may add a note to this group. */
  canWrite: boolean;
  /** Newest first. */
  notes: SharedNoteView[];
};

/**
 * What a week's page draws of the notes. Null on a run whose groups share no
 * notes (one anyone can join, or one with no live group): that page keeps
 * the run's comments on each reading, exactly as before. Otherwise a section
 * for each group the reader is in or facilitates, their own group first; an
 * empty list for a reader with neither, such as an admin, who reads every
 * group's notes on the programme's Attendance tab.
 */
export type WeekSharedNotes = { sections: SharedNotesSection[] } | null;
