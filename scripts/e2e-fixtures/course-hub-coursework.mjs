/**
 * The course hub's browser spec for reading coursework: the Coursework tab, a
 * person's page, and a group's reflections read with names.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its coursework point: three weeks into a running run whose weeks are
 * written as blocks, Publish having told Ada and Ben their place in Group A and
 * Cleo hers in Group B, and Dan holding a place in no group. Ada has written
 * two reflections, ticked a source with a private note on it and sent her
 * week 3 written answer; Cleo has written one reflection; Dan has written his
 * week 1 reflections and ticked a week 1 source before any group.
 *
 * The spec (`tests/e2e/course-hub-coursework.spec.mjs`) is the programme's
 * lead (the admin, as at every course hub spec: a lead must be SU-recognised
 * committee, which the harness never makes) reading the Coursework tab and
 * two people's pages, then Fern, appointed to Group A on the real page,
 * reading the group's reflections with names and the page to read lines out,
 * which still names nobody.
 *
 * WHAT IT CANNOT PROVE: that the programme's lead, when the lead is not an
 * admin, is never shown a private note or a placement Publish has not told.
 * The harness signs in no lead who is not an admin.
 * `tests/course-hub-coursework.test.mjs` drives both pages as a lead who is
 * not one, and holds both.
 *
 * ## Every grant is made on a real page, by the admin the harness is given
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves Fern and the two people of Group A on Approvals, names the running
 * run on the programme's Settings tab, and appoints Fern to Group A on the
 * Groups tab's Facilitators view.
 *
 * ## It reads no mail
 *
 * Nothing it drives sends an email but the approvals, which go to addresses
 * the fixture suppressed first. So it runs wherever the harness runs, against
 * a deployed target too.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const COURSEWORK_STEPS = [
  "the admin approves the facilitator and the two people of the group they will facilitate",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the lead opens the Coursework tab: everybody in their group, the person in no group last, and each cell in counts",
  "the lead opens the person in no group: their week 1 reflections under their prompts",
  "the lead opens a fellow's page: reflections with when, the answer waiting for feedback, and as an admin the private note",
  "the lead reads the group's reflections with each writer's name",
  "the facilitator reads the group's reflections with names, and never a private note",
  "the facilitator's page to read lines out still names nobody beside an answer",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin or the facilitator drives
 * takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-coursework",
  specFile: "tests/e2e/course-hub-coursework.spec.mjs",
  steps: COURSEWORK_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the lead's tabs
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections",
      "/(app)/learn/[runId]/group/[groupId]/reflections/names",
      "/(app)/learn/[runId]/group/[groupId]/reflections",
    ],
  },
  /**
   * UNVERIFIED: written on 30 October 2026 and not yet run in a browser. It
   * becomes verified, with the run that proved it written here, once it has
   * passed end to end with a teardown manifest of zero.
   */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "coursework" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
