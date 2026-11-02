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
 * Last, the programme's lead opens the Surveys tab from the programme's
 * head and follows the Overview's link to the programme's session reports,
 * where Fern's report is, with names.
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
  "the programme's lead follows the Surveys tab's link to the session reports and reads the facilitator's report, with names",
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
   * Surveys tab's Overview, which the lead passes through on the way to the
   * session reports and reads only its reports from: the programme surveys
   * spec reads the rest of it.
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
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/reports",
    ],
  },
  /**
   * VERIFIED on 2026-11-02, on dev b457d82c: twice against the harness's
   * loopback server on a laptop (a fresh build, then the same build again),
   * all ten steps each time. 53 rows existed before teardown (the form and
   * its question set, 3 applications and 3 decisions, the course, the run and
   * its 4 published weeks, 2 groups, 4 enrolments, 1 audit row, 3 cohort
   * subscriptions, 7 registers, 1 update, the week 4 email's marker and the
   * push's counter, 1 written answer, 1 week's work row and 4 log rows, 1
   * session report, 4 sends, 4 accounts and their documents), and the
   * manifest read zero afterwards. Verified again on 2026-11-02 at a3f512eb
   * (on dev's 3992a724), once the lead reaches the session reports by the
   * Surveys tab's Overview: all ten steps, the same 53 rows before teardown,
   * and zero after.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three-work" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
