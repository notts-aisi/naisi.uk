import { cameAfter } from "@/lib/legal/courseworkUse";

/**
 * NOTES ADMINS KEEP ABOUT A PERSON (privacy v13, "Notes admins keep about
 * you").
 *
 * `memberNotes/{noteId}`: one document per note, about one person (`uid`),
 * written by an admin (`authorUid`), perhaps drafted by Claude and saved by
 * that admin (`draftedByClaude`), perhaps written from one programme's run
 * (`runId`, with the programme's name as it was then, `programmeLabel`, so
 * the note still says where it came from once the run has gone).
 *
 * THE RULES THIS FEATURE KEEPS, each held by `tests/member-notes.test.mjs`:
 *
 *  - ADMINS ONLY, BOTH WAYS. Only an admin reads or writes a note, through
 *    the notes routes on the Admin SDK; `firestore.rules` refuses every
 *    browser, admins included. A programme's lead is refused.
 *  - NEVER TO THE PERSON. Nothing a member's own pages read reaches this
 *    collection, and an admin is refused the notes about themselves, as an
 *    admin is never shown their own application.
 *  - ONE RECORD PER PERSON, across programmes and terms: a note belongs to
 *    the person, not to a run, so destroying a run leaves it, with the name
 *    of the programme it came from.
 *  - USED OUTSIDE ITS PROGRAMME ONLY WHEN WRITTEN AFTER THE AGREEMENT. A note
 *    written before its person first agreed to privacy v13
 *    (`courseworkCountsFrom`) is never shown beside an application, and on a
 *    programme's own pages only when it was written from that programme
 *    (`notesShownIn`); the profile shows every note, marking those.
 *  - CLAUDE DRAFTS, AN ADMIN SAVES. A draft is never stored by the draft
 *    route; the Save that stores it carries `draftedByClaude`, and the flag is
 *    shown beside the note for as long as it is kept.
 *  - THE AUTHOR'S NAME IS LOOKED UP WHEN READ, never stored: an author whose
 *    account is deleted leaves the note, and the note no longer names them.
 *  - DELETED WITH ITS PERSON'S ACCOUNT (`deleteMemberNotes` in
 *    `accountDeletion.ts`).
 *
 * Pure: safe anywhere.
 */

export const MEMBER_NOTES_COLLECTION = "memberNotes";

export const MEMBER_NOTE_LIMITS = {
  /** One note, in characters. */
  text: 4000,
  /** The most notes one person's record holds, so a page of them is one read. */
  perPerson: 200,
} as const;

/** A stored note, read. */
export type MemberNoteDoc = {
  id: string;
  /** Whom it is about. */
  uid: string;
  text: string;
  authorUid: string;
  draftedByClaude: boolean;
  /** The course run it was written from, while that run is on the site; null for one written on the profile. */
  runId: string | null;
  /** The programme's name when it was written ("AGI Strategy, Autumn 2026"), or "". */
  programmeLabel: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** The admin who last changed its words, when that was not its author. */
  editedByUid: string;
};

/** Where a person's notes are being shown, which decides which of them are. */
export type NotesPlace =
  /** The person's own page in the admin area: every note. */
  | { kind: "profile" }
  /** A programme's pages, by the run it names: what it may use. */
  | { kind: "run"; runId: string }
  /** Beside an application: only what may be used outside a programme. */
  | { kind: "application" };

/** One note, as an admin's screen is sent it. */
export type MemberNoteView = {
  id: string;
  text: string;
  /** Who wrote it, or null when their account has gone. */
  authorName: string | null;
  /** Whether the viewer wrote it. */
  mine: boolean;
  draftedByClaude: boolean;
  /** The programme it was written from, or null. */
  programme: string | null;
  /** ISO, or null. */
  createdAt: string | null;
  updatedAt: string | null;
  /** Whether its words were changed after it was written. */
  edited: boolean;
  /**
   * Written before its person first agreed to privacy v13, so it may be used
   * only within the programme it was written from (or, written on the
   * profile, never when they are considered for something else).
   */
  beforeAgreement: boolean;
};

type Raw = Record<string, unknown>;

function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** A stored note, read. Never throws. */
export function normalizeMemberNote(id: string, data: Raw): MemberNoteDoc {
  const runId = str(data.runId);
  return {
    id,
    uid: str(data.uid),
    text: str(data.text),
    authorUid: str(data.authorUid),
    draftedByClaude: data.draftedByClaude === true,
    runId: runId || null,
    programmeLabel: str(data.programmeLabel),
    createdAt: instantOf(data.createdAt),
    updatedAt: instantOf(data.updatedAt),
    editedByUid: str(data.editedByUid),
  };
}

/**
 * A note's words as stored: plain text, control characters out (newlines
 * kept), runs of blank lines folded to one, trimmed. Never longer than the
 * limit; the route refuses a longer one rather than cutting it.
 */
export function cleanNoteText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whether a note was written before its person's moment (or they have none). */
export function writtenBeforeAgreement(note: Pick<MemberNoteDoc, "createdAt">, from: Date | null): boolean {
  return !cameAfter(note.createdAt, from);
}

/**
 * THE ONE RULE FOR WHICH NOTES A PLACE SHOWS. `from` is the person's moment
 * (`courseworkCountsFrom`), or null.
 *
 *  - The profile: every note.
 *  - A programme's pages: every note written after the moment, and the ones
 *    written before it FROM THIS PROGRAMME'S RUN.
 *  - Beside an application: only notes written after the moment.
 *
 * Newest first. `hidden` is how many the place leaves out, so the screen can
 * say so.
 */
export function notesShownIn(
  place: NotesPlace,
  notes: readonly MemberNoteDoc[],
  from: Date | null,
): { shown: MemberNoteDoc[]; hidden: number } {
  const shown = notes.filter((note) => {
    if (place.kind === "profile") return true;
    if (!writtenBeforeAgreement(note, from)) return true;
    return place.kind === "run" && note.runId === place.runId;
  });
  shown.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
  return { shown, hidden: notes.length - shown.length };
}
