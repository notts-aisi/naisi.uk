/**
 * The course hub's spec of searching for a person or a group from the
 * sidebar, as an admin.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the run three weeks in, Ada and Ben in Group A, Cleo in
 * Group B, each account the fixture's own (a waiting account, which an admin
 * finds like any other: the Members page and Approvals show them one). The
 * programme names no run at this point, so a group found leads to the group's
 * own page under /learn, which admits an admin. The spec
 * (`tests/e2e/course-hub-search.spec.mjs`) is the admin: "/" opens the box
 * on Home, a person's name finds them with the page under Members, and a
 * group's name and run find the group, and Enter opens its page.
 *
 * ## What it does not drive
 *
 * Nobody else signs in. What a programme's lead and a group's facilitator
 * find, and that everybody else is drawn no box and answered one refusal, is
 * driven as every kind of reader against a real term in
 * `tests/search.test.mjs`, and every persona's answer from the route by the
 * standing red team.
 *
 * Nothing on this journey sends an email: search reads, and writes nothing.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

export const SEARCH_STEPS = [
  "the admin presses / on Home and the search opens, its box ready for typing",
  "a person's name finds them, by the name the admin is shown, with their page under Members",
  "a group's name and run find it, and Enter opens the group's page",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-search",
  specFile: "tests/e2e/course-hub-search.spec.mjs",
  steps: SEARCH_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  needs: { admin: true },
  covers: {
    routes: ["/api/auth/session", "/api/search"],
    pages: ["/(auth)/login", "/(app)/dashboard", "/(app)/learn/[runId]/group/[groupId]"],
  },
  /** Passed locally on 19 Nov 2026, every step, with a teardown manifest of zero. */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
