/**
 * The course hub's fifth browser spec: leaving the programme, by both doors.
 *
 * The term T1 to T5 stand on (`./worlds/course-hub-term.mjs`), at two points
 * at once, each a term of its own:
 *
 *  - "week-four": the fellowship in week 4, Publish having told everybody
 *    their group before the start, every register of the first four weeks
 *    finished, Ada, Ben and Dan in Group A and Cleo in Group B. Ben leaves
 *    from the programme page ("Leave the programme", the course's title typed
 *    to confirm, with a reason); Dan by the other door, "I can’t make it" on
 *    the application page, with a reason. The spec
 *    (`tests/e2e/course-hub-leaving.spec.mjs`) reads what each then sees,
 *    what their group's facilitator sees (the group page and the register),
 *    what the programme's lead sees (the Overview, the Applications and
 *    Attendance tabs and the CSV, the allocation board), and the emails.
 *  - "after-the-end": a second fellowship whose run's last session is over,
 *    with Ivy in its one group. Leaving has closed there: neither door offers
 *    it, and a press is refused in leaving's own words.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the people who sign in on Approvals, names each running run on
 * its programme's Settings tab and hands its people over there (the row on
 * the run's own list is what makes a place the form gave somebody theirs to
 * leave), and appoints Fern to Group A on the Facilitators view. The
 * programme's lead is the admin (as at T1 to T5: a lead must be SU-recognised
 * committee, which the harness never makes), and nobody is named lead, so the
 * pages say what they say for a programme with no lead.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The leave's email is read word for word out of each leaver's mailbox. So the
 * spec declares `requiresCaughtMail`, and the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit.
 */
import { countTerms, seedTerms, teardownTerms } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const LEAVING_STEPS = [
  "the admin approves everybody who signs in on this journey",
  "a member opens their application page while their programme names no run, and it offers I can’t make it",
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin appoints a facilitator to the group two of its people will leave",
  "the first leaver's programme page and Home show their group and its meeting link, and Leave the programme",
  "the first leaver reads what leaving means, is refused a title typed wrong, and leaves with the title typed right",
  "the first leaver lands on the page that says they left, with their marks, their notes and the reading list",
  "the first leaver's programme page, Home and My programmes no longer show the group or its meeting link",
  "the second member, pointed to their programme's page, gives the place back with I can’t make it on the page they opened before",
  "the leaving email reaches each who left, word for word, and nobody else, and no email carries a reason or the meeting link",
  "the facilitator's Home says who left, the group page lists both last with the day, and the register shows them read only with their marks",
  "the lead's Overview quotes each reason, and the Applications tab gives neither",
  "the lead's Settings tab counts the places given back, and lists the two who left apart, with nothing to do",
  "the lead's Attendance grid and its CSV say each left and on which day, with the marks they had",
  "the allocation board counts both as left, Remove refuses them with the day they left, and Publish owes them nothing",
  "the two who left can no longer read their group or open its pages",
  "after the run's last session neither door offers leaving, and a press is refused in leaving's words",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people or the admin drive takes a
 * token. The spec keeps the shared skip wiring so a press that grows a gate
 * later is one line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-leaving",
  specFile: "tests/e2e/course-hub-leaving.spec.mjs",
  steps: LEAVING_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the lead's tabs
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  // The leave's email is read word for word out of each leaver's mailbox.
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
      "/api/courses/runs/[runId]/overview",
      "/api/courses/runs/[runId]/updates",
      "/api/courses/me",
      "/api/courses/runs/[runId]/enrol",
      "/api/admissions/forms/[roundId]/application/reply",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/summary",
      "/api/courses/groups/[groupId]/roster",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/attendance/export",
      "/api/courses/runs/[runId]/allocation",
      "/api/courses/runs/[runId]/enrolments/[uid]/remove",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(public)/applications/[roundId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]",
      "/(app)/learn/[runId]/leave",
      "/(app)/learn/[runId]/notes",
      "/(app)/learn/[runId]/reading",
      "/(app)/dashboard",
      "/(app)/learn",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/register",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/applications",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance",
      "/(app)/admin/courses/[courseId]/runs/[runId]/allocation",
    ],
  },
  /**
   * VERIFIED on 2026-10-25: against the harness's loopback server on a laptop
   * (beside the other four course hub specs), then in the pull request's
   * end-to-end job (run 40237105118): all seventeen steps ran, 91 rows existed
   * before teardown (2 forms and their question sets, 5 applications and 5
   * decisions, 2 courses and their runs with 11 weeks, 3 groups, 5 run
   * applications and 6 enrolments, 14 attendance marks, 2 updates, 4 course log
   * rows, 1 progress row, 1 task, 5 cohort subscriptions and 2 of their events,
   * 1 export log, 6 sends, 6 accounts and their documents), and the manifest
   * read zero afterwards.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) =>
    seedTerms({ runId, suppress, onState, points: ["week-four", "after-the-end"] }),
  countRows: countTerms,
  teardown: teardownTerms,
};
