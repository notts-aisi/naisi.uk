/**
 * The course hub's third browser spec: a facilitator's week.
 *
 * The term T1 and T2 stand on (`./worlds/course-hub-term.mjs`), at its third
 * point, "week-three-unmarked": the run began 17 days before the seed,
 * Publish told everybody their group before the start, the first three weeks
 * are published, and every register of those weeks is finished but one:
 * Group A's week 3 register, which nobody has opened. The spec
 * (`tests/e2e/course-hub-facilitators-week.spec.mjs`) is that group's
 * facilitator in their week, signed in as themselves: their group's page, the
 * register marked and finished, next week's session moved with a reason; then
 * the group's members reading their own marks and the change on their
 * programme page, the email that told them, and the lead's Overview and
 * Sessions view, read as the admin.
 *
 * ## The facilitator is a fixture account the admin appoints on a real page
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the two members of Group A and the facilitator on Approvals, names
 * the running run on the programme's Settings tab and hands its people over
 * there, and appoints Fern to Group A on the Groups tab's Facilitators view.
 * Every press after that is Fern's own, through the gates a facilitator meets:
 * the first spec in which the course hub is driven by a member of staff who
 * is not an admin. The programme's lead, read at the end, is the admin (as at
 * T1 and T2: a lead must be SU-recognised committee, which the harness never
 * makes).
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The update that tells the group about the moved session is read word for
 * word out of each member's mailbox. So the spec declares `requiresCaughtMail`,
 * and the runner skips it anywhere but a server it started with its mail
 * forced into Mailpit.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const FACILITATORS_WEEK_STEPS = [
  "the admin approves the two members of the facilitated group and the facilitator",
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin appoints a facilitator to the group whose register nobody has marked",
  "the facilitator opens their group: the roster, this week's session and the register",
  "the facilitator marks this week's register in every state it offers, and every mark is saved",
  "a member of the group sees no mark from a register that is not finished",
  "the facilitator finishes the register, which locks it, in the words of this target's ending",
  "the member reads their own marks for the week on their programme page, and nothing of anybody else's",
  "the facilitator moves next week's session with a reason, and the button says how many it emails",
  "the group's members read the change on their programme page",
  "the update's email reaches exactly the group's people, word for word, and none carries the meeting link",
  "the lead's Overview and Sessions view, read as the admin, show the register finished and the session moved",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the facilitator or the admin drives
 * takes a token. The spec keeps the shared skip wiring so a press that grows a
 * gate later is one line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-facilitators-week",
  specFile: "tests/e2e/course-hub-facilitators-week.spec.mjs",
  steps: FACILITATORS_WEEK_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the lead's tabs
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  // The update's email is read word for word out of each member's mailbox.
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
      "/api/courses/groups/[groupId]/roster",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/attendance/push",
      "/api/courses/groups/[groupId]/session/change",
      "/api/courses/runs/[runId]/updates",
      "/api/courses/runs/[runId]/overview",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/sessions",
      "/(app)/learn/[runId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/sessions",
    ],
  },
  /**
   * Unverified: written and not yet passed end to end with a teardown of
   * zero, in CI. Until then its covers count for nothing in the coverage map.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three-unmarked" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
