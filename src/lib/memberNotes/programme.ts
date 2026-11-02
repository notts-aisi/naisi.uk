import "server-only";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { hasBeenTold, isInTerm } from "@/lib/applications/decisions";
import { holdsPlaceOn } from "@/lib/applications/handover/holders";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadForm } from "@/lib/applications/repo";
import { loadApplication, loadDecision } from "@/lib/applications/staffRepo";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { courseworkCountsFrom } from "@/lib/legal/courseworkUse";
import { reviewUseFrom } from "@/lib/legal/reviewUse";
import { notesShownIn, type LeadNoteView, type MemberNoteDoc } from "./model";
import {
  authorNames,
  editedAfterWriting,
  keepNote,
  listNotes,
  loadNotes,
  loadSubject,
  noteAbout,
  refuse,
  writeChange,
  type NoteChange,
  type NoteFields,
  type NotesPayload,
  type NotesRefusal,
} from "./store";
import { NOTES_WORDS, programmeLabelOf } from "./words";

/**
 * NOTES ABOUT THE PEOPLE ON ONE PROGRAMME, THROUGH THE PROGRAMME'S DOOR
 * (privacy v15: "Admins, and the people leading a programme you are on, may
 * keep notes about you"). What the routes under
 * `/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes`
 * read and write, for the programme's lead and admins. `./model.ts` says what
 * a note is; `./store.ts` reads and writes the collection.
 *
 * THE DOOR (`openProgrammeNotes`), in this order, before anything about the
 * person is read: nobody is shown the notes about themselves; then the
 * programme's own gate (`loadProgrammeRun`, decided from the form by
 * `roleOnProgramme`, the one predicate that says who leads a programme, so
 * whoever it comes to admit beside the lead is admitted here with no change):
 * an admin or the programme's lead, a reviewer told the notes are not theirs,
 * anybody else answered as a programme that is not there; then the run the
 * programme names; then the person must be on the programme now, as the
 * coursework door counts people (`openCourseworkDoor`): holding a place on it
 * (`holdsPlaceOn`, nobody before decision day) or facilitating one of its
 * run's live groups. Only then is their account read.
 *
 * WHAT A LEAD IS SHOWN: the notes kept for leads (`notesShownIn`'s lead
 * place), each projected for them (`projectNotesForLead`): never how many
 * others there are, and nothing an admin is sent for Claude. An admin is
 * shown the programme's place as an admin's screen is (`loadNotes`).
 *
 * WHAT A LEAD WRITES: a note from the programme's run, always kept for leads,
 * never one Claude drafted, and only about somebody who has agreed to privacy
 * v15 (until then only admins keep notes about them). A lead changes or
 * deletes only a note they added, and only while they may read it; any other
 * is answered as a note that is not here, or refused as somebody else's. An
 * admin writes and changes any note here as on the admins' routes.
 */

