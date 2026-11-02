/**
 * The course hub's browser spec for week 1 before groups go out.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its "before-groups" point: decision day's records as the first point
 * writes them (an application form whose decisions have been sent, three
 * people its one fellowship accepted who said they are coming, one more
 * waiting account, a course with a DRAFT run and two groups), and the run's
 * weeks 2 to 6 published, with week 1 not written at all.
 *
 * The spec (`tests/e2e/course-hub-week-one-before-groups.spec.mjs`) is the
 * programme's lead writing week 1 on the Weeks tab and marking it ready, and
 * the people holding a place reading it before anybody is handed over:
 * Start here and the Glossary from week 1, a tick and a reflection saved,
 * every other week and the groups still shut. Somebody who gives their place
 * back, and somebody who never held one, are refused it. Then the admin hands
 * over, places and publishes, and the same week 1 says when the work is due
 * for the group.
 *
 * ## Every grant is made on a real page, by the admin the harness is given
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the three who sign in on Approvals, names the run on the
 * programme's Settings tab and moves it on from draft in the run editor, sets
 * the day groups go out on the Groups tab, loads Start here and the Glossary
 * in the run editor, writes week 1 and marks it ready on the Weeks tab, hands
 * the people still holding a place over and places them. The programme's
 * lead is the admin (as at every course hub spec: a lead must be SU-recognised
 * committee, which the harness never makes), and nobody is named lead.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Publish needs its test first, and "Send a test to me" emails the admin's
 * own address, which the harness does not own. So the spec declares
 * `requiresCaughtMail`: the runner skips it, saying why, anywhere but a server
 * it started with its mail forced into Mailpit.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const WEEK_ONE_BEFORE_GROUPS_STEPS = [
  "the admin approves the three accounts that sign in on this journey",
  "the admin names the course run on the programme's Settings tab and moves it on from draft",
  "the admin sets the day groups go out on the Groups tab's Sessions view",
  "the admin loads the programme's Start here and Glossary in the run's editor",
  "the lead pastes week 1 on the Weeks tab, saves it as a draft and previews it as a fellow",
  "while week 1 is a draft, a person holding a place reads that their group is on its way, and week 1, Start here and the Glossary stay shut",
  "the lead marks week 1 ready on the Weeks tab, which publishes it",
  "the person holding a place opens week 1 from Home and from My programmes, before the hand-over",
  "Start here and the Glossary open from week 1, and the Glossary's find box filters its terms",
  "a tick and a reflection save on week 1, and are there after a reload, under the lines that say who sees them",
  "week 2, the programme's page and the groups stay shut to the person holding a place",
  "somebody who gives their place back loses week 1, and is refused it in the page's words",
  "somebody who never held a place is refused week 1 in the page's words",
  "the admin hands the people still holding a place over and places each in a group",
  "Publish, after its test to the admin, tells each person placed their group",
  "once Publish has told them, week 1 gives their group's due day, with their tick and reflection kept",
  "every email the journey caused went to the send log, and none carries the meeting link",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people or the admin drive takes a
 * token. The spec keeps the shared skip wiring so a press that grows a gate
 * later is one line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-week-one-before-groups",
  specFile: "tests/e2e/course-hub-week-one-before-groups.spec.mjs",
  steps: WEEK_ONE_BEFORE_GROUPS_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the run editor, the Groups and Weeks tabs,
  // the board and Publish are an admin's here. The account is one the harness
  // is given; it can never make one.
  needs: { admin: true },
  // The test of Publish's emails goes to the admin's own address.
  requiresCaughtMail: true,
  /**
   * What a green run drives, as src/app keys. `/api/courses/runs/[runId]/sync-tasks`
   * is reached and deliberately absent: a week page calls it on its own for
   * somebody Publish has told, and nothing here reads what it answers. The
   * rows it could write are still counted.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/status",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/groups-go-out",
      "/api/courses/runs/[runId]/guide/[doc]",
      "/api/courses/runs/[runId]/weeks/[weekId]/blocks",
      "/api/courses/runs/[runId]/weeks/[weekId]/ready",
      "/api/courses/runs/[runId]/overview",
      "/api/courses/runs/[runId]/ticks/[itemId]",
      "/api/courses/runs/[runId]/reflections/[promptId]",
      "/api/courses/runs/[runId]/my-exercises",
      "/api/courses/me",
      "/api/admissions/forms/[roundId]/application/reply",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/runs/[runId]/allocation",
      "/api/courses/runs/[runId]/allocate",
      "/api/courses/runs/[runId]/allocation/publish/test",
      "/api/courses/runs/[runId]/allocation/publish",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/courses/[courseId]/runs/[runId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/sessions",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/preview",
      "/(app)/dashboard",
      "/(app)/learn",
      "/(app)/learn/[runId]/weeks/[n]",
      "/(app)/learn/[runId]/start-here",
      "/(app)/learn/[runId]/glossary",
      "/(public)/applications/[roundId]",
      "/(app)/admin/courses/[courseId]/runs/[runId]/allocation",
    ],
  },
  /**
   * VERIFIED on 2026-10-27: against the harness's loopback server on a laptop
   * (beside the other course hub specs), then in the pull request's end-to-end
   * job (run 40441380710): all seventeen steps ran, 44 rows existed before
   * teardown (a form and its question set, 3 applications and 3 decisions, a
   * course and its run with 6 weeks, 2 groups, 2 run applications and 2
   * enrolments, 1 course log row, 1 nudge, 1 progress row, 1 exercise response,
   * 2 cohort subscriptions and 2 of their events, 6 rows of the send log, and 4
   * accounts with their sign-ins), and the fixture manifest read zero after it.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "before-groups" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
