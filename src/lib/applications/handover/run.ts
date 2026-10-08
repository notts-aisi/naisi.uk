import "server-only";
import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { ROUNDS_COLLECTION } from "@/lib/firestore/admissionRounds";
import {
  normalizeCourseApplication,
  type CourseApplicationDoc,
} from "@/lib/firestore/courseApplications";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { canRunTerm } from "../access";
import { own } from "../keys";
import { FORM_VERSION } from "../model";
import { isApplicationForm, isId, normaliseForm, type ApplicationForm } from "../normalise";
import { formRef } from "../repo";

/**
 * THE RUN A PROGRAMME PLACES ITS PEOPLE ON.
 *
 * A programme on the application form is for a course (`courseId`), and a
 * course is taught one run at a time. `programmes.<id>.runId` names the run
 * this term's accepted people go onto, and this module is its ONE WRITER
 * (`setProgrammeRun`). An admin sets it, and nobody else: placing people,
 * publishing a placement and looking after a roster are an admin's.
 *
 * ## Which run a programme can name
 *
 * One rule, `runStanding`, read by the picker that offers runs and by the
 * writer that stores one, so the route accepts what the screen offered:
 *
 *  1. it is a run of the course the programme is tied to. So a programme
 *     needs its course tie before it can name a run;
 *  2. it is not archived, not being destroyed, not cancelled and not
 *     completed: nobody can start on one of those;
 *  3. it takes people by placement. A run in open enrolment hands out its
 *     own seats from a session picker and has no allocation board;
 *  4. it holds no application of its own. From the moment a programme names
 *     a run the run's own apply page refuses (`runTakesPeopleFromForm` in
 *     `../lifecycle/openForm.ts`), so a run that starts with none only ever
 *     holds the rows a hand-over wrote. That is what makes "the people on
 *     this run's board are the people who hold a place on the programme" a
 *     fact about the data and not a hope;
 *  5. no other programme, on any form, names it. A board is one programme's.
 *
 * ## Once anybody has been handed over
 *
 * The run can no longer be changed or cleared here. The rows a hand-over
 * wrote sit on that run, and a programme pointed somewhere else would leave
 * them behind, on a run whose own apply page had just opened again.
 *
 * ## Asked inside the transaction that writes
 *
 * The form, the run, the run's rows and every other form are read through
 * the transaction, so a run that took an application, lost its course or was
 * named by another programme after the request began makes it run again and
 * meet the refusal.
 *
 * Staff only. This module reads rows of people who applied, so nothing that
 * builds an applicant's page may import it.
 */

export type Refusal = { ok: false; status: 400 | 403 | 404 | 409; error: string };
export type Done<T> = { ok: true; value: T };

function refuse(status: Refusal["status"], error: string): Refusal {
  return { ok: false, status, error };
}

export const NOT_AN_ADMIN = "Only an admin can say which course run a programme places people on.";
const NO_FORM = refuse(404, "There is no application form here.");
const NO_PROGRAMME = refuse(404, "That programme is not on this form.");

/** The run's own collection, and its applications'. Named once here for this folder. */
export const RUNS_COLLECTION = "courseRuns";
export const RUN_APPLICATIONS_COLLECTION = "courseApplications";

export function runRef(db: Firestore, runId: string): DocumentReference {
  return db.collection(RUNS_COLLECTION).doc(runId);
}

/**
 * A run as this folder reads one: the course side's own reading
 * (`normalizeCourseRun`), and the one flag that reader does not carry. A run
 * mid-destroy is refused to everybody by the member area, so it is no run to
 * place anybody on.
 */
export type RunRead = { run: CourseRunDoc; destroying: boolean };

export function readRun(id: string, data: DocumentData | undefined): RunRead | null {
  if (!data) return null;
  return { run: normalizeCourseRun(id, data), destroying: data.destroying === true };
}

export type RunStanding =
  | { ok: true }
  | {
      ok: false;
      why: "no-course" | "gone" | "other-course" | "archived" | "over" | "open-enrolment";
    };

/**
 * Can this run take the people of a programme tied to `courseId`? Rules 1 to
 * 3 above: everything that can be read off the run itself. Rules 4 and 5 need
 * other documents, and are `runHasApplications` and `programmeNaming` below.
 *
 * It is asked when a run is named, and again every time people are handed
 * over, because nothing follows a run around: it can be archived, cancelled
 * or moved to another course's page after a programme names it.
 */
export function runStanding(read: RunRead | null, courseId: string | null): RunStanding {
  if (courseId === null) return { ok: false, why: "no-course" };
  if (!read) return { ok: false, why: "gone" };
  const { run, destroying } = read;
  if (run.courseId !== courseId) return { ok: false, why: "other-course" };
  if (destroying || run.archived) return { ok: false, why: "archived" };
  if (run.status === "cancelled" || run.status === "completed") return { ok: false, why: "over" };
  if (run.enrolMode !== "admissions") return { ok: false, why: "open-enrolment" };
  return { ok: true };
}

