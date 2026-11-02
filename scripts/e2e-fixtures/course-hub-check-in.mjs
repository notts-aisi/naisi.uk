/**
 * The course hub's check-in spec: the check-in at the end of a session, from
 * the register to the facilitator's totals.
 *
 * The term T1 to T5 stand on (`./worlds/course-hub-term.mjs`), at its
 * "check-in" point: the fellowship three weeks in, one group of five (Ada,
 * Ben, Cleo, Dan and Eve), every register before this week's finished, and
 * the group's week 3 session under way when the seed runs. The spec
 * (`tests/e2e/course-hub-check-in.spec.mjs`) has the admin name the run and
 * appoint Fern to the group; Fern takes the register and opens the check-in,
 * which emails the five their own links; Ada and Dan answer by their links,
 * Ben signed in by the code Fern shows; Cleo's Home shows it; Fern's card
 * counts who has sent it, never who, and once Fern closes it, its totals from
 * three answers, never a comment.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the people who sign in, names the run on its programme's Settings
 * tab, hands its people over, and appoints Fern on the Facilitators view.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The check-in's email is read out of each person's mailbox, and its link
 * opened. So the spec declares `requiresCaughtMail`, and the runner skips it
 * anywhere but a server it started with its mail forced into Mailpit.
 */
import { countTerms, seedTerms, teardownTerms } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const CHECK_IN_STEPS = [
  "the admin approves everybody who signs in on this journey",
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin appoints a facilitator to the group",
  "the facilitator's register offers the check-in on the session's day, and counts the five once they are marked",
  "the facilitator opens it, and each of the five has one notice with a link of their own",
  "two people answer from their email's link, on its own page with the box at the top",
  "somebody answers signed in, from the code the facilitator shows",
  "a member who has not answered sees it on Home",
  "the facilitator's card counts who has sent it, never who, and once closed shows the totals from three answers and no comment",
  "once it has closed it is off Home, and a link to it says so",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people, Fern or the admin drive
 * takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-check-in",
  specFile: "tests/e2e/course-hub-check-in.spec.mjs",
  steps: CHECK_IN_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab and the Facilitators view are an admin's
  // here. The account is one the harness is given; it can never make one.
  needs: { admin: true },
  // The check-in's email is read out of each person's mailbox, and its link opened.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/check-in",
      "/api/courses/groups/[groupId]/check-in/close",
      "/api/surveys/answer",
      "/api/surveys/[surveyId]/answer",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]/group/[groupId]/register",
      "/survey/[token]",
      "/(app)/learn/[runId]/survey/[surveyId]",
      "/(app)/dashboard",
    ],
  },
  /**
   * VERIFIED on Mon 2 November 2026: in local mode, against the harness's own
   * server with its mail caught (`npm run e2e:browser -- --local --spec
   * course-hub-check-in`), on dev b457d82c: all ten steps ran, 68 rows existed
   * before teardown (a form and its question set, 5 applications and 5
   * decisions, a course and its run with 3 weeks, 1 group, 5 run applications
   * and 6 enrolments, 1 course log row, 3 attendance rows, 5 cohort
   * subscriptions, the check-in with its 5 people, 3 answers and 1 counter, 8
   * rows of the send log, and 6 accounts with their sign-ins), and the fixture
   * manifest read zero after it.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerms({ runId, suppress, onState, points: ["check-in"] }),
  countRows: countTerms,
  teardown: teardownTerms,
};
