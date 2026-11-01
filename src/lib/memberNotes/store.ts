import "server-only";
import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { courseworkCountsFrom } from "@/lib/legal/courseworkUse";
import { reviewUseFrom, writtenAfterReviewUse } from "@/lib/legal/reviewUse";
import {
  cleanNoteText,
  keptForLeads,
  MEMBER_NOTE_LIMITS,
  MEMBER_NOTES_COLLECTION,
  NOTE_SUGGESTIONS,
  normalizeMemberNote,
  notesShownIn,
  writtenBeforeAgreement,
  type MemberNoteDoc,
  type MemberNoteView,
  type NoteAudience,
  type NotesPlace,
  type NoteSuggestion,
} from "./model";
import { NOTES_WORDS, programmeLabelOf } from "./words";

/**
 * THE ONE READER AND WRITER OF `memberNotes`, on the Admin SDK, for the notes
 * routes and a term's Next term page. `model.ts` says what the notes are and
 * the rules they keep; this file keeps them:
 *
 *  - `gateNotes`: the admins' routes (`/api/admin/members/[uid]/notes`), an
 *    admin, and never about themselves. Decided before anything is read. A
 *    programme's lead reaches notes only through the programme's door
 *    (`./programme.ts`), which asks who they are on the programme before
 *    anything about the person is read, and then reads and writes through
 *    this file. A term's Next term page (`listNotesFromRuns`, an admin's
 *    alone) asks `canRunTerm` before it calls this file.
 *  - Every read of one person's notes is ONE EQUALITY on `uid` (the person a
 *    note is about), and the term's read is ONE `in` on `runId`, each sorted
 *    and filtered in memory, so nothing here needs a declared index.
 *  - Every answer is built field by field (`viewOf`, and the lead's
 *    projection in `./programme.ts`): the author's name is looked up as it is
 *    read and never stored, and no document leaves whole.
 *  - A note is kept for leads only when its person has agreed to privacy v15
 *    and it was written after that (`reviewUseFrom`): asking for anything
 *    else is refused rather than stored, so a note never says leads read it
 *    when none ever may.
 */

export type NotesRefusal = { ok: false; status: number; error: string };

export const refuse = (status: number, error: string): NotesRefusal => ({ ok: false, status, error });

/** Who may read or write the notes about `subjectUid` on the admins' routes: an admin, about somebody else. */
export function gateNotes(user: SessionUser, subjectUid: string): NotesRefusal | null {
  if (user.role !== "admin") return refuse(403, NOTES_WORDS.onlyAdmins);
  if (user.uid === subjectUid) return refuse(403, NOTES_WORDS.notYours);
  return null;
}

/** The person's account, or null when there is none. */
export async function loadSubject(db: Firestore, uid: string): Promise<Record<string, unknown> | null> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
}

/**
 * The names of the people who wrote notes, as a note shows them: each one's
 * preferred name, else the first word of their account's name. An account
 * that has gone is not in the answer, so its notes name nobody.
 */
export async function authorNames(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return out;
  const snaps = await db.getAll(...unique.map((uid) => db.collection("users").doc(uid)));
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const profile = (data.profile && typeof data.profile === "object" ? data.profile : {}) as Record<string, unknown>;
    const preferred = typeof profile.preferredName === "string" ? profile.preferredName.trim() : "";
    const display = typeof data.displayName === "string" ? data.displayName.trim().split(/\s+/)[0] ?? "" : "";
    out.set(snap.id, preferred || display || "A member of the team");
  }
  return out;
}

