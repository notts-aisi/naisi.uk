/**
 * The course hub's browser spec for a group's sessions and a week's work:
 * "Can't make it", the register's session report, and the week you submit.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its week's work point ("week-three-work"): three weeks into a running
 * run, Publish having told Ada and Ben their place in Group A and Cleo hers
 * in Group B, every register so far finished but Group A's week 3, which
 * nobody has opened, and weeks 1 to 4 published, written as blocks, each with
 * reflections, two sources and a written answer. Group A's week 4 session is
 * days ahead.
 *
 * The spec (`tests/e2e/course-hub-sessions-and-work.spec.mjs`) is Ada and
 * Fern, Group A's facilitator, in that week. Ada presses Can't make it on
 * her next session's ticket, and Fern's register says so. Fern marks and
 * finishes week 3's register, follows its link to the session report and
 * sends one. Ada writes week 4's written answer, goes through the check and
 * submits anyway, and the week locks. Fern reopens it from This week's work,
 * Ada's week page says who did, and Ada changes the answer and submits again.
 * Last, the programme's lead reads Fern's report, with names, on the
 * programme's session reports.
 *
 * ## Every grant is made on a real page, by the admin the harness is given
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves Ada and Fern on Approvals, names the running run on the
 * programme's Settings tab, and appoints Fern to Group A on the Groups tab's
 * Facilitators view. The programme's lead is the admin, as at every course
 * hub spec: a lead must be SU-recognised committee, which the harness never
 * makes.
 *
 * ## It reads no mail
 *
 * Nothing it checks is in an email. The approvals and the week 4 email the
 * finished register may send go to fixture addresses, suppressed first
 * wherever the mail is not caught, so it runs wherever the harness runs.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const SESSIONS_AND_WORK_STEPS = [
  "the admin approves the facilitator and the member of the group who signs in",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to the group whose register nobody has marked",
  "the member presses Can't make it on their next session's ticket, and the ticket says the register records them as excused",
  "the facilitator's register says who can't make next week's session, and the facilitator marks this week's and finishes it",
  "the facilitator follows the finished register's link to the session report and sends one",
  "the member writes the week's written answer, goes through the check and submits anyway, and the week reads submitted and locked",
  "the facilitator reopens the member's week from This week's work",
  "the member's week page says who reopened it, and the member changes the answer and submits it again",
  "the programme's lead reads the facilitator's report, with names, on the programme's session reports",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people, Fern or the admin drive
 * takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-sessions-and-work",
  specFile: "tests/e2e/course-hub-sessions-and-work.spec.mjs",
  steps: SESSIONS_AND_WORK_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the lead's pages
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  /**
   * What a green run drives, as src/app keys. Two are reached and
   * deliberately absent: `/api/courses/runs/[runId]/sync-tasks`, which a
   * member's programme page calls on its own and nothing here reads, and the
   * programme's session reports under the Surveys tab, which the lead opens
   * by its address here; following the Surveys tab's own link to it is the
   * surveys spec's.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/cant-make-it",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/attendance/push",
      "/api/courses/groups/[groupId]/session-report",
      "/api/courses/runs/[runId]/overview",
      "/api/courses/runs/[runId]/written-answers/[answerId]",
      "/api/courses/runs/[runId]/weeks/[weekId]/submit",
      "/api/courses/runs/[runId]/weeks/[weekId]/reopen",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/register",
      "/(app)/learn/[runId]/group/[groupId]/report",
      "/(app)/learn/[runId]/weeks/[n]",
    ],
  },
  /**
   * Written beside the code it drives and not yet run end to end: it counts
   * nothing on the coverage map until a run has passed and read zero rows
   * afterwards.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three-work" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
