import { cameAfter } from "@/lib/legal/courseworkUse";
import { writtenAfterReviewUse } from "@/lib/legal/reviewUse";

/**
 * NOTES THE TEAM KEEPS ABOUT A PERSON (privacy v13, "Notes admins keep about
 * you"; privacy v15, "Notes about you").
 *
 * `memberNotes/{noteId}`: one document per note, about one person (`uid`),
 * written by an admin or by the lead of a programme the person is on
 * (`authorUid`), perhaps drafted by Claude and saved by an admin
 * (`draftedByClaude`), perhaps written from one programme's run (`runId`,
 * with the programme's name as it was then, `programmeLabel`, so the note
 * still says where it came from once the run has gone). Each says WHO READS
 * IT (`audience`): admins only, or admins and the programme's leads. A note
 * with no `audience`, every note written before version 15, is admins only.
 * Any note may suggest its person for something next term (`suggest`).
 *
 * THE RULES THIS FEATURE KEEPS, held by `tests/coursework-claude.test.mjs`
 * (the admins' routes) and `tests/notes-for-leads.test.mjs` (the leads'):
 *
 *  - ADMINS READ AND WRITE EVERY NOTE, through the routes on the Admin SDK;
 *    `firestore.rules` refuses every browser, admins included.
 *  - A PROGRAMME'S LEAD READS ONLY THE NOTES KEPT FOR LEADS (`keptForLeads`),
 *    about somebody holding a place on their programme now or facilitating
 *    one of its live groups, written after that person agreed to privacy
 *    v15 (`reviewUseFrom`), and allowed by the place rule below. A lead's
 *    own notes are always kept for leads, and a lead changes or deletes
 *    only their own. Only an admin keeps a note to admins, changes who reads
 *    one, or saves a note Claude drafted.
 *  - NEVER TO THE PERSON. Nothing a member's own pages read reaches this
 *    collection, and nobody is shown the notes about themselves, as an admin
 *    is never shown their own application.
 *  - ONE RECORD PER PERSON, across programmes and terms: a note belongs to
 *    the person, not to a run, so destroying a run leaves it, with the name
 *    of the programme it came from.
 *  - USED OUTSIDE ITS PROGRAMME ONLY WHEN WRITTEN AFTER THE AGREEMENT. A note
 *    written before its person first agreed to privacy v13
 *    (`courseworkCountsFrom`) is never shown beside an application, and on a
 *    programme's own pages only when it was written from that programme
 *    (`notesShownIn`); the profile shows every note, marking those.
 *  - CLAUDE DRAFTS, AN ADMIN SAVES. The profile's draft is never stored; an
 *    end-of-week draft is kept with its run, never here, until an admin saves
 *    or discards it (`src/lib/courses/weekNotes/`). Only a Save makes a note,
 *    carrying `draftedByClaude` (and, for an end-of-week note, its week and
 *    what it was built from, `builtFrom`), and the flag is shown beside the
 *    note for as long as it is kept, to everybody who reads it.
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

/** Who reads a note: admins alone, or admins and the leads of a programme its person is on. */
export type NoteAudience = "admins" | "leads";

export const NOTE_AUDIENCES: readonly NoteAudience[] = ["admins", "leads"];

/** What a note may suggest its person for next term, in the order a note shows them. */
export type NoteSuggestion = "facilitating" | "incubator" | "committee";

export const NOTE_SUGGESTIONS: readonly NoteSuggestion[] = ["facilitating", "incubator", "committee"];

/**
 * A note written by a person, or an end-of-week note: Claude's draft from one
 * submitted week, read, edited and saved by an admin on the week's Notes page.
 */
export type NoteKind = "note" | "weekly";

/** As what a piece of feedback was written: by the person's facilitator, the programme's lead or an admin. */
export type NoteSourceRole = "facilitator" | "lead" | "admin";

/**
 * ONE THING AN END-OF-WEEK NOTE WAS BUILT FROM, exactly as Claude was sent it
 * (privacy v15: "using only the work they submitted and the feedback, ratings
 * and comments people on the team gave it"). A draft keeps the list, and a
 * saved note keeps it as its "Built only from":
 *
 *  - `work`: a submitted week's own work, how many written answers,
 *    reflections and boxes went, and when the week was submitted;
 *  - `levels`: feedback given before pieces existed, sent as its levels on
 *    the course's rubric and never its comment;
 *  - `feedback`: one piece of feedback, by its writer and as what they wrote;
 *  - `rating`: one rating for the team with its comment, and the label its
 *    rater went by in the message ("Rater 1").
 *
 * Names are never kept: a writer is an account, named when the note is read,
 * so an account that has gone names nobody. Deleting an account takes its
 * own entries out (`sourcesWithout`), because a rating copied here is still
 * a rating it gave.
 */
