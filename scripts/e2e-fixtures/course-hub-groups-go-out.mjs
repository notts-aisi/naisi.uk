/**
 * The course hub's first browser spec: groups go out.
 *
 * A term just after decision day (`./worlds/course-hub-term.mjs`): an
 * application form whose decisions have been sent, three people its one
 * fellowship accepted who said they are coming and painted their weeks, one
 * more waiting account, and a course with a DRAFT run and two groups. The
 * spec (`tests/e2e/course-hub-groups-go-out.spec.mjs`) is the admin forming
 * groups from it on the real pages, in the order the term does it, then the
 * people and the facilitator reading what that told them.
 *
 * ## Every grant is made on a real page, by the admin the harness is given
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the two the journey signs in as on Approvals, names the run on the
 * programme's Settings tab, moves it on from draft in the run editor, and
 * appoints the facilitator on the Groups tab's Facilitators view. The
 * programme has no lead: nothing T1 drives needs one, and a lead must be
 * SU-recognised committee, which the harness never makes.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * "Send a test to me" emails the admin's own address, which the harness does
 * not own. So the spec declares `requiresCaughtMail`: the runner skips it,
 * saying why, anywhere but a server it started with its mail forced into
 * Mailpit, and every email the journey causes is read there.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const GROUPS_GO_OUT_STEPS = [
  "the admin approves the two waiting accounts the journey signs in as",
  "the admin names the course run on the programme's Settings tab",
  "the run editor moves the run on from draft",
  "Hand over puts each person holding a place on the run's list, and a second press writes nothing new",
  "the Times view counts who can make each group from the weeks they painted",
  "the allocation board places each person with the Move to menu",
  "the admin appoints a facilitator on the Groups tab's Facilitators view",
  "Send a test to me emails the admin the first email of each kind, marked as a test",
  "Publish with the count on its button emails each person placed and the facilitator once",
  "a person placed sees their group and its first session on their programme page",
  "a person moved after Publish sees nothing of the run until Publish is pressed again",
  "Publish again emails only the person moved, who then sees their new group",
  "the facilitator sees their group, its roster and its register",
  "every email went to the send log, and none carries the meeting link",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin drives takes a token. The
 * spec keeps the shared skip wiring so a press that grows a gate later is one
 * line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-groups-go-out",
  specFile: "tests/e2e/course-hub-groups-go-out.spec.mjs",
  steps: GROUPS_GO_OUT_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the run editor, the board and Publish are an
  // admin's. The account is one the harness is given; it can never make one.
  needs: { admin: true },
  // The test of Publish's emails goes to the admin's own address.
  requiresCaughtMail: true,
  /**
   * What a green run drives, as src/app keys. `/api/courses/runs/[runId]/sync-tasks`
   * and `/api/courses/runs/[runId]/updates` are reached and deliberately absent:
   * the member's programme page calls both on its own and nothing here reads
   * what they answer. The rows the first could write are still counted.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/runs/[runId]/status",
      "/api/courses/runs/[runId]/allocation",
      "/api/courses/runs/[runId]/allocate",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/runs/[runId]/allocation/publish/test",
      "/api/courses/runs/[runId]/allocation/publish",
      "/api/courses/runs/[runId]/overview",
      "/api/courses/me",
      "/api/courses/groups/[groupId]/roster",
      "/api/courses/groups/[groupId]/attendance",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/courses/[courseId]/runs/[runId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/times",
      "/(app)/admin/courses/[courseId]/runs/[runId]/allocation",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn",
      "/(app)/learn/[runId]",
      "/(app)/learn/[runId]/group/[groupId]",
    ],
  },
  /**
   * VERIFIED on 2026-10-25: twice against the harness's loopback server on a
   * laptop, then in the pull request's end-to-end job (run 40194300809), in
   * its final form: all fourteen steps ran, 45 rows existed before teardown
   * (the form, its 3 applications and 3 decisions, the course, run, 2 groups
   * and question set, 3 rows on the run's list, 4 enrolments, an audit row,
   * 2 send markers, 3 subscriptions and their 3 events, 9 sends, 4 accounts
   * and their documents), and the manifest read zero afterwards.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) =>
    seedTerm({ runId, suppress, onState, point: "decisions-sent" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
