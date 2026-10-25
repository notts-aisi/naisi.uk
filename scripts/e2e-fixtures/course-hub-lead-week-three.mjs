/**
 * The course hub's second browser spec: the lead's week three.
 *
 * The term T1 stands on (`./worlds/course-hub-term.mjs`), at its second point,
 * "week-three": the run began 17 days before the seed, Publish told everybody
 * their group before the start, the first three weeks are published and their
 * registers marked, all finished but Group B's week 3, and the run carries
 * one update from week 1. The spec (`tests/e2e/course-hub-lead-week-three.spec.mjs`)
 * is a programme's lead in the third week of term, on the tabs leads use from
 * the first: the Overview, Remind, Attendance and its CSV, and Messages, then
 * the people the update was to, and was not to, reading their programme page.
 *
 * ## The lead is the harness's admin, and every grant is made on a real page
 *
 * A lead must be SU-recognised committee, which the harness never makes, so
 * the programme's lead here is the admin the harness is given (as at T1).
 * The fixture makes waiting accounts and nothing above them: the admin
 * approves the two members who sign in and the facilitator, names the run on
 * the programme's Settings tab and hands its people over there, and appoints
 * Fern to Group B on the Groups tab's Facilitators view.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * "Send a test to me" emails the admin's own address, which the harness does
 * not own, and the spec reads every email the journey causes. So it declares
 * `requiresCaughtMail`, and the runner skips it anywhere else.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const LEAD_WEEK_THREE_STEPS = [
  "the admin approves the two members who sign in and the facilitator to be appointed",
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin appoints a facilitator to the group whose register is not finished",
  "the Overview shows week 3, this week's sessions and their registers, what needs attention and the newest update",
  "Remind emails the unfinished register's facilitator once, with the count its button says",
  "the Attendance tab shows every mark of the three weeks, each person's row and each week's figure",
  "Download CSV is the grid, word for word, and the download is logged",
  "Send a test to me emails the admin the update to one group, marked as a test",
  "the update to one group is posted and emailed to its people, with the count on the button",
  "a member of that group reads it on their programme page, and a member of the other group does not",
  "every email went to the send log, and none carries the meeting link",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the lead drives takes a token. The
 * spec keeps the shared skip wiring so a press that grows a gate later is one
 * line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-lead-week-three",
  specFile: "tests/e2e/course-hub-lead-week-three.spec.mjs",
  steps: LEAD_WEEK_THREE_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The lead's tabs, Approvals, the Settings tab and the Facilitators view are
  // an admin's here. The account is one the harness is given; it can never make one.
  needs: { admin: true },
  // The update's test goes to the admin's own address.
  requiresCaughtMail: true,
  /**
   * What a green run drives, as src/app keys. `/api/courses/runs/[runId]/sync-tasks`
   * is reached and deliberately absent: a member's programme page calls it on
   * its own and nothing here reads what it answers. The rows it could write
   * are still counted.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/attendance",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/registers/remind",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export",
      "/api/courses/runs/[runId]/updates",
      "/api/courses/runs/[runId]/overview",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages",
      "/(app)/learn/[runId]",
    ],
  },
  /**
   * Unverified: written and not yet passed end to end with a teardown of
   * zero, in CI. Until then its covers count for nothing in the coverage map.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
