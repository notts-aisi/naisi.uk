/**
 * The course hub's spec of the draw: a facilitator copies next week's slips
 * in during the session that hands them out, and a member reads their case.
 *
 * The term T1 to T5 stand on (`./worlds/course-hub-term.mjs`), at its
 * "draw-night" point: the fellowship three weeks in, one group of two (Ada
 * and Ben), every register before this week's finished, and the group's week
 * 3 session under way when the seed runs. Weeks 3 and 4 each give out a
 * pathway and a case study grouped by it. The spec
 * (`tests/e2e/course-hub-draw.spec.mjs`) has the admin name the run and
 * appoint Fern to the group; during the session Fern's group page card is
 * about week 4 and opens the draw on it, Fern copies Ada's and Ben's slips
 * in and saves, Ada reads her case on her week 4 page, and Fern's week 3 says
 * it is the week people are working on now, asks before a save, and asks
 * before leaving with a change not saved.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the two who sign in (Fern and Ada), names the run on its
 * programme's Settings tab, hands its people over, and appoints Fern on the
 * Facilitators view.
 *
 * ## Mail
 *
 * The draw sends nothing. The spec reads no mail, so it runs wherever the
 * harness runs; where the mail is caught it also checks that copying the
 * slips in sent Ada nothing past her approval.
 */
import { countTerms, seedTerms, teardownTerms } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const DRAW_STEPS = [
  "the admin approves everybody who signs in on this journey",
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the admin appoints a facilitator to the group",
  "during the session the group page's card is about next week, pinned under the session card, and opens the draw on it",
  "the draw page is about next week, its Week picker lists every week that gives something out, and it says tonight's slips go in here",
  "the facilitator copies two people's slips in and saves, and the page says how many have theirs",
  "a member reads their pathway and case on that week's page, and nobody was emailed",
  "the session's own week says it is the week people are working on now, and Save asks before it changes anything",
  "leaving with a change not saved asks first, and leaving without saving changes nothing",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes Fern, Ada or the admin drive takes a
 * token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-draw",
  specFile: "tests/e2e/course-hub-draw.spec.mjs",
  steps: DRAW_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab and the Facilitators view are an admin's
  // here. The account is one the harness is given; it can never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/draw",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/draw/[groupId]",
      "/(app)/learn/[runId]/weeks/[n]",
    ],
  },
  /**
   * VERIFIED on Sat 21 November 2026: in local mode, against the harness's own
   * server (`npm run e2e:browser -- --local --spec course-hub-draw`), on
   * d5143cf6: all nine steps ran, and the fixture manifest read zero after
   * teardown.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerms({ runId, suppress, onState, points: ["draw-night"] }),
  countRows: countTerms,
  teardown: teardownTerms,
};
