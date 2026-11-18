/**
 * The course hub's spec of a person's page on a programme, for the team.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its coursework
 * point, "coursework": three weeks in, weeks 1 to 3 written as blocks, Ada
 * and Ben in Group A and Cleo in Group B, told by Publish, and Ada, Cleo and
 * Dan having written, ticked and sent what the plan says. The spec
 * (`tests/e2e/course-hub-person-page.spec.mjs`) is the harness's admin: the
 * run named on the Settings tab, Ada's name on the People tab to her page,
 * the page's sections and what an admin alone is handed, and "Read week 1"
 * into the reading view of that week.
 *
 * ## What it does not drive
 *
 * Nobody else signs in: the programme's lead, a facilitator and every other
 * reader of the page and of the facilitator's cut are executed on the payload
 * by `tests/course-person-page.test.mjs`, and their addresses by the persona
 * battery. Nothing on this journey sends an email or writes anything beyond
 * naming the run.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

export const PERSON_PAGE_STEPS = [
  "the admin names the running course run on the programme's Settings tab",
  "a person's name on the People tab opens their page on the programme",
  "the page shows their coursework week by week, their attendance as counts and the feedback they were given, with Move",
  "an admin's page carries Events and Activity, and nothing about conduct",
  "Read week 1 opens the reading view of that week",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-person-page",
  specFile: "tests/e2e/course-hub-person-page.spec.mjs",
  steps: PERSON_PAGE_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  needs: { admin: true },
  covers: {
    routes: ["/api/auth/session", "/api/admissions/forms/[roundId]/programmes/[programmeId]/run"],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]",
    ],
  },
  /** Written 18 Nov 2026 and not yet run in a browser. */
  status: "unverified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "coursework" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