export type NoteSource =
  | { kind: "work"; weekNumber: number; submittedAt: Date | null; written: number; reflections: number; boxes: number }
  | { kind: "levels"; weekNumber: number }
  | { kind: "feedback"; weekNumber: number; byUid: string; role: NoteSourceRole; on: "writtenAnswer" | "week"; at: Date | null }
  | {
      kind: "rating";
      weekNumber: number;
      raterUid: string;
      role: "lead" | "admin";
      /** "Rater 1": what Claude's words call this rater. */
      label: string;
      rating: number;
      comment: string;
      at: Date | null;
    };

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
  /** Who reads it, as stored: absent (every note written before version 15) reads as admins only. */
  audience: NoteAudience;
  /** What it suggests its person for next term, in `NOTE_SUGGESTIONS` order; none when absent. */
  suggest: NoteSuggestion[];
  /** "note" unless an end-of-week note says otherwise. */
  kind: NoteKind;
  /** The week an end-of-week note is about, or null. */
  weekId: string | null;
  weekNumber: number | null;
  /** What an end-of-week note was built from, as Claude was sent it; none for any other note. */
  builtFrom: NoteSource[];
  createdAt: Date | null;
  updatedAt: Date | null;
  /** The admin who last changed its words, when that was not its author. */
  editedByUid: string;
};

/** Where a person's notes are being shown, which decides which of them are. */
export type NotesPlace =
  /** The person's own page in the admin area: every note. */
  | { kind: "profile" }
  /** A programme's pages, by the run it names, for an admin: what it may use. */
  | { kind: "run"; runId: string }
  /** The same pages, for the programme's lead: of those, only what is kept for leads. */
  | { kind: "lead"; runId: string }
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
  /** Who reads it now: leads only when it is kept for them and was written after its person agreed to v15. */
  audience: NoteAudience;
  /** Whether it was written after its person agreed to v15, so an admin may keep it for leads. */
  leadsMayRead: boolean;
  suggest: NoteSuggestion[];
};

/**
 * One note, as a programme's lead is sent it: a note kept for leads, so
 * nothing in it says what admins keep to themselves or what Claude may use.
 */
export type LeadNoteView = Pick<
  MemberNoteView,
  "id" | "text" | "authorName" | "mine" | "draftedByClaude" | "programme" | "createdAt" | "updatedAt" | "edited" | "suggest"
> & { audience: "leads" };

type Raw = Record<string, unknown>;

function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** A stored audience: "leads" only when it says exactly that, so anything else is admins only. */
export function audienceOf(value: unknown): NoteAudience {
  return value === "leads" ? "leads" : "admins";
}

/** Stored suggestions: the known ones, each once, in `NOTE_SUGGESTIONS` order. */
export function suggestionsOf(value: unknown): NoteSuggestion[] {
  const given = Array.isArray(value) ? value : [];
  return NOTE_SUGGESTIONS.filter((suggestion) => given.includes(suggestion));
}

const count = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0);

/** One stored source, read, or null for anything that is not one. */
function sourceOf(value: unknown): NoteSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Raw;
  const weekNumber = count(raw.weekNumber);
  if (weekNumber === 0) return null;
  if (raw.kind === "work") {
    return {
      kind: "work",
      weekNumber,
      submittedAt: instantOf(raw.submittedAt),
      written: count(raw.written),
      reflections: count(raw.reflections),
      boxes: count(raw.boxes),
    };
  }
  if (raw.kind === "levels") return { kind: "levels", weekNumber };
  if (raw.kind === "feedback") {
    const role: NoteSourceRole = raw.role === "facilitator" || raw.role === "lead" ? raw.role : "admin";
    return { kind: "feedback", weekNumber, byUid: str(raw.byUid), role, on: raw.on === "writtenAnswer" ? "writtenAnswer" : "week", at: instantOf(raw.at) };
  }
  if (raw.kind === "rating") {
    const rating = typeof raw.rating === "number" && Number.isInteger(raw.rating) && raw.rating >= 1 && raw.rating <= 10 ? raw.rating : null;
    if (rating === null) return null;
    return {
      kind: "rating",
      weekNumber,
      raterUid: str(raw.raterUid),
      role: raw.role === "lead" ? "lead" : "admin",
      label: str(raw.label),
      rating,
      comment: str(raw.comment),
      at: instantOf(raw.at),
    };
  }
  return null;
}

