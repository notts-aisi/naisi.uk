import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { SessionUser } from "@/lib/firebase/session";
import { ROUNDS_COLLECTION } from "@/lib/firestore/admissionRounds";
import { canEditProgramme, canRunTerm, canSeeForm, roleOnProgramme } from "../access";
import { isInTerm, tallyTerm, type TermTally } from "../decisions";
import { FORM_VERSION, type ProgrammeSettings, type QuestionSetDoc } from "../model";
import { isApplicationForm, isId, normaliseForm, type ApplicationForm } from "../normalise";
import { loadForm, loadQuestionSets } from "../repo";
import { reviewingHasBegunOn } from "../scoring";
import { rankedProgrammes } from "../sections";
import { listDecisions, listReviews, listSentApplications } from "../staffRepo";
import { listCourseChoices, readsCourseDrafts } from "./courses";
import { own } from "./own";
import { eligibleReviewers, namesOnForm } from "./people";
import type { SetupContext, StaffContext } from "./views";

/**
 * Loading what the editor's routes and pages show, with the question of who
 * is asking answered on the way.
 *
 * Each loader returns the form (and what else its screen needs) together with
 * the context a projection in `./views.ts` takes, or says why not. "No form
 * here" and "you have no role on it" are one answer, on purpose: whether a
 * form or a programme exists is not something a stranger is told.
 *
 * An id from an address is checked for its shape before it names a document,
 * so nothing but a round id ever reaches a path.
 *
 * Staff only. This module reads everybody's sent applications to count them,
 * so nothing that builds an applicant's page may import it.
 */

function contextFor(
  user: SessionUser,
  form: ApplicationForm,
  names: ReadonlyMap<string, string>,
  now: Date,
): StaffContext {
  return {
    now,
    viewerUid: user.uid,
    roleOn: (programmeId) => roleOnProgramme(user, form, programmeId),
    names,
    canRunTerm: canRunTerm(user),
  };
}

export type LoadedForm = { form: ApplicationForm; context: StaffContext };

/** The form, for somebody with a role on it. Null for no form and for no role alike. */
export async function loadFormForStaff(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  now: Date = new Date(),
): Promise<LoadedForm | null> {
  if (!isId(roundId)) return null;
  const form = await loadForm(db, roundId);
  if (!form || !canSeeForm(user, form)) return null;
  const names = await namesOnForm(db, form);
  return { form, context: contextFor(user, form, names, now) };
}

/**
 * Every form this caller has a role on, newest first. Somebody with a role on
 * none is given an empty list, which says nothing about whether any exist.
 *
 * One equality on one field, so it needs no declared index. A term has one
 * form, and the sort is done here.
 */
export async function listFormsForStaff(
  db: Firestore,
  user: SessionUser,
  now: Date = new Date(),
): Promise<LoadedForm[]> {
  const snap = await db.collection(ROUNDS_COLLECTION).where("formVersion", "==", FORM_VERSION).get();
  const out: LoadedForm[] = [];
  for (const doc of snap.docs) {
    // The query asks the database for forms. Each stored document is asked the
    // contract's own question as well, so this list is held to the rule every
    // other read of a round is: nothing is read as a form unless
    // `isApplicationForm` says it is one.
    if (!isApplicationForm(doc.data())) continue;
    const form = normaliseForm(doc.id, doc.data());
    if (!canSeeForm(user, form)) continue;
    out.push({ form, context: contextFor(user, form, await namesOnForm(db, form), now) });
  }
  return out.sort(
    (a, b) =>
      (b.form.round.createdAt?.getTime() ?? 0) - (a.form.round.createdAt?.getTime() ?? 0) ||
      a.form.round.label.localeCompare(b.form.round.label),
  );
}

export type LoadedEditor = LoadedForm & { sets: QuestionSetDoc[] };

/** The form with every question set, for the editor. The caller has checked `canRunTerm`. */
export async function loadEditor(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  now: Date = new Date(),
): Promise<LoadedEditor | null> {
  const loaded = await loadFormForStaff(db, user, roundId, now);
  if (!loaded) return null;
  return { ...loaded, sets: await loadQuestionSets(db, loaded.form.round.id) };
}

/**
 * How many people are on one programme's list: everybody in the term
 * (`isInTerm`) whose sent application ranks it, and anybody who joined it by
 * accepting an invitation. Counted with the same function, over the same
 * people, as the manager's tallies, so the number beside a tab is the number
 * the list behind it shows on its own "All".
 */
