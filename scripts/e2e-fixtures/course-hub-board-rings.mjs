/**
 * The course hub's spec of People in groups shown as Rings.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": Publish told everybody their group before the start,
 * Ada and Ben are in Group A and Cleo in Group B. The spec
 * (`tests/e2e/course-hub-board-rings.spec.mjs`) is the harness's admin: the
 * run named and its people handed over on the Settings tab, People in groups
 * opened as Columns, "Show as Rings" carried in the address and kept by a
 * reload, each group a ring with its people, a name opening the same panel
 * as on Columns with the admin's legend under the rings, the Groups tab's
 * own links keeping the choice, Circles' old address opening Rings, and
 * Columns again with no choice in the address.
 *
 * ## What it does not drive
 *
 * Nobody else signs in: what the programme's lead is shown on Rings (marks
 * only where they may read the application, and never Claude or Pangram) is
 * executed on the payload and the drawing by
 * `tests/course-hub-board-rings.test.mjs`, and every reader's answer at the
 * two addresses by the persona battery. Nothing on this journey moves
 * anybody, writes anything beyond naming the run and handing its people
 * over, or sends an email.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

export const BOARD_RINGS_STEPS = [
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "People in groups opens as Columns, and Show as Rings is carried in the address and kept by a reload",
  "each group is a ring with its name, how full it is and its people, and the legend under the rings is the admin's",
  "a name on a ring opens the same panel as on Columns, with when they're free",
  "the Groups tab's own links keep the choice, and Circles' old address opens People in groups as Rings",
  "Show as Columns opens the board as columns again, with no choice in the address",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-board-rings",
  specFile: "tests/e2e/course-hub-board-rings.spec.mjs",
  steps: BOARD_RINGS_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The Settings tab and the board are an admin's here. The account is one
  // the harness is given; it can never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/panel",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/times",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/circles",
    ],
  },
  /**
   * NOT RUN YET. Written against the markup of the pages it drives, and run
   * locally under the harness before it is marked verified.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
