import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { pickLiveRound, type LiveRoundCandidate } from "@/lib/admissions/liveRound";
import { roundWindowState, type RoundWindowState } from "@/lib/admissions/window";
import { ROUNDS_COLLECTION, type AdmissionRoundDoc } from "@/lib/firestore/admissionRounds";
import { own } from "../keys";
import { FORM_VERSION, type ProgrammeKind, type ProgrammeSettings } from "../model";
import { isApplicationForm, normaliseForm, type ApplicationForm } from "../normalise";
import { openProgrammes } from "../sections";

/**
 * WHERE THE APPLICATION FORM IS, FOR A PAGE THAT OFFERS APPLY.
 *
 * Two questions, asked by pages any visitor can load:
 *
 *  - `findOpenForm`: which application form is open right now, if any. There
 *    is one form a term, so the answer is one form or none, and the button
 *    leads to `applyPath`.
 *  - `findFormsByCourse`: which form speaks for each course, and where that
 *    form is in its term. A programme on the form is tied to the course it is
 *    for (`courseId`, set on the programme's Settings tab), and that course's
 *    public page offers the form: an Apply button while it is open, the day
 *    it opens before that, and that it has closed afterwards.
 *
 * ## Safe for a page any visitor can load
 *
 * A form is stored on an admission round, which is closed to every browser
 * and carries things no visitor may be told: who leads and who reviews each
 * programme, the live counts of applications, each programme's places and
 * the wording of its decision emails. This module reads the round on the
 * Admin SDK, so the rules are no defence here, and it keeps those things in
 * by PROJECTION: `OpenFormView` and `CourseFormView` are written out field by
 * field below, and no round or form leaves this file for a page. A field
 * added to the round later stays private until somebody names it here on
 * purpose.
 *
 * One module is handed whole forms: `./publicTerm.ts`, which answers a third
 * question for the same pages (where the term is, and what is on it) from the
 * same read, and keeps the same rule with a projection of its own.
 * `tests/applications-public-term.test.mjs` holds that nothing else imports
 * `readForms`.
 *
 * It imports nothing that reads a review or a decision, and nothing that
 * says who has a role on a form. `tests/applications-wave-e1-open-form.test.mjs`
 * walks its imports to hold that, so a public page may import it.
 *
 * ## Open means what the apply routes mean
 *
 * `roundWindowState`, the one predicate the form's own routes refuse on: the
 * status is open and now is inside both dates. A form that is a draft, opens
 * later, has closed, was closed early, is archived or is finished is not
 * offered as open. Neither is a form with no programme left to tick.
 *
 * ## A draft is nobody's business
 *
 * A form that is still a draft, or has been archived, is answered by both
 * lookups exactly as a form that does not exist: a visitor's page is handed
 * nothing, so it can say nothing. That is the same reading the form's own
 * page gives, which answers a draft as a round that is not there.
 *
 * ## A run the form places people on takes no application of its own
 *
 * A third question, asked by the older per-run apply page and its route:
 * `runTakesPeopleFromForm`. A programme names the course run its accepted
 * people go onto (`runId`), and from that moment the run's own way of
 * applying is shut, whatever the run's status and dates say. The answer is a
 * yes or a no and nothing about the form, so it can be given to anybody.
 *
 * ## The read
 *
 * One equality on one field (`formVersion`), which needs no declared index,
 * made in one place (`readForms`) for the lookups here and for the one in
 * `./publicTerm.ts`. A site has a handful of forms over its whole life, so
 * the rest is done in memory.
 */

/** One programme somebody can tick, as a page that links to the form may know it. */
export type OpenFormProgramme = {
  id: string;
  kind: ProgrammeKind;
  /** "AGI Strategy Fellowship". */
  name: string;
  /** "AGI Strategy". */
  shortName: string;
  /** The course run it places people on, once one is set. A lookup key, never printed. */
  runId: string | null;
};

/**
 * The open form, as a stranger may know it. The three dates are the round's
 * own, under the round's own names: when it opened, when it closes, and the
 * day everybody hears.
 */
export type OpenFormView = Pick<AdmissionRoundDoc, "opensAt" | "closesAt" | "decisionsByDate"> & {
  /** The round the form is stored on. */
  id: string;
  /** Always open: a form in any other state is not returned at all. */
  state: "open";
  /** Where the form is served. */
  applyPath: string;
  /** The term, as applicants read it at the top of the form: "Autumn 2026". */
  label: string;
  /** The programmes somebody can tick, in the form's order. Closed ones are left out. */
  programmes: OpenFormProgramme[];
  /**
   * The course runs those programmes place people on, where one is set, once
   * each. Empty while no programme has been linked to a run.
   */
  outcomeRunIds: string[];
};

