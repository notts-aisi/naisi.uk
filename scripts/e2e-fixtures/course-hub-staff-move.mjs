/**
 * The course hub's spec of moving somebody to another group for good,
 * mid-term, from their page under the programme.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the run began 17 days before the seed, Publish told
 * everybody their group before the start, Ada and Ben are in Group A, Cleo in
 * Group B, and neither group has a facilitator. Group A met for week 3 on the
 * run's day 15 and Group B on day 16, so a move of Ben to Group B is from
 * week 4 by the rule. The spec (`tests/e2e/course-hub-staff-move.spec.mjs`)
 * is the admin, as the programme's lead would be: the run named and handed
 * over, the People tab's More menu to Ben's page, the week it states and what
 * will happen, the press with its count, Ben's email read out of his mailbox,
 * and Group B's page for week 3 listing Ben as joining from week 4.
 *
 * ## What it does not drive
 *
 * Nobody else signs in, and nobody facilitates either group at this point
 * (approving accounts and appointing Fern are the admin's on the real pages,
 * at points other specs drive), so the two facilitators' emails, a
 * facilitator's own group page and Ben's own programme page are executed by
 * `tests/course-staff-move.test.mjs` and the group page and member readers'
 * suites, not here.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

export const STAFF_MOVE_STEPS = [
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the People tab's More menu leads to a person's page for moving them to another group for good",
  "the page states the week the move is from, what will happen and the email to the person, and the button counts the emails",
  "the press moves them, and the page says so",
  "the person's email reaches their mailbox with the approved words, from the week stated",
  "the new group's page lists them for a week before the move as joining from that week, and never as one of that week's people",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-staff-move",
  specFile: "tests/e2e/course-hub-staff-move.spec.mjs",
  steps: STAFF_MOVE_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  needs: { admin: true },
  requiresCaughtMail: true,
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/move",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/move",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]",
    ],
  },
  /** Written 13 Nov 2026 and not yet run: a local run was refused, the port being held by another project. */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
