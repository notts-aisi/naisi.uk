/**
 * The course hub's browser spec for a programme's before survey.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its seventh point, "first-day": the fellowship's run begins on the seed's
 * day, Publish has told everybody their group, week 1 is published, and no
 * group has met yet. Ada, Ben and Dan are in Group A and Cleo in Group B.
 *
 * The spec (`tests/e2e/course-hub-before-survey.spec.mjs`): the admin makes
 * the programme's before survey from its template, changes its words, sends a
 * test to themselves and reads it, and sends it to everybody holding a place,
 * each with their own link, after which its questions are fixed. Ada answers
 * every kind of question through her own link, signed out, and her link then
 * says she has answered; Ben answers from the card on Home, signed in; Dan
 * answers signed in at the survey's address inside the programme. The lead
 * reads the results, with no name anywhere, and Fern, Group A's facilitator,
 * is refused them. The admin reads who answered and downloads the answers
 * with names (logged), reminds the one person who has not answered after a
 * test of the reminder, and closes the survey.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them, and makes no
 * survey: the admin approves the people who sign in on Approvals, names the
 * running run on the programme's Settings tab (a survey is made only for a
 * programme that names its run), appoints Fern to Group A on the
 * Facilitators view, and makes, sends and reads the survey on its own pages.
 * The programme's lead is the admin (as at every course hub spec: a lead
 * must be SU-recognised committee, which the harness never makes), and
 * nobody is named lead, so the survey's box names no lead.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * "Send a test to me" emails the admin's own address, which the harness does
 * not own, and each person's link is read out of their own mailbox. So the
 * spec declares `requiresCaughtMail`, and the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const BEFORE_SURVEY_STEPS = [
  "the admin approves the two members who answer signed in and the facilitator to be appointed",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints a facilitator to the group three of the people are in",
  "the admin makes the programme's before survey from its template, and New survey offers no second",
  "the admin changes the survey's words and saves them",
  "Send a test to me emails the admin the survey as it will go, marked as a test, and its link keeps nothing",
  "the send emails everybody holding a place their own link, with the count on its button, and the questions lock",
  "a person opens their own link signed out, answers every kind of question, by keyboard where a slider is offered, and sends",
  "their link then says they have answered, and they stop the follow-ups there",
  "a second person answers from the card on Home, signed in, and the card goes",
  "a third person answers signed in at the survey's own address inside the programme",
  "the lead's results give totals with n and the response rate, and comments, and no name anywhere",
  "a facilitator is refused the survey's pages and its download, and is sent nothing",
  "Who answered names each person, and the download with names is that table, logged",
  "the reminder, after its own test, goes only to the person who has not answered, with their own link",
  "Close it now ends the survey, and the person who never answered is told it has closed",
  "every survey email went to the send log as it should, and none carries an answer or the meeting link",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin or the people drive takes
 * a token. The spec keeps the shared skip wiring so a press that grows a gate
 * later is one line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-before-survey",
  specFile: "tests/e2e/course-hub-before-survey.spec.mjs",
  steps: BEFORE_SURVEY_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and every survey page
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  // The tests go to the admin's own address, and each person's link is read
  // out of their own mailbox.
  requiresCaughtMail: true,
  /**
   * What a green run drives, as src/app keys. A member's Home also calls
   * `/api/courses/me`, `/api/courses/runs/[runId]/overview` and
   * `/api/courses/runs/[runId]/sync-tasks` on its own; they are reached and
   * deliberately absent, because nothing here reads what they answer. The
   * rows they could write are still counted.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/surveys",
      "/api/surveys/[surveyId]/questions",
      "/api/surveys/[surveyId]/test",
      "/api/surveys/[surveyId]/send",
      "/api/surveys/answer",
      "/api/surveys/consent",
      "/api/surveys/[surveyId]/answer",
      "/api/surveys/[surveyId]/export",
      "/api/surveys/[surveyId]/remind",
      "/api/surveys/[surveyId]/close",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/(admin-only)/surveys",
      "/(app)/admin/(admin-only)/surveys/new",
      "/(app)/admin/(admin-only)/surveys/[surveyId]",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/questions",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/send",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/answered",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/results",
      "/survey/[token]",
      "/(app)/dashboard",
      "/(app)/learn/[runId]/survey/[surveyId]",
    ],
  },
  /**
   * Not yet run in the pull request's end-to-end job. Flipped to "verified",
   * with the run that passed, once it has passed there with a manifest of zero.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "first-day" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