/** Where the application form on a round is served. */
export function applyPathFor(roundId: string): string {
  return `/apply/${encodeURIComponent(roundId)}`;
}

/** The one projection. Everything a visitor's page is handed is named here. */
function viewOf(form: ApplicationForm): OpenFormView {
  const { opensAt, closesAt, decisionsByDate } = form.round;
  const programmes: OpenFormProgramme[] = openProgrammes(form).map((programme) => ({
    id: programme.id,
    kind: programme.kind,
    name: programme.name,
    shortName: programme.shortName,
    runId: programme.runId,
  }));
  const outcomeRunIds: string[] = [];
  for (const programme of programmes) {
    if (programme.runId && !outcomeRunIds.includes(programme.runId)) outcomeRunIds.push(programme.runId);
  }
  return {
    id: form.round.id,
    state: "open",
    applyPath: applyPathFor(form.round.id),
    label: form.round.label,
    opensAt,
    closesAt,
    decisionsByDate,
    programmes,
    outcomeRunIds,
  };
}

/** Sooner close first, a form with no close last, then by id so two reads agree. */
function byClose(a: ApplicationForm, b: ApplicationForm): number {
  const at = (form: ApplicationForm) => form.round.closesAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return at(a) - at(b) || a.round.id.localeCompare(b.round.id);
}

/**
 * Every application form there is, whatever its state. The one read in this
 * module: each lookup below starts here and decides for itself which of them
 * a visitor may be told about.
 *
 * Exported for `./publicTerm.ts` and for nothing else. What comes back is
 * whole forms, leads, counts and all, so a caller owes a visitor's page a
 * projection written out field by field, as the two lookups here do. A page
 * never calls this.
 */
export async function readForms(db: Firestore): Promise<ApplicationForm[]> {
  const snap = await db.collection(ROUNDS_COLLECTION).where("formVersion", "==", FORM_VERSION).get();
  const forms: ApplicationForm[] = [];
  for (const doc of snap.docs) {
    // The query asks the database for forms. Each stored document is asked the
    // contract's own question as well, so this lookup is held to the rule every
    // other read of a round is: nothing is read as a form unless
    // `isApplicationForm` says it is one.
    if (!isApplicationForm(doc.data())) continue;
    forms.push(normaliseForm(doc.id, doc.data()));
  }
  return forms;
}

/**
 * The application form that is taking applications at `now`, or null.
 *
 * There should only ever be one. If two are open at once, the one that closes
 * first is returned, because that is the one somebody could miss.
 */
export async function findOpenForm(db: Firestore, now: Date = new Date()): Promise<OpenFormView | null> {
  const open = (await readForms(db)).filter(
    (form) => roundWindowState(form.round, now).state === "open" && openProgrammes(form).length > 0,
  );
  if (open.length === 0) return null;
  return viewOf(open.sort(byClose)[0]);
}

/**
 * Does the open form take applications for any of these course runs?
 *
 * True when one of its programmes places people on one of them. A form whose
 * programmes have not been linked to a run speaks for none by this test: the
 * caller decides what a form with no links means for its page, and can see
 * that it has none from an empty `outcomeRunIds`.
 */
export function openFormSpeaksFor(form: Pick<OpenFormView, "outcomeRunIds">, runIds: readonly string[]): boolean {
  return form.outcomeRunIds.some((runId) => runIds.includes(runId));
}

// ---------------------------------------------------------------------------
// The form that speaks for a course
// ---------------------------------------------------------------------------

/**
 * The form a course is on, as that course's public page may know it.
 *
 * The three dates are the round's own, under the round's own names, with one
 * difference a page relies on: A CLOSED FORM HANDS OVER ONLY THE TIMES THAT
 * HAVE PASSED. A form closes at the time written on it, or earlier when an
 * admin closes it by hand, and closed by hand either time can still be ahead.
 * A page that printed one would say applications opened or closed on a day
 * that has not come, so it is given null and says they have closed, with no
 * day.
 */
export type CourseFormView = Pick<AdmissionRoundDoc, "opensAt" | "closesAt" | "decisionsByDate"> & {
  /** The round the form is stored on. */
  id: string;
  /** Never `inactive`: a form that is a draft or archived speaks for no course. */
  state: Exclude<RoundWindowState, "inactive">;
  /** Where the form is served. */
  applyPath: string;
  /** When the tied programme starts, as its lead wrote it: "w/c 26 Oct". Shown, never parsed. */
  starts: string;
  /** The course run the tied programme places people on, once one is set. A lookup key, never printed. */
  runId: string | null;
};