/** What each failing standing is told as, when it is the run being picked. */
const STANDING_SENTENCE: Record<Exclude<RunStanding, { ok: true }>["why"], string> = {
  "no-course":
    "Tie this programme to its course page first. The run has to be one of that course’s.",
  gone: "That run is not on the site.",
  "other-course": "That run belongs to another course than the one this programme is tied to.",
  archived: "That run has been archived, so nobody can be placed on it.",
  over: "That run has finished or was cancelled, so nobody can be placed on it.",
  "open-enrolment":
    "That run takes sign-ups from a session picker, so nobody is placed on it from the application form.",
};

export function standingSentence(standing: Exclude<RunStanding, { ok: true }>): string {
  return STANDING_SENTENCE[standing.why];
}

export const RUN_HAS_APPLICATIONS =
  "That run already has applications of its own. A run the application form places people on has to start with none, so make a new run for this term.";
export const RUN_TAKEN = "Another programme already places its people on that run.";
export const RUN_LOCKED =
  "People from this programme have been handed over to that run, so the run can no longer be changed here.";

/** Every row on a run's own applications list, read the course side's way. */
function rowsQuery(db: Firestore, runId: string) {
  return db.collection(RUN_APPLICATIONS_COLLECTION).where("runId", "==", runId);
}

function rowsOf(docs: readonly { id: string; data: () => DocumentData | undefined }[]): CourseApplicationDoc[] {
  return docs.map((doc) => normalizeCourseApplication(doc.id, doc.data() ?? {}));
}

/** Every row on a run's own applications list. One equality, so no declared index. */
export async function listRunRows(db: Firestore, runId: string): Promise<CourseApplicationDoc[]> {
  return rowsOf((await rowsQuery(db, runId).get()).docs);
}

/** A row this programme's hand-over wrote. */
export function isRowFrom(
  row: Pick<CourseApplicationDoc, "fromForm">,
  roundId: string,
  programmeId: string,
): boolean {
  return row.fromForm?.roundId === roundId && row.fromForm.programmeId === programmeId;
}

/** Every application form, whatever its state. One equality on one field. */
function formsQuery(db: Firestore) {
  return db.collection(ROUNDS_COLLECTION).where("formVersion", "==", FORM_VERSION);
}

function formsOf(docs: readonly { id: string; data: () => DocumentData | undefined }[]): ApplicationForm[] {
  const forms: ApplicationForm[] = [];
  for (const doc of docs) {
    // The query asks the database for forms, and each stored document is
    // asked the contract's own question as well.
    if (!isApplicationForm(doc.data())) continue;
    forms.push(normaliseForm(doc.id, doc.data()));
  }
  return forms;
}

/** The programme that names this run, on any form in any state, or null. */
export function programmeNaming(
  forms: readonly ApplicationForm[],
  runId: string,
): { roundId: string; programmeId: string } | null {
  for (const form of forms) {
    for (const programmeId of form.programmeIds) {
      if (own(form.programmes, programmeId)?.runId === runId) {
        return { roundId: form.round.id, programmeId };
      }
    }
  }
  return null;
}

/** Every application form, for the picker. The writer reads them in its own transaction. */
export async function listForms(db: Firestore): Promise<ApplicationForm[]> {
  return formsOf((await formsQuery(db).get()).docs);
}

/**
 * Name the run a programme places people on, or clear it. Admin only.
 *
 * `runId` is a run's id, or null for no run. The route has only checked its
 * shape: whether there is such a run and whether this programme can name it
 * is decided here, after the caller has been held to `canRunTerm`.
 */
export async function setProgrammeRun(
  db: Firestore,
  actor: SessionUser,
  roundId: string,
  programmeId: string,
  runId: string | null,
): Promise<Done<{ runId: string | null; changed: boolean }> | Refusal> {
  if (!canRunTerm(actor)) return refuse(403, NOT_AN_ADMIN);
  if (!isId(roundId)) return NO_FORM;
  if (!isId(programmeId)) return NO_PROGRAMME;
  if (runId !== null && !isId(runId)) return refuse(400, STANDING_SENTENCE.gone);
  const roundRef = formRef(db, roundId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(roundRef);
    if (!snap.exists || !isApplicationForm(snap.data())) return NO_FORM;
    const form = normaliseForm(snap.id, snap.data());
    const programme = own(form.programmes, programmeId);
    if (!programme) return NO_PROGRAMME;
    if (programme.runId === runId) return { ok: true, value: { runId, changed: false } } as const;

    // The run it names now, if anybody from this programme is already on it.
    if (programme.runId !== null) {
      const there = rowsOf((await tx.get(rowsQuery(db, programme.runId))).docs);
      if (there.some((row) => isRowFrom(row, roundId, programmeId))) return refuse(409, RUN_LOCKED);
    }

    if (runId !== null) {
      const runSnap = await tx.get(runRef(db, runId));
      const standing = runStanding(
        runSnap.exists ? readRun(runSnap.id, runSnap.data()) : null,
        programme.courseId,
      );
      if (!standing.ok) {
        return refuse(standing.why === "no-course" ? 409 : 400, standingSentence(standing));
      }
      const rows = await tx.get(rowsQuery(db, runId));
      if (rows.docs.length > 0) return refuse(409, RUN_HAS_APPLICATIONS);
      const named = programmeNaming(formsOf((await tx.get(formsQuery(db))).docs), runId);
      if (named) return refuse(409, RUN_TAKEN);
    }

    tx.update(roundRef, {
      [`programmes.${programmeId}.runId`]: runId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, value: { runId, changed: true } } as const;
  });
}
