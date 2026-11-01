import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import { askForNoteDraft } from "@/lib/courses/coursework/claude";
import { RUNNING_LABEL, runStaffUids } from "@/lib/courses/coursework/door";
import { loadAccountNames, loadAnswers, loadRunPeople, loadRunWeeks } from "@/lib/courses/coursework/gather";
import { noteDraftInput, noteWithName, type NameToLabel } from "@/lib/courses/coursework/input";
import type { SessionUser } from "@/lib/firebase/session";
import { courseworkCountsFrom } from "@/lib/legal/courseworkUse";
import { gateNotes, loadSubject, runsOf, type NotesRefusal } from "./store";
import { DRAFT_WORDS, NOTES_WORDS } from "./words";

/**
 * CLAUDE DRAFTS A NOTE ABOUT ONE PERSON (privacy v13), for an admin.
 *
 * In this order: an admin, about somebody else (`gateNotes`); Claude set up
 * on this site; the person's account; a run they are on; their agreement to
 * privacy v13 (`courseworkCountsFrom`); then their coursework on that run,
 * and only what counts (written entirely after that agreement). Nobody with
 * nothing counted is sent: the refusal says why.
 *
 * What is sent: `noteDraftInput`, the week's questions and their counted
 * answers, a written answer's feedback as levels, and every name of
 * everybody on the run swapped for a label ("the fellow" for the person).
 * What comes back has their first name put back where it says "the fellow",
 * and is RETURNED, NEVER STORED: the admin edits it and presses Save note,
 * which keeps it through the notes route with `draftedByClaude`.
 */
export async function draftNote(
  db: Firestore,
  user: SessionUser,
  subjectUid: string,
  runId: string,
): Promise<{ ok: true; text: string; sent: number } | NotesRefusal> {
  const refused = gateNotes(user, subjectUid);
  if (refused) return refused;
  if (!claudeConfigured()) return { ok: false, status: 409, error: DRAFT_WORDS.notSetUp };
  const subject = await loadSubject(db, subjectUid);
  if (!subject) return { ok: false, status: 404, error: NOTES_WORDS.noAccount };
  const run = (await runsOf(db, subjectUid)).find((candidate) => candidate.runId === runId);
  if (!run) return { ok: false, status: 400, error: NOTES_WORDS.badRun };
  if (courseworkCountsFrom(subject) === null) return { ok: false, status: 409, error: DRAFT_WORDS.noAgreement };

  const people = await loadRunPeople(db, runId);
  const groupId = people.groupOf.get(subjectUid) ?? null;
  const weeks = await loadRunWeeks(db, runId, groupId ? [groupId] : []);
  const answers = await loadAnswers(db, runId, weeks, new Set([subjectUid]));
  if (!answers.some((answer) => answer.counted)) return { ok: false, status: 409, error: DRAFT_WORDS.nothingCounted };

  // Everybody whose name could be in their words: the person, the others
  // holding a place, the facilitators, and the people running the programme
  // (its lead, the run's helpers and every admin).
  const [enrolledSnap, staffUids] = await Promise.all([
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
    runStaffUids(db, runId),
  ]);
  const enrolled = enrolledSnap.docs
    .map((doc) => (doc.data() ?? {}).uid)
    .filter((uid): uid is string => typeof uid === "string" && uid.length > 0);
  const staff = new Set(staffUids);
  const names = await loadAccountNames(db, [subjectUid, ...enrolled, ...people.facilitators, ...staff]);
  const scrub: NameToLabel[] = [];
  for (const [uid, forms] of names) {
    const label =
      uid === subjectUid
        ? "the fellow"
        : people.facilitators.has(uid)
          ? "a facilitator"
          : staff.has(uid) && !enrolled.includes(uid)
            ? RUNNING_LABEL
            : "another fellow";
    for (const name of forms) scrub.push({ label, name });
  }

  const input = noteDraftInput({ programme: run.programme, weeks, answers, people: scrub });
  const answer = await askForNoteDraft(input.message);
  if (!answer.ok) return { ok: false, status: 502, error: answer.reason };
  const profile = (subject.profile && typeof subject.profile === "object" ? subject.profile : {}) as Record<string, unknown>;
  const firstName =
    (typeof profile.preferredName === "string" && profile.preferredName.trim()) ||
    (typeof subject.displayName === "string" ? subject.displayName.trim().split(/\s+/)[0] : "") ||
    "";
  return { ok: true, text: noteWithName(answer.note, firstName), sent: input.sent };
}
