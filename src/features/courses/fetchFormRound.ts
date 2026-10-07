import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  findFormsByCourse,
  type CourseFormView,
} from "@/lib/applications/lifecycle/openForm";
import type { CourseLiveRound } from "./fetchLiveRound";

/**
 * THE TERM'S APPLICATION FORM, AS THE ROUND A COURSE'S PAGE SPEAKS ABOUT.
 *
 * There is one application form a term, for every programme. Each programme
 * on it is tied to the course it is for, and that course's public page offers
 * the form: whichever course's Apply button somebody presses, it is the same
 * form.
 *
 * ## Which form, and what a visitor may know of it
 *
 * Decided by the form's own code, `findFormsByCourse` in
 * `src/lib/applications/lifecycle/openForm.ts`, and not here. That lookup
 * answers nothing for a form that is still a draft, so a course tied to a
 * programme on one is handed null by this file and its page is exactly what
 * it would be with no form at all. What it does answer is a projection of
 * named fields, written out there; this file passes them on and reads no
 * round itself.
 *
 * ## The shape is the one the pages already draw
 *
 * A form arrives as a `CourseLiveRound` with `form` set, so the page's one
 * precedence rule (`roundOwnsDates`), its facts rail and its call to action
 * are the code that ran before forms existed. The run ids carry the run the
 * tied programme places people on, when one is set, so `roundTargetRun`
 * resolves the cohort and the start date the same way it does for a round.
 *
 * ## One read
 *
 * A single equality on one field, whether it is one course asking or the
 * whole catalogue.
 */

function asLiveRound(view: CourseFormView): CourseLiveRound {
  return {
    id: view.id,
    state: view.state,
    opensAt: view.opensAt,
    closesAt: view.closesAt,
    decisionsByDate: view.decisionsByDate,
    outcomeRunIds: view.runId ? [view.runId] : [],
    form: { applyPath: view.applyPath, starts: view.starts },
  };
}

/**
 * The form that speaks for each course, by course id, for the catalogue.
 * A course with no entry is on no form a visitor may be told about.
 */
export async function fetchFormRoundsByCourse(
  now: Date = new Date(),
): Promise<Map<string, CourseLiveRound>> {
  const rounds = new Map<string, CourseLiveRound>();
  const db = getAdminDb();
  if (!db) return rounds;
  for (const [courseId, view] of await findFormsByCourse(db, now)) {
    rounds.set(courseId, asLiveRound(view));
  }
  return rounds;
}

/** The form that speaks for one course, or null. Null is the ordinary answer. */
export async function fetchFormRoundForCourse(
  courseId: string,
  now: Date = new Date(),
): Promise<CourseLiveRound | null> {
  return (await fetchFormRoundsByCourse(now)).get(courseId) ?? null;
}

/**
 * How far along a round is, for choosing between two. Taking applications
 * beats opening soon beats closed, the order `pickLiveRound` ranks by.
 */
const LIVENESS: Record<CourseLiveRound["state"], number> = {
  open: 0,
  "not-yet": 1,
  closed: 2,
  inactive: 3,
};

/**
 * WHICH ROUND SPEAKS WHEN A COURSE HAS BOTH: the form its programme is on, or
 * a round of the older kind that names one of its runs. The one rule, asked
 * by the course page and by the catalogue.
 *
 * THE FORM SPEAKS, unless the older round is further along. Somebody tied the
 * programme to this course on purpose, so at equal standing the form is the
 * answer: with both open, the button opens the form. The exception keeps the
 * page truthful through a changeover. A form that has closed, or has not
 * opened yet, must not hide a round that is taking applications today: the
 * page would then tell a visitor there is nothing to apply to while there is.
 *
 * With no form, the older round is returned untouched, so a course tied to
 * no programme is handed exactly what it was handed before forms existed.
 */
export function speakingRoundFor(
  form: CourseLiveRound | null,
  older: CourseLiveRound | null,
): CourseLiveRound | null {
  if (!form) return older;
  if (!older) return form;
  return LIVENESS[older.state] < LIVENESS[form.state] ? older : form;
}
