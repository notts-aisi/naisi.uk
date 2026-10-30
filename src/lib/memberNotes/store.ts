import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { courseworkCountsFrom } from "@/lib/legal/courseworkUse";
import {
  cleanNoteText,
  MEMBER_NOTE_LIMITS,
  MEMBER_NOTES_COLLECTION,
  normalizeMemberNote,
  notesShownIn,
  writtenBeforeAgreement,
  type MemberNoteDoc,
  type MemberNoteView,
  type NotesPlace,
} from "./model";
import { NOTES_WORDS, programmeLabelOf } from "./words";

/**
 * THE ONE READER AND WRITER OF `memberNotes`, on the Admin SDK, for the notes
 * routes alone. `model.ts` says what the notes are and the rules they keep;
 * this file keeps them:
 *
 *  - `gateNotes`: an admin, and never about themselves. Decided before
 *    anything is read.
 *  - Every read is ONE EQUALITY on `uid` (the person a note is about), sorted
 *    and filtered in memory, so nothing here needs a declared index.
 *  - Every answer is built field by field (`viewOf`): the author's name is
 *    looked up as it is read and never stored, and no document leaves whole.
 */

export type NotesRefusal = { ok: false; status: number; error: string };

const refuse = (status: number, error: string): NotesRefusal => ({ ok: false, status, error });

/** Who may read or write the notes about `subjectUid`: an admin, about somebody else. */
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
 * The names of the admins who wrote notes, as a note shows them: each one's
 * preferred name, else the first word of their account's name. An account
 * that has gone is not in the answer, so its notes name nobody.
 */
async function authorNames(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
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
    out.set(snap.id, preferred || display || "An admin");
  }
  return out;
}

/** Every note about one person, as stored. */
export async function listNotes(db: Firestore, subjectUid: string): Promise<MemberNoteDoc[]> {
  // No limit: `addNote` keeps a record to `MEMBER_NOTE_LIMITS.perPerson`.
  const snap = await db.collection(MEMBER_NOTES_COLLECTION).where("uid", "==", subjectUid).get();
  return snap.docs
    .map((doc) => normalizeMemberNote(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((note) => note.uid === subjectUid);
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

/** The notes a place shows, as the screen is sent them. */
export type NotesPayload = {
  notes: MemberNoteView[];
  /** How many notes about this person the place leaves out. */
  hidden: number;
  /** Whether the person has agreed to the policy that lets their coursework be used: Claude drafts only then. */
  agreed: boolean;
  /** The runs a note may be written from, and Claude may draft from. */
  runs: PersonRun[];
};

function viewOf(note: MemberNoteDoc, viewerUid: string, names: ReadonlyMap<string, string>, from: Date | null): MemberNoteView {
  return {
    id: note.id,
    text: note.text,
    authorName: names.get(note.authorUid) ?? null,
    mine: note.authorUid === viewerUid,
    draftedByClaude: note.draftedByClaude,
    programme: note.programmeLabel || null,
    createdAt: note.createdAt ? note.createdAt.toISOString() : null,
    updatedAt: note.updatedAt ? note.updatedAt.toISOString() : null,
    edited: Boolean(note.updatedAt && note.createdAt && note.updatedAt.getTime() - note.createdAt.getTime() > 1_000),
    beforeAgreement: writtenBeforeAgreement(note, from),
  };
}

/** The notes about `subjectUid` that `place` shows, for an admin who passed `gateNotes`. */
export async function loadNotes(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  place: NotesPlace,
): Promise<{ ok: true; payload: NotesPayload } | NotesRefusal> {
  const subject = await loadSubject(db, subjectUid);
  if (!subject) return refuse(404, NOTES_WORDS.noAccount);
  const from = courseworkCountsFrom(subject);
  const [notes, runs] = await Promise.all([listNotes(db, subjectUid), runsOf(db, subjectUid)]);
  const { shown, hidden } = notesShownIn(place, notes, from);
  const names = await authorNames(db, shown.map((note) => note.authorUid));
  return {
    ok: true,
    payload: {
      notes: shown.map((note) => viewOf(note, viewer.uid, names, from)),
      hidden,
      agreed: from !== null,
      runs,
    },
  };
}

/** What a new note may carry. */
export type NewNote = { text: unknown; runId: unknown; draftedByClaude: unknown };

/** The words of a note, checked: the cleaned text, or the sentence that refuses it. */
export function checkedText(raw: unknown): { ok: true; text: string } | NotesRefusal {
  const text = cleanNoteText(raw);
  if (!text) return refuse(400, NOTES_WORDS.empty400);
  if (text.length > MEMBER_NOTE_LIMITS.text) return refuse(400, NOTES_WORDS.tooLong(MEMBER_NOTE_LIMITS.text));
  return { ok: true, text };
}

/** Add a note about `subjectUid`, for an admin who passed `gateNotes`, and answer with the profile's view. */
export async function addNote(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  input: { text: string; runId: string | null; draftedByClaude: boolean },
): Promise<{ ok: true; id: string } | NotesRefusal> {
  const subject = await loadSubject(db, subjectUid);
  if (!subject) return refuse(404, NOTES_WORDS.noAccount);
  let programmeLabel = "";
  if (input.runId) {
    const run = (await runsOf(db, subjectUid)).find((candidate) => candidate.runId === input.runId);
    if (!run) return refuse(400, NOTES_WORDS.badRun);
    programmeLabel = run.programme;
  }
  const existing = await listNotes(db, subjectUid);
  if (existing.length >= MEMBER_NOTE_LIMITS.perPerson) return refuse(409, NOTES_WORDS.full);
  const ref = db.collection(MEMBER_NOTES_COLLECTION).doc();
  await ref.set({
    uid: subjectUid,
    text: input.text,
    authorUid: viewer.uid,
    draftedByClaude: input.draftedByClaude,
    runId: input.runId,
    programmeLabel,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, id: ref.id };
}

/** The note `noteId` about `subjectUid`, or the refusal: a note about somebody else is not this person's to change. */
async function ownNote(db: Firestore, subjectUid: string, noteId: string) {
  const ref = db.collection(MEMBER_NOTES_COLLECTION).doc(noteId);
  const snap = await ref.get();
  if (!snap.exists) return { ref, note: null };
  const note = normalizeMemberNote(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
  return { ref, note: note.uid === subjectUid ? note : null };
}

/** Change a note's words. Who wrote it, when, where from and whether Claude drafted it stay. */
export async function editNote(
  db: Firestore,
  viewer: SessionUser,
  subjectUid: string,
  noteId: string,
  text: string,
): Promise<{ ok: true } | NotesRefusal> {
  const { ref, note } = await ownNote(db, subjectUid, noteId);
  if (!note) return refuse(404, NOTES_WORDS.gone);
  if (note.text === text) return { ok: true };
  await ref.update({
    text,
    updatedAt: FieldValue.serverTimestamp(),
    editedByUid: viewer.uid === note.authorUid ? FieldValue.delete() : viewer.uid,
  });
  return { ok: true };
}

/** Delete a note. Gone for good: nothing keeps a copy. */
export async function deleteNote(db: Firestore, subjectUid: string, noteId: string): Promise<{ ok: true } | NotesRefusal> {
  const { ref, note } = await ownNote(db, subjectUid, noteId);
  if (!note) return refuse(404, NOTES_WORDS.gone);
  await ref.delete();
  return { ok: true };
}
