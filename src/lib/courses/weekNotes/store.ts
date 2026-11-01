import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isInTerm } from "@/lib/applications/decisions";
import { listSentApplications } from "@/lib/applications/staffRepo";
import { loadForm } from "@/lib/applications/repo";
import { claudeConfigured } from "@/lib/ai/claude";
import { askForNoteDraft } from "@/lib/courses/coursework/claude";
import { fellowsOf, runPeopleToScrub, RUNNING_LABEL, type DoorRefusal } from "@/lib/courses/coursework/door";
import { noteDraftInput, noteLabelSlips, type NameToLabel, type NoteDraftInput, type RunPerson } from "@/lib/courses/coursework/input";
import type { SessionUser } from "@/lib/firebase/session";
import {
  COURSE_NOTE_DRAFTS_COLLECTION,
  noteDraftFields,
  noteDraftId,
  normalizeNoteDraft,
  type CourseNoteDraftDoc,
} from "@/lib/firestore/courseNoteDrafts";
import { courseworkCountsFrom } from "@/lib/legal/courseworkUse";
import { reviewUseFrom } from "@/lib/legal/reviewUse";
import { keptFromWeek, notesShownIn, type MemberNoteDoc } from "@/lib/memberNotes/model";
import { authorNames, checkedNote, keepWeeklyNoteIn, listNotes, listWeekNotes, loadSubject, weekNoteKeptIn } from "@/lib/memberNotes/store";
import { NOTES_WORDS, programmeLabelOf } from "@/lib/memberNotes/words";
import { openWeekNotes, type WeekNotesDoor } from "./door";
import { gatherPersonNote, gatherWeekNotes, weekIsSubmitted, type PersonNoteSources } from "./gather";
import { weekNotesAdminView, weekNotesLeadView, type NotesPerson, type WeekNotesAdminView, type WeekNotesLeadView } from "./view";
import { WEEK_NOTES_WORDS } from "./words";

/**
 * A WEEK'S NOTES ABOUT PEOPLE, KEPT AND READ (privacy v15). Claude drafts one
 * note per person whose week is submitted and not reopened since, from that
 * week's work and the team's words on it (`noteDraftInput`); an admin reads,
 * edits and saves it to the person's notes, or discards it.
 *
 * `loadWeekNotes` is the page's, for an admin or the programme's lead,
 * behind the week's door: an admin is handed the drafts, the saved notes,
 * the counts and who a press would draft for, each worked out from what
 * would be sent NOW (only counted, never sent); the lead is handed the saved
 * notes kept for leads, chosen by the notes' one rule, and nothing of any
 * draft. It writes nothing and sends nothing.
 *
 * The presses, each an admin's alone (`adminOnly`), each behind the door
 * again:
 *  - `draftWeekNote`: one person, once every group has met; one request to
 *    Claude; kept as `courseNoteDrafts/{runId}__{weekId}__{uid}`, in a
 *    transaction that refuses when a note from this week is already saved,
 *    or a draft is already there and this is not "Draft again".
 *  - `saveWeekNote`: the admin's words, who reads it and what it suggests,
 *    kept as an end-of-week note (`keepWeeklyNoteIn`) with what the draft was
 *    built from, and the draft deleted, in one transaction.
 *  - `discardWeekNote`: the draft deleted.
 *
 * KEPT WITH THE RUN: drafts are deleted with it (`courseDeletion.ts`,
 * `noteDrafts`), drafts about an account with the account, and an account's
 * ratings and feedback are taken out of what drafts and notes were built from
 * (`accountDeletion.ts`). Never on anybody's profile until saved.
 */

const coursework = (roundId: string, programmeId: string) =>
  `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/coursework`;

export type WeekNotesPage =
  | { viewer: "admin"; opened: WeekNotesDoor; view: WeekNotesAdminView }
  | { viewer: "lead"; opened: WeekNotesDoor; view: WeekNotesLeadView };

