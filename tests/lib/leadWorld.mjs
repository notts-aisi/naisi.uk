/**
 * The term after decision day, for the suites about a programme's lead acting
 * on the course run their programme names.
 *
 * Built on `tests/lib/handoverWorld.mjs` (the real handlers, the term's form,
 * the course runs and the hand-over). On top of it:
 *
 *  - AGI Strategy names its run (`RUN.agi`) and Claudia leads it; Lloyd
 *    reviews it on the form and is the run's admissions reviewer; Yusuf is
 *    the run's track lead.
 *  - Technical AI Safety names its own run (`RUN.tais`) and Tess leads it, so
 *    "the lead of another programme" leads a run of their own and is nobody
 *    on AGI Strategy's.
 *  - The AGI run has six taught weeks from Thu 29 Oct and three groups with a
 *    weekly time: Group B (Tuesdays 6pm, Rahul and Sofia), Group A (Thursdays
 *    6pm, Sofia) and Group C (Wednesdays 1pm, Tom). Nobody on the form
 *    facilitates, so a lead and a facilitator are never the same person here.
 *  - Nadia is SU-recognised committee, named on nothing, and stands ready to
 *    be made AGI Strategy's lead in Claudia's place.
 *
 * The personas a suite asks as are `PERSONAS`, each a uid (or null for
 * somebody signed out) with the words a failure names them by.
 */
import { session, userDoc } from "./applicationsSmallTerm.mjs";
import { AGI, GROUP, ROUND, RUN, TAIS, groupDoc, namedSeed } from "./handoverWorld.mjs";

export { AGI, GROUP, ROUND, RUN, TAIS };

/** Six taught weeks: a Tuesday group meets from Tue 3 Nov to Tue 8 Dec. */
export const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({
  kind: "week",
  weekNumber: i + 1,
  weekId: `w0${i + 1}`,
}));

/** A weekly slot, Tuesdays at 6pm for two hours, unless told otherwise. */
export const slot = (over = {}) => ({
  weekday: 2,
  startTimeLocal: "18:00",
  durationMinutes: 120,
  location: "Hallward B12",
  meetingUrl: null,
  notes: "",
  ...over,
});

/** The three AGI groups, by the board's own names. */
export const B = GROUP.monday;
export const A = GROUP.thursday;
export const C = GROUP.unset;

/** Everybody a suite asks as, with what they are on this term. */
export const PERSONAS = [
  ["zach", "an admin"],
  ["claudia", "the lead of the programme that names the run"],
  ["tess", "the lead of another programme, which names a run of its own"],
  ["lloyd", "the programme's reviewer, who is also the run's admissions reviewer"],
  ["yusuf", "the run's track lead"],
  ["rahul", "a facilitator of one of the run's groups"],
  ["amara", "a member placed on the run"],
  ["nobody", "a member who is on nothing"],
  [null, "somebody signed out"],
];

/** The world every lead suite starts from. `over` adds or replaces whole documents. */
export function leadSeed(over = {}) {
  const seed = namedSeed();
  for (const [uid, name] of [
    ["rahul", "Rahul Mehta"],
    ["sofia", "Sofia Rossi"],
    ["tom", "Tom Fletcher"],
  ]) {
    seed[`users/${uid}`] = userDoc(session(uid, "member", false, name));
  }
  seed["users/nadia"] = userDoc(session("nadia", "committee", true, "Nadia Hassan"));

  const form = seed[`admissionRounds/${ROUND}`];
  form.programmes[TAIS].runId = RUN.tais;

  seed[`courseRuns/${RUN.agi}`] = { ...seed[`courseRuns/${RUN.agi}`], startDate: "2026-10-29", weekPlan: SIX_WEEKS };
  seed[`courseRuns/${RUN.tais}`] = { ...seed[`courseRuns/${RUN.tais}`], startDate: "2026-10-29", weekPlan: SIX_WEEKS };
  seed[`courseGroups/${B}`] = groupDoc({ name: "Group B", facilitatorUids: ["rahul", "sofia"], session: slot() });
  seed[`courseGroups/${A}`] = groupDoc({
    name: "Group A",
    facilitatorUids: ["sofia"],
    session: slot({ weekday: 4, location: "Portland A13" }),
  });
  seed[`courseGroups/${C}`] = groupDoc({
    name: "Group C",
    facilitatorUids: ["tom"],
    session: slot({ weekday: 3, startTimeLocal: "13:00", location: "Room B8" }),
  });
  return { ...seed, ...over };
}

/** The round document a suite changes in place: who leads, which run a programme names. */
export const formPath = `admissionRounds/${ROUND}`;