/** Every note about one person, as stored. */
export async function listNotes(db: Firestore, subjectUid: string): Promise<MemberNoteDoc[]> {
  // No limit: `keepNote` keeps a record to `MEMBER_NOTE_LIMITS.perPerson`.
  const snap = await db.collection(MEMBER_NOTES_COLLECTION).where("uid", "==", subjectUid).get();
  return snap.docs
    .map((doc) => normalizeMemberNote(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((note) => note.uid === subjectUid);
}

/** Firestore's cap on the values one `in` filter takes. */
const IN_FILTER_LIMIT = 30;

/**
 * Every note written from one of these runs, about anybody, as stored: one
 * `in` on `runId` for each 30 runs (a term names a handful). For a term's
 * Next term page alone (`src/lib/applications/nextTerm/load.ts`), which has
 * asked `canRunTerm` first and decides which of them may be used.
 */
export async function listNotesFromRuns(db: Firestore, runIds: readonly string[]): Promise<MemberNoteDoc[]> {
  const wanted = [...new Set(runIds.filter(Boolean))];
  const out: MemberNoteDoc[] = [];
  for (let at = 0; at < wanted.length; at += IN_FILTER_LIMIT) {
    const chunk = wanted.slice(at, at + IN_FILTER_LIMIT);
    const snap = await db.collection(MEMBER_NOTES_COLLECTION).where("runId", "in", chunk).get();
    for (const doc of snap.docs) {
      const note = normalizeMemberNote(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
      if (note.uid && note.runId !== null && chunk.includes(note.runId)) out.push(note);
    }
  }
  return out;
}

/** A run this person is on, for the notes' programme picker. */
export type PersonRun = { runId: string; programme: string };

/**
 * The runs this person is on: as somebody holding a place (any enrolment,
 * left or not: what they wrote stays), or as one of a live group's
 * facilitators. One equality each; a run that is gone or being destroyed is
 * left out. Sorted by name.
 */
export async function runsOf(db: Firestore, subjectUid: string): Promise<PersonRun[]> {
  const [enrolments, facilitating] = await Promise.all([
    db.collection("courseEnrolments").where("uid", "==", subjectUid).get(),
    db.collection("courseGroups").where("facilitatorUids", "array-contains", subjectUid).get(),
  ]);
  const runIds = new Set<string>();
  for (const doc of enrolments.docs) {
    const runId = (doc.data() ?? {}).runId;
    if (typeof runId === "string" && runId) runIds.add(runId);
  }
  for (const doc of facilitating.docs) {
    const data = doc.data() ?? {};
    if (data.archived !== true && typeof data.runId === "string" && data.runId) runIds.add(data.runId);
  }
  if (runIds.size === 0) return [];
  const snaps = await db.getAll(...[...runIds].map((id) => db.collection("courseRuns").doc(id)));
  const out: PersonRun[] = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (data.destroying === true) continue;
    out.push({
      runId: snap.id,
      programme:
        programmeLabelOf({
          courseTitle: typeof data.courseTitle === "string" ? data.courseTitle : "",
          label: typeof data.label === "string" ? data.label : "",
        }) || "A programme",
    });
  }
  return out.sort((a, b) => a.programme.localeCompare(b.programme, "en-GB") || a.runId.localeCompare(b.runId));
}

/** The notes a place shows, as an admin's screen is sent them. */
export type NotesPayload = {
  notes: MemberNoteView[];
  /** How many notes about this person the place leaves out. */
  hidden: number;
  /** Whether the person has agreed to the policy that lets their coursework be used: Claude drafts only then. */
  agreed: boolean;
  /** The runs a note may be written from, and Claude may draft from. */
  runs: PersonRun[];
  /** Whether a note written now may be kept for the programme's leads: the person has agreed to privacy v15. */
  forLeads: boolean;
};

/** Whether a note's words were changed after it was written. */
export function editedAfterWriting(note: Pick<MemberNoteDoc, "createdAt" | "updatedAt">): boolean {
  return Boolean(note.updatedAt && note.createdAt && note.updatedAt.getTime() - note.createdAt.getTime() > 1_000);
}

function viewOf(
  note: MemberNoteDoc,
  viewerUid: string,
  names: ReadonlyMap<string, string>,
  from: Date | null,
  reviewFrom: Date | null,
): MemberNoteView {
  return {
    id: note.id,
    text: note.text,
    authorName: names.get(note.authorUid) ?? null,
    mine: note.authorUid === viewerUid,
    draftedByClaude: note.draftedByClaude,
    programme: note.programmeLabel || null,
    createdAt: note.createdAt ? note.createdAt.toISOString() : null,
    updatedAt: note.updatedAt ? note.updatedAt.toISOString() : null,
    edited: editedAfterWriting(note),
    beforeAgreement: writtenBeforeAgreement(note, from),
    audience: keptForLeads(note, reviewFrom) ? "leads" : "admins",
    leadsMayRead: writtenAfterReviewUse(note.createdAt, reviewFrom),
    suggest: note.suggest,
  };
}

/** The places an admin's screen shows notes in: every place but a lead's. */
export type AdminNotesPlace = Exclude<NotesPlace, { kind: "lead" }>;

/** The notes about `subjectUid` that `place` shows, for an admin through either door. */
export async function loadNotes(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  place: AdminNotesPlace,
): Promise<{ ok: true; payload: NotesPayload } | NotesRefusal> {
  const subject = await loadSubject(db, subjectUid);
  if (!subject) return refuse(404, NOTES_WORDS.noAccount);
  const from = courseworkCountsFrom(subject);
  const reviewFrom = reviewUseFrom(subject);
  const [notes, runs] = await Promise.all([listNotes(db, subjectUid), runsOf(db, subjectUid)]);
  const { shown, hidden } = notesShownIn(place, notes, from, reviewFrom);
  const names = await authorNames(db, shown.map((note) => note.authorUid));
  return {
    ok: true,
    payload: {
      notes: shown.map((note) => viewOf(note, viewer.uid, names, from, reviewFrom)),
      hidden,
      agreed: from !== null,
      runs,
      forLeads: reviewFrom !== null,
    },
  };
}

/** The words of a note, checked: the cleaned text, or the sentence that refuses it. */
export function checkedText(raw: unknown): { ok: true; text: string } | NotesRefusal {
  const text = cleanNoteText(raw);
  if (!text) return refuse(400, NOTES_WORDS.empty400);
  if (text.length > MEMBER_NOTE_LIMITS.text) return refuse(400, NOTES_WORDS.tooLong(MEMBER_NOTE_LIMITS.text));
  return { ok: true, text };
}

/**
 * Who reads a note, as asked: an admin names it, "admins" or "leads", every
 * time; a programme's lead's note is always "leads", so a lead may leave it
 * out or say "leads", and is refused "admins" (only an admin keeps a note to
 * admins). `required` is false for a change, which may leave it as it is
 * (`null`).
 */
export function checkedAudience(
  raw: unknown,
  viewer: "admin" | "lead",
  required: boolean,
): { ok: true; audience: NoteAudience | null } | NotesRefusal {
  if (raw === undefined || raw === null) {
    if (viewer === "lead") return { ok: true, audience: required ? "leads" : null };
    return required ? refuse(400, NOTES_WORDS.audience400) : { ok: true, audience: null };
  }
  if (raw !== "admins" && raw !== "leads") return refuse(400, NOTES_WORDS.audience400);
  if (viewer === "lead" && raw !== "leads") return refuse(403, NOTES_WORDS.leadsAlways);
  return { ok: true, audience: raw };
}

/**
 * What a note suggests, as asked: a list of the known suggestions, each at
 * most once, kept in `NOTE_SUGGESTIONS` order. Absent is none for a new note
 * and no change for a change (`null`). Anything else is refused.
 */
export function checkedSuggest(raw: unknown, required: boolean): { ok: true; suggest: NoteSuggestion[] | null } | NotesRefusal {
  if (raw === undefined || raw === null) return { ok: true, suggest: required ? [] : null };
  if (!Array.isArray(raw) || raw.length > NOTE_SUGGESTIONS.length) return refuse(400, NOTES_WORDS.suggest400);
  if (raw.some((item) => !(NOTE_SUGGESTIONS as readonly unknown[]).includes(item))) return refuse(400, NOTES_WORDS.suggest400);
  if (new Set(raw).size !== raw.length) return refuse(400, NOTES_WORDS.suggest400);
  return { ok: true, suggest: NOTE_SUGGESTIONS.filter((suggestion) => raw.includes(suggestion)) };
}

/** A new note's own fields, checked. */
export type NoteFields = { text: string; audience: NoteAudience; suggest: NoteSuggestion[]; draftedByClaude: boolean };

/**
 * A new note's body, checked for the person writing it: its words, who reads
 * it and what it suggests. Only an admin keeps a note Claude drafted, so a
 * programme's lead who says so is refused.
 */
export function checkedNote(
  body: { text?: unknown; audience?: unknown; suggest?: unknown; draftedByClaude?: unknown },
  viewer: "admin" | "lead",
): { ok: true; fields: NoteFields } | NotesRefusal {
  const text = checkedText(body.text);
  if (!text.ok) return text;
  const audience = checkedAudience(body.audience, viewer, true);
  if (!audience.ok) return audience;
  const suggest = checkedSuggest(body.suggest, true);
  if (!suggest.ok) return suggest;
  const draftedByClaude = body.draftedByClaude === true;
  if (draftedByClaude && viewer !== "admin") return refuse(403, NOTES_WORDS.onlyAdminsKeepDrafts);
  return { ok: true, fields: { text: text.text, audience: audience.audience ?? "admins", suggest: suggest.suggest ?? [], draftedByClaude } };
}

/** A change to a note, checked: new words, and who reads it and what it suggests when they change. */
export type NoteChange = { text: string; audience: NoteAudience | null; suggest: NoteSuggestion[] | null };

export function checkedChange(
  body: { text?: unknown; audience?: unknown; suggest?: unknown },
  viewer: "admin" | "lead",
): { ok: true; change: NoteChange } | NotesRefusal {
  const text = checkedText(body.text);
  if (!text.ok) return text;
  const audience = checkedAudience(body.audience, viewer, false);
  if (!audience.ok) return audience;
  const suggest = checkedSuggest(body.suggest, false);
  if (!suggest.ok) return suggest;
  return { ok: true, change: { text: text.text, audience: audience.audience, suggest: suggest.suggest } };
}

/**
 * Keep a new note about `subjectUid`, written by `viewer`, from a run or
 * from nowhere, under the record's limit. `reviewFrom` is the person's
 * privacy v15 moment: a note is kept for leads only when there is one.
 */
export async function keepNote(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  fields: NoteFields,
  source: { runId: string | null; programmeLabel: string },
  reviewFrom: Date | null,
): Promise<{ ok: true; id: string } | NotesRefusal> {
  if (fields.audience === "leads" && reviewFrom === null) return refuse(409, NOTES_WORDS.notYetForLeads409);
  const existing = await listNotes(db, subjectUid);
  if (existing.length >= MEMBER_NOTE_LIMITS.perPerson) return refuse(409, NOTES_WORDS.full);
  const ref = db.collection(MEMBER_NOTES_COLLECTION).doc();
  await ref.set({
    uid: subjectUid,
    text: fields.text,
    authorUid: viewer.uid,
    draftedByClaude: fields.draftedByClaude,
    runId: source.runId,
    programmeLabel: source.programmeLabel,
    audience: fields.audience,
    suggest: fields.suggest,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id };
}

/** Add a note about `subjectUid`, for an admin who passed `gateNotes`, from one of their runs or from none. */
export async function addNote(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  input: NoteFields & { runId: string | null },
): Promise<{ ok: true; id: string } | NotesRefusal> {
  const subject = await loadSubject(db, subjectUid);
  if (!subject) return refuse(404, NOTES_WORDS.noAccount);
  let programmeLabel = "";
  if (input.runId) {
    const run = (await runsOf(db, subjectUid)).find((candidate) => candidate.runId === input.runId);
    if (!run) return refuse(400, NOTES_WORDS.badRun);
    programmeLabel = run.programme;
  }
  const { runId, ...fields } = input;
  return keepNote(db, viewer, subjectUid, fields, { runId, programmeLabel }, reviewUseFrom(subject));
}

/** The note `noteId` about `subjectUid`, or null: a note about somebody else is not this person's to change. */
export async function noteAbout(db: Firestore, subjectUid: string, noteId: string) {
  const ref = db.collection(MEMBER_NOTES_COLLECTION).doc(noteId);
  const snap = await ref.get();
  if (!snap.exists) return { ref, note: null };
  const note = normalizeMemberNote(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  return { ref, note: note.uid === subjectUid ? note : null };
}

/**
 * Write a change to a note that has been found and allowed: new words (with
 * who changed them, when that was not its author), who reads it, what it
 * suggests. Who wrote it, when, where from and whether Claude drafted it
 * stay. A note kept for leads must have been written after its person agreed
 * to privacy v15 (`reviewFrom`), or the change is refused.
 */
export async function writeChange(
  ref: DocumentReference,
  note: MemberNoteDoc,
  viewer: SessionUser,
  change: NoteChange,
  reviewFrom: Date | null,
): Promise<{ ok: true } | NotesRefusal> {
  if (change.audience === "leads" && !writtenAfterReviewUse(note.createdAt, reviewFrom)) {
    return refuse(409, NOTES_WORDS.staysWithAdmins409);
  }
  const update: Record<string, unknown> = {};
  if (change.text !== note.text) {
    update.text = change.text;
    update.updatedAt = FieldValue.serverTimestamp();
    update.editedByUid = viewer.uid === note.authorUid ? FieldValue.delete() : viewer.uid;
  }
  if (change.audience !== null && change.audience !== note.audience) update.audience = change.audience;
  if (change.suggest !== null && change.suggest.join(" ") !== note.suggest.join(" ")) update.suggest = change.suggest;
  if (Object.keys(update).length > 0) await ref.update(update);
  return { ok: true };
}

/** Change a note, for an admin who passed `gateNotes`: any note about the person. */
export async function editNote(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  noteId: string,
  change: NoteChange,
): Promise<{ ok: true } | NotesRefusal> {
  const { ref, note } = await noteAbout(db, subjectUid, noteId);
  if (!note) return refuse(404, NOTES_WORDS.gone);
  // The person's v15 moment is read only when a change asks for leads.
  const reviewFrom = change.audience === "leads" ? reviewUseFrom(await loadSubject(db, subjectUid)) : null;
  return writeChange(ref, note, viewer, change, reviewFrom);
}

/** Delete a note, for an admin who passed `gateNotes`. Gone for good: nothing keeps a copy. */
export async function deleteNote(db: Firestore, subjectUid: string, noteId: string): Promise<{ ok: true } | NotesRefusal> {
  const { ref, note } = await noteAbout(db, subjectUid, noteId);
  if (!note) return refuse(404, NOTES_WORDS.gone);
  await ref.delete();
  return { ok: true };
}