/** Every draft kept from one week of a run: one equality on `runId`, filtered in memory. */
async function readWeekDrafts(db: Firestore, runId: string, weekId: string): Promise<Map<string, CourseNoteDraftDoc>> {
  const snap = await db.collection(COURSE_NOTE_DRAFTS_COLLECTION).where("runId", "==", runId).get();
  const out = new Map<string, CourseNoteDraftDoc>();
  for (const doc of snap.docs) {
    const draft = normalizeNoteDraft(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (draft.runId === runId && draft.weekId === weekId && draft.uid) out.set(draft.uid, draft);
  }
  return out;
}

/**
 * The people the page lists: holding a place, never a facilitator, each with
 * their group on the run, and never the person looking: nobody is shown the
 * notes about themselves, an admin included.
 */
function peopleOf(opened: WeekNotesDoor, viewerUid: string): NotesPerson[] {
  const fellows = fellowsOf(opened.door);
  return opened.door.holders
    .filter((holder) => fellows.has(holder.uid) && holder.uid !== viewerUid)
    .map((holder) => ({ uid: holder.uid, name: holder.name, groupId: opened.door.people.groupOf.get(holder.uid) ?? null }));
}

/**
 * The names one person's draft scrubs, from everybody the coursework door
 * says may be named (`runPeopleToScrub`): the person "the fellow", everybody
 * else holding a place "another fellow", and the rest by what they are.
 */
function scrubFor(uid: string, people: readonly RunPerson[]): NameToLabel[] {
  return people.map((person) => ({
    name: person.name,
    label: person.uid === uid ? "the fellow" : person.label === "a fellow" ? "another fellow" : person.label === RUNNING_LABEL ? RUNNING_LABEL : person.label,
  }));
}

/** The message one person's draft would carry, from what was gathered for them; null when their week is not submitted. */
function inputFor(
  opened: WeekNotesDoor,
  uid: string,
  sources: PersonNoteSources | undefined,
  people: readonly RunPerson[],
): NoteDraftInput | null {
  if (!sources || sources.weeks.length === 0) return null;
  return noteDraftInput({
    programme: opened.door.programmeName,
    weeks: sources.weeks,
    answers: sources.answers,
    feedback: sources.feedback,
    ratings: sources.ratings,
    people: scrubFor(uid, people),
    from: sources.from,
    writerFrom: sources.writerFrom,
  });
}

/**
 * Who said on their application this term that they would like to facilitate:
 * a fact an admin's page shows beside a draft, never sent to Claude and never
 * in a lead's view. Read as the coursework door reads the term: nothing before
 * decision day, and only applications in the term, of the people the page
 * lists, who are never the person looking.
 */
async function offeredToFacilitate(db: Firestore, roundId: string, uids: ReadonlySet<string>): Promise<Set<string>> {
  const form = await loadForm(db, roundId);
  if (!form || !form.asksFacilitating) return new Set();
  if (form.decisionsSentAt === null) return new Set();
  const applications = (await listSentApplications(db, form)).filter(isInTerm);
  return new Set(applications.filter((application) => uids.has(application.uid) && application.sent?.wantsToFacilitate === true).map((application) => application.uid));
}

export async function loadWeekNotes(
  db: Firestore,
  user: SessionUser,
  input: { roundId: string; programmeId: string; weekId: string; only: "drafts" | "suggestions" | null },
  now: Date,
): Promise<{ ok: true; page: WeekNotesPage } | DoorRefusal> {
  const opened = await openWeekNotes(db, user, input.roundId, input.programmeId, input.weekId, now);
  if (!opened.ok) return opened;
  const people = peopleOf(opened, user.uid);
  const groups = opened.groups.map((each) => ({ id: each.group.id, name: each.group.name }));
  const hrefOf = (uid: string) => `${coursework(opened.roundId, opened.programmeId)}/${encodeURIComponent(uid)}`;
  const runId = opened.run.id;

  if (opened.door.viewer === "lead") {
    // The saved notes kept for leads, about somebody holding a place now, and never the lead.
    const onProgramme = new Set(people.map((person) => person.uid));
    const notes = (await listWeekNotes(db, runId, opened.weekId)).filter((note) => onProgramme.has(note.uid) && note.uid !== user.uid);
    const about = [...new Set(notes.map((note) => note.uid))];
    const accounts = new Map(about.map((uid, index) => [uid, index]));
    const subjects = await Promise.all(about.map((uid) => loadSubject(db, uid)));
    const shown = notes.filter((note) => {
      const subject = subjects[accounts.get(note.uid) ?? -1] ?? null;
      return notesShownIn({ kind: "lead", runId }, [note], courseworkCountsFrom(subject), reviewUseFrom(subject)).shown.length > 0;
    });
    const names = await authorNames(db, shown.flatMap((note) => [note.authorUid, ...sourceUids(note)]));
    const view = weekNotesLeadView({
      weekId: opened.weekId,
      weekNumber: opened.weekNumber,
      weekTitle: opened.weekTitle,
      people,
      groups,
      notes: shown,
      nameOf: (uid) => names.get(uid) ?? null,
      hrefOf,
    });
    return { ok: true, page: { viewer: "lead", opened, view } };
  }

  const uids = new Set(people.map((person) => person.uid));
  const [sources, scrub, drafts, saved, offered] = await Promise.all([
    gatherWeekNotes(db, { runId, week: opened.week, weekId: opened.weekId, people: uids }),
    runPeopleToScrub(db, opened.door),
    readWeekDrafts(db, runId, opened.weekId),
    listWeekNotes(db, runId, opened.weekId),
    offeredToFacilitate(db, opened.roundId, uids),
  ]);
  const inputs = new Map(people.map((person) => [person.uid, inputFor(opened, person.uid, sources.get(person.uid), scrub)]));
  const savedBy = new Map<string, MemberNoteDoc>();
  for (const note of saved) if (uids.has(note.uid) && !savedBy.has(note.uid)) savedBy.set(note.uid, note);
  const named = [
    ...uids,
    ...[...drafts.values()].flatMap((draft) => [...Object.values(draft.raters), ...draft.builtFrom.flatMap(writerOf)]),
    ...[...savedBy.values()].flatMap((note) => [note.authorUid, ...sourceUids(note)]),
    ...[...inputs.values()].flatMap((built) => (built ? built.builtFrom.flatMap(writerOf) : [])),
  ];
  const names = await authorNames(db, named);
  const view = weekNotesAdminView({
    weekId: opened.weekId,
    weekNumber: opened.weekNumber,
    weekTitle: opened.weekTitle,
    asksForWork: opened.week !== null,
    claude: claudeConfigured(),
    meeting: opened.meeting,
    met: opened.met,
    allMet: opened.allMet,
    people,
    groups,
    inputs,
    drafts,
    saved: savedBy,
    offered,
    nameOf: (uid) => names.get(uid) ?? null,
    firstNameOf: (uid) => names.get(uid) ?? "",
    hrefOf,
    only: input.only,
  });
  return { ok: true, page: { viewer: "admin", opened, view } };
}

/** The account a source names, if any. */
function writerOf(source: MemberNoteDoc["builtFrom"][number]): string[] {
  if (source.kind === "feedback") return source.byUid ? [source.byUid] : [];
  if (source.kind === "rating") return source.raterUid ? [source.raterUid] : [];
  return [];
}

function sourceUids(note: MemberNoteDoc): string[] {
  return note.builtFrom.flatMap(writerOf);
}

type Asked = { roundId: string; programmeId: string; weekId: string; uid: string };

/**
 * The week's door again, with `adminOnly`: every press is an admin's alone,
 * and never about the admin pressing it, which is refused before anything is
 * read.
 */
async function openFor(db: Firestore, user: SessionUser, input: Asked, now: Date): Promise<WeekNotesDoor | DoorRefusal> {
  if (input.uid === user.uid) return { ok: false, status: 403, error: NOTES_WORDS.notYours };
  return openWeekNotes(db, user, input.roundId, input.programmeId, input.weekId, now, { adminOnly: WEEK_NOTES_WORDS.onlyAdmins });
}

const refuse = (status: number, error: string): DoorRefusal => ({ ok: false, status, error });

export async function draftWeekNote(
  db: Firestore,
  user: SessionUser,
  input: Asked & { again: boolean },
  now: Date,
): Promise<{ ok: true } | DoorRefusal> {
  const opened = await openFor(db, user, input, now);
  if (!opened.ok) return opened;
  if (!opened.allMet) return refuse(409, WEEK_NOTES_WORDS.notYet(opened.met, opened.meeting));
  if (!claudeConfigured()) return refuse(409, WEEK_NOTES_WORDS.notSetUp);
  if (!fellowsOf(opened.door).has(input.uid)) return refuse(404, WEEK_NOTES_WORDS.notFellow);
  if (!opened.week) return refuse(409, WEEK_NOTES_WORDS.noWork);
  const runId = opened.run.id;
  const ref = db.collection(COURSE_NOTE_DRAFTS_COLLECTION).doc(noteDraftId(runId, opened.weekId, input.uid));

  // Asked first, before anything is sent: a note already saved from this week, or a draft already there.
  const [existing, notes] = await Promise.all([ref.get(), listNotes(db, input.uid)]);
  if (keptFromWeek(notes, runId, opened.weekId)) return refuse(409, WEEK_NOTES_WORDS.keptAlready);
  if (existing.exists && !input.again) return refuse(409, WEEK_NOTES_WORDS.draftedAlready);

  const [sources, scrub] = await Promise.all([
    gatherPersonNote(db, { runId, uid: input.uid, weeks: [opened.week] }),
    runPeopleToScrub(db, opened.door),
  ]);
  const built = inputFor(opened, input.uid, sources, scrub);
  if (built === null) return refuse(409, WEEK_NOTES_WORDS.noSubmission);
  if (built.sent === 0) return refuse(409, WEEK_NOTES_WORDS.nothingToSend);

  const answer = await askForNoteDraft(built.message);
  if (!answer.ok) return refuse(502, answer.reason);
  if (noteLabelSlips(answer.note, built.raters).length > 0) return refuse(502, WEEK_NOTES_WORDS.slip);

  // Kept unless a note from this week was saved, or a draft made, while Claude was writing.
  const fields = noteDraftFields({
    runId,
    weekId: opened.weekId,
    weekNumber: opened.weekNumber,
    uid: input.uid,
    text: answer.note,
    builtFrom: built.builtFrom,
    raters: built.raters,
    fingerprint: built.fingerprint,
    model: answer.model,
    at: now,
    askedByUid: user.uid,
  });
  return db.runTransaction(async (tx) => {
    const draft = await tx.get(ref);
    if (await weekNoteKeptIn(tx, db, input.uid, runId, opened.weekId)) return refuse(409, WEEK_NOTES_WORDS.keptAlready);
    if (draft.exists && !input.again) return refuse(409, WEEK_NOTES_WORDS.draftedAlready);
    tx.set(ref, fields);
    return { ok: true as const };
  });
}

export async function saveWeekNote(
  db: Firestore,
  user: SessionUser,
  input: Asked & { text: unknown; audience: unknown; suggest: unknown },
  now: Date,
): Promise<{ ok: true; id: string } | DoorRefusal> {
  const opened = await openFor(db, user, input, now);
  if (!opened.ok) return opened;
  if (!fellowsOf(opened.door).has(input.uid)) return refuse(404, WEEK_NOTES_WORDS.notFellow);
  // The admin's own words, who reads it and what it suggests: Claude's draft is never kept as it came.
  const checked = checkedNote({ text: input.text, audience: input.audience, suggest: input.suggest, draftedByClaude: true }, "admin");
  if (!checked.ok) return checked;
  const runId = opened.run.id;
  if (!(await weekIsSubmitted(db, { runId, uid: input.uid, weekId: opened.weekId }))) return refuse(409, WEEK_NOTES_WORDS.notSubmittedNow);
  const subject = await loadSubject(db, input.uid);
  if (!subject) return refuse(404, WEEK_NOTES_WORDS.notFellow);
  const programmeLabel = programmeLabelOf(opened.run) || opened.door.programmeName;
  const ref = db.collection(COURSE_NOTE_DRAFTS_COLLECTION).doc(noteDraftId(runId, opened.weekId, input.uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return refuse(404, WEEK_NOTES_WORDS.noDraft);
    const draft = normalizeNoteDraft(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    if (draft.runId !== runId || draft.weekId !== opened.weekId || draft.uid !== input.uid) return refuse(404, WEEK_NOTES_WORDS.noDraft);
    const kept = await keepWeeklyNoteIn(
      tx,
      db,
      user,
      input.uid,
      checked.fields,
      { runId, programmeLabel },
      { weekId: opened.weekId, weekNumber: opened.weekNumber, builtFrom: draft.builtFrom },
      reviewUseFrom(subject),
    );
    if (!kept.ok) return kept;
    tx.delete(ref);
    return kept;
  });
}

export async function discardWeekNote(db: Firestore, user: SessionUser, input: Asked, now: Date): Promise<{ ok: true } | DoorRefusal> {
  const opened = await openFor(db, user, input, now);
  if (!opened.ok) return opened;
  const ref = db.collection(COURSE_NOTE_DRAFTS_COLLECTION).doc(noteDraftId(opened.run.id, opened.weekId, input.uid));
  const snap = await ref.get();
  if (!snap.exists) return refuse(404, WEEK_NOTES_WORDS.noDraft);
  await ref.delete();
  return { ok: true };
}