export async function countApplicationsTo(
  db: Firestore,
  form: ApplicationForm,
  programmeId: string,
): Promise<number> {
  const applicants = [];
  for (const application of await listSentApplications(db, form)) {
    if (!isInTerm(application) || !application.sent) continue;
    applicants.push({
      uid: application.uid,
      ranked: rankedProgrammes(form, application.sent).map((programme) => programme.id),
      decision: null,
      application,
    });
  }
  const counted = own(tallyTerm(form, applicants).programmes, programmeId);
  return counted ? counted.applications + counted.joined : 0;
}

/**
 * Every count the term's page shows, from the applications in the term
 * (`isInTerm`) and what each lead has decided so far. Worked out when it is
 * read, by the one function that knows the arithmetic, so nothing here can
 * drift from the manager.
 */
export async function loadTermTally(db: Firestore, form: ApplicationForm): Promise<TermTally> {
  const [applications, decisions] = await Promise.all([
    listSentApplications(db, form),
    listDecisions(db, form.round.id),
  ]);
  const applicants = [];
  for (const application of applications) {
    if (!isInTerm(application) || !application.sent) continue;
    applicants.push({
      uid: application.uid,
      ranked: rankedProgrammes(form, application.sent).map((programme) => programme.id),
      decision: decisions.get(application.uid) ?? null,
      application,
    });
  }
  return tallyTerm(form, applicants);
}

export type LoadedProgramme = LoadedForm & {
  programme: ProgrammeSettings;
  role: "admin" | "lead" | "reviewer";
  /** People whose sent application ranks this programme. */
  applications: number;
};

/**
 * One programme, for anybody with a role on it. Null for no form, no such
 * programme and no role alike.
 */
export async function loadProgrammeForStaff(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date = new Date(),
): Promise<LoadedProgramme | null> {
  if (!isId(programmeId)) return null;
  const loaded = await loadFormForStaff(db, user, roundId, now);
  if (!loaded) return null;
  // The programme has to be one the form itself holds before anything asks
  // about a role on it.
  const programme = own(loaded.form.programmes, programmeId);
  if (!programme) return null;
  const role = roleOnProgramme(user, loaded.form, programmeId);
  if (!role) return null;
  return {
    ...loaded,
    programme,
    role,
    applications: await countApplicationsTo(db, loaded.form, programmeId),
  };
}

/**
 * Has anybody reviewed an application on this programme's list? A yes or a
 * no, for the settings page's scores switch: once reviewing has begun the
 * switch is an admin's (`changeProgramme` decides the same thing again, inside
 * its own transaction, when somebody presses it). Nobody is listed or counted.
 */
async function reviewingBegunOn(
  db: Firestore,
  form: ApplicationForm,
  programmeId: string,
): Promise<boolean> {
  const [applications, reviews] = await Promise.all([
    listSentApplications(db, form),
    listReviews(db, form.round.id),
  ]);
  return reviewingHasBegunOn(form, programmeId, applications, reviews);
}

export type LoadedSetup = {
  form: ApplicationForm;
  sets: QuestionSetDoc[];
  programme: ProgrammeSettings;
  context: SetupContext;
};

export type SetupOutcome =
  | { status: "ok"; setup: LoadedSetup }
  /** No form, no such programme, or no role on it. */
  | { status: "none" }
  /** A reviewer: they have a role here, and settings are not theirs to change. */
  | { status: "not-yours" };

/** One programme's settings, for its lead or an admin. */
export async function loadSetup(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date = new Date(),
): Promise<SetupOutcome> {
  const loaded = await loadProgrammeForStaff(db, user, roundId, programmeId, now);
  if (!loaded) return { status: "none" };
  if (loaded.role === "reviewer" || !canEditProgramme(user, loaded.form, programmeId)) {
    return { status: "not-yours" };
  }
  const [sets, candidates, courses, scoresHeld] = await Promise.all([
    loadQuestionSets(db, loaded.form.round.id),
    eligibleReviewers(db),
    listCourseChoices(db, loaded.programme.courseId, readsCourseDrafts(user)),
    // Only somebody who is not an admin can be held, so only they are asked.
    canRunTerm(user) ? false : reviewingBegunOn(db, loaded.form, programmeId),
  ]);
  return {
    status: "ok",
    setup: {
      form: loaded.form,
      sets,
      programme: loaded.programme,
      context: {
        ...loaded.context,
        role: loaded.role,
        candidates,
        courses,
        applications: loaded.applications,
        scoresHeld,
      },
    },
  };
}
