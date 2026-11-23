/**
 * The course hub's spec of Select several on People in groups, before the
 * groups go out.
 *
 * The term the first course hub spec stands on
 * (`./worlds/course-hub-term.mjs`), at its first point, "decisions-sent": an
 * application form whose decisions have been sent, three people its one
 * fellowship accepted, and a course with a DRAFT run and two groups, nobody
 * placed and nothing published. The spec
 * (`tests/e2e/course-hub-board-select-several.spec.mjs`) is the harness's
 * admin: the run named on the programme's Settings tab, moved on from draft
 * in the run editor and its people handed over, then People in groups as
 * Columns, Select several, a box on every card, the bar naming who is
 * chosen, Move to… listing To place and each group with its room, everybody
 * chosen moved into one group in one press, and Clear and Done.
 *
 * ## What it does not drive
 *
 * A move of several that one person stops (a group without room for them
 * all, an archived group, a facilitator who sits in their group, somebody
 * who no longer holds a place, the groups gone out since the board was
 * loaded), two presses at once and the limit are executed against the real
 * route by `tests/course-board-move-together.test.mjs`: nothing on this
 * journey can make a group too small for three people without another page.
 * That Select several is not drawn once the groups have gone out is
 * executed by `tests/course-hub-people-in-groups.test.mjs`. Nothing here is
 * published, and nobody is emailed.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const BOARD_SELECT_STEPS = [
  "the admin names the course run on the programme's Settings tab, moves it on from draft and hands its people over",
  "People in groups before the groups go out offers Select several, which puts a box on every card",
  "the bar names who is chosen, and Move to… lists To place and each group with its room",
  "everybody chosen moves into one group in one press, and the bar says nobody was emailed",
  "Clear empties the bar, and Done takes the boxes away",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-board-select-several",
  specFile: "tests/e2e/course-hub-board-select-several.spec.mjs",
  steps: BOARD_SELECT_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The Settings tab, the run editor and the board are an admin's here. The
  // account is one the harness is given; it can never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/runs/[runId]/status",
      "/api/courses/runs/[runId]/allocation",
      "/api/courses/runs/[runId]/allocate",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/courses/[courseId]/runs/[runId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups",
    ],
  },
  /**
   * NOT RUN YET. Written against the markup of the pages it drives, and run
   * locally under the harness before it is marked verified.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "decisions-sent" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