/** The programme's door, open on one person. */
export type ProgrammeNotesDoor = {
  ok: true;
  viewer: "admin" | "lead";
  subjectUid: string;
  /** The run the programme names: notes written here are from it. */
  runId: string;
  /** The programme's name as a note keeps it ("AGI Strategy, Autumn 2026"). */
  programme: string;
  /** The person's privacy v13 moment (`courseworkCountsFrom`), or null. */
  from: Date | null;
  /** The person's privacy v15 moment (`reviewUseFrom`), or null. */
  reviewFrom: Date | null;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Open the programme's door on one person, or say why it stays shut. Nothing about them is read before it opens. */
export async function openProgrammeNotes(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  subjectUid: string,
): Promise<ProgrammeNotesDoor | NotesRefusal> {
  if (user.uid === subjectUid) return refuse(403, NOTES_WORDS.notYours);
  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return refuse(404, NOTES_WORDS.noProgramme);
  if (outcome.status === "not-yours") return refuse(403, NOTES_WORDS.notTheirs);
  const { view } = outcome;
  if (!view.run) return refuse(409, NOTES_WORDS.noRun);
  const runId = view.run.id;

  const form = await loadForm(db, view.roundId);
  // Nobody holds a place until decision day, and nothing about anybody is read before it.
  if (!form || form.decisionsSentAt === null) return refuse(404, NOTES_WORDS.notOnProgramme);
  // The groups they facilitate (one equality), of which a live one on this run counts.
  const [facilitating, application] = await Promise.all([
    db.collection("courseGroups").where("facilitatorUids", "array-contains", subjectUid).get(),
    loadApplication(db, form, subjectUid),
  ]);
  let onProgramme = facilitating.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .some((group) => group.runId === runId && !group.archived);
  // Their decision is read only once decision day has told them, as week 1's door reads it.
  if (!onProgramme && application?.sent && isInTerm(application) && hasBeenTold(application)) {
    onProgramme = holdsPlaceOn(form, view.programmeId, application, await loadDecision(db, form.round.id, subjectUid));
  }
  if (!onProgramme) return refuse(404, NOTES_WORDS.notOnProgramme);

  const [subject, runSnap] = await Promise.all([loadSubject(db, subjectUid), db.collection("courseRuns").doc(runId).get()]);
  if (!subject) return refuse(404, NOTES_WORDS.noAccount);
  const run = (runSnap.data() ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    viewer: view.viewer,
    subjectUid,
    runId,
    programme: programmeLabelOf({ courseTitle: str(run.courseTitle), label: str(run.label) }) || view.programmeName,
    from: courseworkCountsFrom(subject),
    reviewFrom: reviewUseFrom(subject),
  };
}

/** What a programme's lead is shown about one person, before it is projected for them. */
export type LeadNotes = {
  notes: MemberNoteDoc[];
  names: ReadonlyMap<string, string>;
  viewerUid: string;
  /** Whether a note written now may be kept for the programme's leads: the person has agreed to privacy v15. */
  forLeads: boolean;
};

/** The notes the door's person has, as the programme's place shows them to this viewer. */
export async function loadProgrammeNotes(
  db: Firestore,
  user: SessionUser,
  door: ProgrammeNotesDoor,
): Promise<{ ok: true; viewer: "admin"; payload: NotesPayload } | { ok: true; viewer: "lead"; lead: LeadNotes } | NotesRefusal> {
  if (door.viewer === "admin") {
    const loaded = await loadNotes(db, user, door.subjectUid, { kind: "run", runId: door.runId });
    return loaded.ok ? { ok: true, viewer: "admin", payload: loaded.payload } : loaded;
  }
  const notes = await listNotes(db, door.subjectUid);
  const { shown } = notesShownIn({ kind: "lead", runId: door.runId }, notes, door.from, door.reviewFrom);
  const names = await authorNames(db, shown.map((note) => note.authorUid));
  return { ok: true, viewer: "lead", lead: { notes: shown, names, viewerUid: user.uid, forLeads: door.reviewFrom !== null } };
}

/**
 * The notes about one person, as A PROGRAMME'S LEAD is sent them: each note
 * kept for leads, field by field, with who wrote it and when, whether Claude
 * drafted it, the programme it came from and what it suggests. It withholds
 * everything else an admin's screen is sent: how many notes the place leaves
 * out (`hidden`), whether the person's coursework may go to Claude
 * (`agreed`), the runs Claude may draft from (`runs`), whether Claude is set
 * up (`claude`), and on each note the privacy v13 mark and whether an admin
 * may share it (`beforeAgreement`, `leadsMayRead`).
 */
export function projectNotesForLead(loaded: LeadNotes): { notes: LeadNoteView[]; forLeads: boolean } {
  return {
    notes: loaded.notes.map((note) => ({
      id: note.id,
      text: note.text,
      authorName: loaded.names.get(note.authorUid) ?? null,
      mine: note.authorUid === loaded.viewerUid,
      draftedByClaude: note.draftedByClaude,
      programme: note.programmeLabel || null,
      createdAt: note.createdAt ? note.createdAt.toISOString() : null,
      updatedAt: note.updatedAt ? note.updatedAt.toISOString() : null,
      edited: editedAfterWriting(note),
      audience: "leads",
      suggest: note.suggest,
    })),
    forLeads: loaded.forLeads,
  };
}

/** Keep a new note about the door's person, from the programme's run. A lead's is always kept for leads, and never Claude's. */
export async function addProgrammeNote(
  db: Firestore,
  user: SessionUser,
  door: ProgrammeNotesDoor,
  fields: NoteFields,
): Promise<{ ok: true; id: string } | NotesRefusal> {
  if (door.viewer === "lead") {
    if (fields.audience !== "leads") return refuse(403, NOTES_WORDS.leadsAlways);
    if (fields.draftedByClaude) return refuse(403, NOTES_WORDS.onlyAdminsKeepDrafts);
  }
  return keepNote(db, user, door.subjectUid, fields, { runId: door.runId, programmeLabel: door.programme }, door.reviewFrom);
}

/** Whether the person asking wrote the note: a programme's lead changes or deletes only their own. */
function wroteIt(note: MemberNoteDoc, user: SessionUser): boolean {
  return note.authorUid === user.uid;
}

/** The note `noteId` about the door's person, as this viewer may change it, or the refusal. */
async function changeableNote(
  db: Firestore,
  user: SessionUser,
  door: ProgrammeNotesDoor,
  noteId: string,
): Promise<{ ok: true; ref: DocumentReference; note: MemberNoteDoc } | NotesRefusal> {
  const { ref, note } = await noteAbout(db, door.subjectUid, noteId);
  if (!note) return refuse(404, NOTES_WORDS.gone);
  if (door.viewer === "lead") {
    // A note the lead may not read is answered as a note that is not here.
    const readable = notesShownIn({ kind: "lead", runId: door.runId }, [note], door.from, door.reviewFrom).shown.length > 0;
    if (!readable) return refuse(404, NOTES_WORDS.gone);
    if (!wroteIt(note, user)) return refuse(403, NOTES_WORDS.notYourNote);
  }
  return { ok: true, ref, note };
}

/** Change a note about the door's person: a lead's own words and suggestions, or anything an admin may change. */
export async function editProgrammeNote(
  db: Firestore,
  user: SessionUser,
  door: ProgrammeNotesDoor,
  noteId: string,
  change: NoteChange,
): Promise<{ ok: true } | NotesRefusal> {
  if (door.viewer === "lead" && change.audience !== null && change.audience !== "leads") return refuse(403, NOTES_WORDS.leadsAlways);
  const found = await changeableNote(db, user, door, noteId);
  if (!found.ok) return found;
  return writeChange(found.ref, found.note, user, change, door.reviewFrom);
}

/** Delete a note about the door's person: a lead's own, or any for an admin. Gone for good. */
export async function deleteProgrammeNote(
  db: Firestore,
  user: SessionUser,
  door: ProgrammeNotesDoor,
  noteId: string,
): Promise<{ ok: true } | NotesRefusal> {
  const found = await changeableNote(db, user, door, noteId);
  if (!found.ok) return found;
  await found.ref.delete();
  return { ok: true };
}
