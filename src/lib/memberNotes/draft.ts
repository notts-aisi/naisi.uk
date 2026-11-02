import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import { askForNoteDraft } from "@/lib/courses/coursework/claude";
import { RUNNING_LABEL, runStaffUids } from "@/lib/courses/coursework/door";
import { loadAccountNames, loadRunPeople, loadRunWeeks } from "@/lib/courses/coursework/gather";
import { noteDraftInput, noteLabelSlips, noteWithName, noteWithRaters, type NameToLabel } from "@/lib/courses/coursework/input";
import { gatherPersonNote } from "@/lib/courses/weekNotes/gather";
import type { SessionUser } from "@/lib/firebase/session";
import { reviewUseFrom } from "@/lib/legal/reviewUse";
import { authorNames, gateNotes, loadSubject, runsOf, type NotesRefusal } from "./store";
import { DRAFT_WORDS, NOTES_WORDS } from "./words";

/**
 * CLAUDE DRAFTS A NOTE ABOUT ONE PERSON (privacy v15: "Once a week Claude may
 * also draft a short note on how each person is doing, using only the work
 * they submitted and the feedback, ratings and comments people on the team
 * gave it"), for an admin, from the profile's "Draft a note with Claude".
 *
 * In this order: an admin, about somebody else (`gateNotes`); Claude set up
 * on this site; the person's account; a run they are on; their agreement to
 * privacy v15 (`reviewUseFrom`); then THE SAME INPUT AS THE END-OF-WEEK
 * NOTES: the weeks of that run they have submitted and not had reopened
 * since, their work in them from their version 15 moment, and the team's
 * feedback, ratings and comments on it (`gatherPersonNote`, then
 * `noteDraftInput`), with every name of everybody on the run swapped for a
 * label ("the fellow" for the person, "Rater 1" for a rater). Nobody with
 * nothing that may be sent is sent: the refusal says why.
 *
 * What comes back has their first name put back where it says "the fellow"
 * and each rater's where it says "Rater N", and is RETURNED, NEVER STORED: the
 * admin edits it and presses Save note, which keeps it through the notes
 * route with `draftedByClaude`. A draft that names a label it was never sent
 * is refused rather than returned.
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
  if (reviewUseFrom(subject) === null) return { ok: false, status: 409, error: DRAFT_WORDS.noAgreement };

  const people = await loadRunPeople(db, runId);
  const groupId = people.groupOf.get(subjectUid) ?? null;
  const weeks = await loadRunWeeks(db, runId, groupId ? [groupId] : []);
  const sources = await gatherPersonNote(db, { runId, uid: subjectUid, weeks });
  if (sources.weeks.length === 0) return { ok: false, status: 409, error: DRAFT_WORDS.nothingSubmitted };

  // Everybody whose name could be in their words or the team's: the person,
  // the others holding a place, the facilitators, and the people running the
  // programme (its lead, the run's helpers and every admin).
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

  const input = noteDraftInput({
    programme: run.programme,
    weeks: sources.weeks,
    answers: sources.answers,
    feedback: sources.feedback,
    ratings: sources.ratings,
    people: scrub,
    from: sources.from,
    writerFrom: sources.writerFrom,
  });
  if (input.sent === 0) return { ok: false, status: 409, error: DRAFT_WORDS.nothingCounted };
  const answer = await askForNoteDraft(input.message);
  if (!answer.ok) return { ok: false, status: 502, error: answer.reason };
  if (noteLabelSlips(answer.note, input.raters).length > 0) return { ok: false, status: 502, error: DRAFT_WORDS.slip };
  const profile = (subject.profile && typeof subject.profile === "object" ? subject.profile : {}) as Record<string, unknown>;
  const firstName =
    (typeof profile.preferredName === "string" && profile.preferredName.trim()) ||
    (typeof subject.displayName === "string" ? subject.displayName.trim().split(/\s+/)[0] : "") ||
    "";
  const raterNames = await authorNames(db, Object.values(input.raters));
  const raters = Object.fromEntries(Object.entries(input.raters).map(([label, uid]) => [label, raterNames.get(uid) ?? ""]));
  return { ok: true, text: noteWithRaters(noteWithName(answer.note, firstName), raters), sent: input.sent };
}
