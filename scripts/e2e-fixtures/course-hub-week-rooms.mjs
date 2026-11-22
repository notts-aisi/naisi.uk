/**
 * The course hub's spec of the week's rooms: every group's room for one week,
 * set in its row or pasted from a sheet, and the term's rooms as a grid.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the run began 17 days before the seed, Publish told
 * everybody their group before the start, and both groups' week 4 sessions
 * are still to come. Group A (Ada and Ben) has the meeting link, so an email
 * that carried it would be caught. The spec
 * (`tests/e2e/course-hub-week-rooms.spec.mjs`) is the admin, as the
 * programme's lead would be: the week's rooms opened from All groups,
 * Group A's week 4 room set in its row and the group told, Group B's pasted
 * from two columns and the group told, and the term's rooms with both weeks
 * marked and a cell that opens its week.
 *
 * ## Nothing above a waiting account is the fixture's
 *
 * The admin names the running run on the programme's Settings tab and hands
 * its people over, as at every point of the term. Nobody else signs in: Ada,
 * Ben and Cleo are read only through their mailboxes.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Each room changed tells its group, and each email is read out of the
 * group's mailboxes for its subject, its room and the meeting link it must
 * never carry. So the spec declares `requiresCaughtMail`, and the runner skips
 * it anywhere but a server it started with its mail forced into Mailpit.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const WEEK_ROOMS_STEPS = [
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin opens the week's rooms from All groups: Group A's week 4 is a row with its day, time and room",
  "the admin sets Group A's week 4 room in its row, the button counts whom it emails, and the group is told",
  "the room's email reaches Group A's people with its subject and the room, and none carries the meeting link",
  "the admin pastes Group B's week 4 room from two columns, the box matches it, and Save tells the group",
  "the term's rooms shows Group A's week 4 as its own room, not moved, and its link opens the week with the row in view",
  "the admin sets Group A's weeks 5 and 6 in the grid with one Save that emails nobody, and each week's page reads them back",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin drives takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-week-rooms",
  specFile: "tests/e2e/course-hub-week-rooms.spec.mjs",
  steps: WEEK_ROOMS_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The Settings tab and both pages are an admin's here. The account is one
  // the harness is given; it can never make one.
  needs: { admin: true },
  // Every room's email is read out of the group's people's mailboxes.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/groups/[groupId]/session/change",
      "/api/courses/runs/[runId]/updates",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/sessions",
      "/(app)/admin/admissions/forms/[roundId]/rooms",
      "/(app)/admin/admissions/forms/[roundId]/rooms/term",
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