/** A form with the programme that ties it to one course, as the ranking takes it. */
type TiedForm = LiveRoundCandidate & { form: ApplicationForm; programme: ProgrammeSettings };

/** The one projection for a course's page. Everything it is handed is named here. */
function courseViewOf(tied: TiedForm, state: CourseFormView["state"], now: Date): CourseFormView {
  const { decisionsByDate } = tied.form.round;
  const passed = (at: Date | null) => (at !== null && at.getTime() <= now.getTime() ? at : null);
  const opensAt = state === "closed" ? passed(tied.opensAt) : tied.opensAt;
  const closesAt = state === "closed" ? passed(tied.closesAt) : tied.closesAt;
  return {
    id: tied.id,
    state,
    applyPath: applyPathFor(tied.id),
    opensAt,
    closesAt,
    decisionsByDate,
    starts: tied.programme.starts,
    runId: tied.programme.runId,
  };
}

/**
 * The form that speaks for each course, by course id. A course with no entry
 * is on no form a visitor may be told about, and its page carries on exactly
 * as it would if application forms did not exist.
 *
 * A form speaks for a course when one of its programmes is tied to it and is
 * still on the form to tick. So none of these speaks for anything:
 *
 *  - a form that is a draft or archived (see the note at the top);
 *  - a form that was cancelled: a term that was called off promises no
 *    decision day, and its dates say nothing true about applying;
 *  - a programme that has been closed, which is off the site and out of the
 *    form, whatever it is still tied to.
 *
 * A form in any other state does: it opens later (`not-yet`), it is taking
 * applications (`open`), or it has closed (`closed`, which lasts until the
 * next term's form is opened for the same course).
 *
 * When more than one form is tied to a course, the choice is `pickLiveRound`,
 * the ranking the course pages already use for the rounds that came before
 * forms: taking applications beats opening soon beats closed, then the
 * soonest close, or among closed forms the most recent. When two programmes
 * on one form are tied to one course, the first in the form's order speaks.
 */
export async function findFormsByCourse(
  db: Firestore,
  now: Date = new Date(),
): Promise<Map<string, CourseFormView>> {
  const tiedByCourse = new Map<string, TiedForm[]>();
  for (const form of await readForms(db)) {
    if (form.round.status === "cancelled") continue;
    const { id, status, archived, opensAt, closesAt } = form.round;
    const onThisForm = new Set<string>();
    for (const programme of openProgrammes(form)) {
      const courseId = programme.courseId;
      if (courseId === null || onThisForm.has(courseId)) continue;
      onThisForm.add(courseId);
      const tied = tiedByCourse.get(courseId) ?? [];
      tied.push({ id, status, archived, opensAt, closesAt, form, programme });
      tiedByCourse.set(courseId, tied);
    }
  }
  const speaking = new Map<string, CourseFormView>();
  for (const [courseId, tied] of tiedByCourse) {
    const best = pickLiveRound(tied, now);
    if (!best || best.window.state === "inactive") continue;
    speaking.set(courseId, courseViewOf(best.round, best.window.state, now));
  }
  return speaking;
}

// ---------------------------------------------------------------------------
// A run the form places people on
// ---------------------------------------------------------------------------

/**
 * Does an application form place people on this course run?
 *
 * True when a programme on ANY form names it, whatever state that form is in
 * (a draft, open, closed, settled, archived or cancelled) and whether or not
 * the programme has been closed. The older per-run apply page and its route
 * ask this before anything else about the run, and refuse when it is true:
 * people get onto such a run through the form and an admin's hand-over, and
 * an application made to the run itself would be read by nobody.
 *
 * EVERY STATE, on purpose. The run's own status machine can only leave draft
 * through "applications open", so the run a term's form feeds has to pass
 * through a status in which its own apply page would otherwise answer. A
 * rule that waited for the form to open, or stopped once it settled, would
 * leave a window in which that page took applications after all.
 *
 * It answers a yes or a no. Nothing about the form leaves this function, not
 * even that there is one: the caller's refusal says only that this run takes
 * no applications here.
 */
export async function runTakesPeopleFromForm(db: Firestore, runId: string): Promise<boolean> {
  if (!runId) return false;
  for (const form of await readForms(db)) {
    for (const programmeId of form.programmeIds) {
      if (own(form.programmes, programmeId)?.runId === runId) return true;
    }
  }
  return false;
}