/** Stored sources, read: the ones that are sources, in the order kept. Never throws. */
export function noteSourcesOf(value: unknown): NoteSource[] {
  return (Array.isArray(value) ? value : []).map(sourceOf).filter((source): source is NoteSource => source !== null);
}

/** Every account a list of sources names (a feedback writer, a rater), each once: what an account's deletion finds it by. */
export function sourceUidsOf(sources: readonly NoteSource[]): string[] {
  const uids = sources.map((source) => (source.kind === "feedback" ? source.byUid : source.kind === "rating" ? source.raterUid : ""));
  return [...new Set(uids.filter(Boolean))].sort();
}

/** The sources without anything `uid` wrote or gave: what is left once their account is deleted. */
export function sourcesWithout(sources: readonly NoteSource[], uid: string): NoteSource[] {
  return sources.filter((source) => !(source.kind === "feedback" && source.byUid === uid) && !(source.kind === "rating" && source.raterUid === uid));
}

/** Whether any of these notes is the end-of-week note kept from one week of one run: at most one ever is. */
export function keptFromWeek(notes: ReadonlyArray<Pick<MemberNoteDoc, "kind" | "runId" | "weekId">>, runId: string, weekId: string): boolean {
  return notes.some((note) => note.kind === "weekly" && note.runId === runId && note.weekId === weekId);
}

/** A stored note, read. Never throws. */
export function normalizeMemberNote(id: string, data: Raw): MemberNoteDoc {
  const runId = str(data.runId);
  const weekId = str(data.weekId);
  const weekNumber = typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) && data.weekNumber > 0 ? data.weekNumber : null;
  return {
    id,
    uid: str(data.uid),
    text: str(data.text),
    authorUid: str(data.authorUid),
    draftedByClaude: data.draftedByClaude === true,
    runId: runId || null,
    programmeLabel: str(data.programmeLabel),
    audience: audienceOf(data.audience),
    suggest: suggestionsOf(data.suggest),
    kind: data.kind === "weekly" ? "weekly" : "note",
    weekId: weekId || null,
    weekNumber,
    builtFrom: noteSourcesOf(data.builtFrom),
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
 * Whether the leads of a programme its person is on may read a note: it is
 * kept for them, and it was written after its person agreed to privacy v15
 * (`reviewFrom`, from `reviewUseFrom`). Every note written before that
 * moment, and every note about somebody with no moment, stays an admin's.
 */
export function keptForLeads(note: Pick<MemberNoteDoc, "audience" | "createdAt">, reviewFrom: Date | null): boolean {
  return note.audience === "leads" && writtenAfterReviewUse(note.createdAt, reviewFrom);
}

/**
 * THE ONE RULE FOR WHICH NOTES A PLACE SHOWS. `from` is the person's moment
 * (`courseworkCountsFrom`), or null; `reviewFrom` is their privacy v15 moment
 * (`reviewUseFrom`), or null, and only a lead's place reads it.
 *
 *  - The profile: every note.
 *  - A programme's pages: every note written after the moment, and the ones
 *    written before it FROM THIS PROGRAMME'S RUN.
 *  - The same pages for the programme's lead: of those, only the notes kept
 *    for leads (`keptForLeads`). Which people a lead is shown notes about is
 *    the programme's door (`openProgrammeNotes`), never this.
 *  - Beside an application: only notes written after the moment.
 *
 * Newest first. `hidden` is how many the place leaves out, so an admin's
 * screen can say so; a lead is never sent it.
 */
export function notesShownIn(
  place: NotesPlace,
  notes: readonly MemberNoteDoc[],
  from: Date | null,
  reviewFrom: Date | null = null,
): { shown: MemberNoteDoc[]; hidden: number } {
  const shown = notes.filter((note) => {
    if (place.kind === "profile") return true;
    const usable = !writtenBeforeAgreement(note, from) || (place.kind !== "application" && note.runId === place.runId);
    if (place.kind === "lead") return usable && keptForLeads(note, reviewFrom);
    return usable;
  });
  shown.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
  return { shown, hidden: notes.length - shown.length };
}
