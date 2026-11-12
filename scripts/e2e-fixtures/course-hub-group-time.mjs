/**
 * The course hub's spec of a group's page: one way to change a group's time.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the run began 17 days before the seed, Publish told
 * everybody their group before the start, the first three weeks are
 * published, and every register of those weeks is finished but Group B's
 * week 3. Group A (Ada and Ben) has the meeting link, so an email that
 * carried it would be caught. The spec
 * (`tests/e2e/course-hub-group-time.spec.mjs`) is the admin, as the
 * programme's lead would be: the group's page opened from the Groups tab, a
 * one-week move with what will happen read first and the group told, the
 * move put back, a new regular time from a later week with an earlier week
 * keeping its date, and the group's history.
 *
 * ## Nothing above a waiting account is the fixture's
 *
 * The admin names the running run on the programme's Settings tab and hands
 * its people over, as at every point of the term. Nobody else signs in: Ada
 * and Ben are read only through their mailboxes.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Each change tells the group, and each email is read out of Ada's and Ben's
 * mailboxes for its subject and for the meeting link it must never carry. So
 * the spec declares `requiresCaughtMail`, and the runner skips it anywhere but
 * a server it started with its mail forced into Mailpit.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const GROUP_TIME_STEPS = [
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin opens a group's page from the Groups tab: how it meets, every week with its state, and its people",
  "the admin moves one week with what will happen read first, and the button says how many it emails",
  "the move's email reaches the group's people with its subject, and none carries the meeting link",
  "the admin puts the week back as usual, and the group is told",
  "the admin changes the group's regular time from a later week, and an earlier week keeps the date it had",
  "the group's history lists each change, newest first, under Time and room",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin drives takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-group-time",
  specFile: "tests/e2e/course-hub-group-time.spec.mjs",
  steps: GROUP_TIME_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The Settings tab and the group's page are an admin's here. The account is
  // one the harness is given; it can never make one.
  needs: { admin: true },
  // Every change's email is read out of the group's people's mailboxes.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/groups/[groupId]/session/change",
      "/api/courses/groups/[groupId]/session/regular",
      "/api/courses/runs/[runId]/updates",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]",
    ],
  },
  /**
   * VERIFIED on 12 Nov 2026 against the harness's loopback server on a laptop
   * (a production build of the branch): all seven steps ran, 54 rows existed
   * before teardown (the form and its question set, 3 applications and 3
   * decisions, the course, the run and its 3 published weeks, 2 groups, 3 rows
   * on the run's list, 3 enrolments, 4 audit rows, 6 registers, 3 updates,
   * 3 send counters, 6 sends, 3 cohort subscriptions, 4 accounts and their
   * documents), and the manifest read zero afterwards. The pull request's
   * end-to-end job is its first CI run.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
