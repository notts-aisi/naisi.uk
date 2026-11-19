/**
 * The course hub's spec of a one-week visit to another group's session,
 * arranged by staff from a person's page under the programme, and called off.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the run began 17 days before the seed, Publish told
 * everybody their group before the start, Ada and Ben are in Group A, Cleo in
 * Group B, and neither group has a facilitator. Week 4 is still to come in
 * both groups, so Ben may visit Group B's week 4 session. The spec
 * (`tests/e2e/course-hub-visit.spec.mjs`) is the admin, as the programme's
 * lead would be: the run named and handed over, the People tab's More menu to
 * Ben's page, the week and the session chosen, what will happen and the email
 * to Ben, the press with its count, Ben's email read out of his mailbox, both
 * groups' pages for week 4 (Ben visiting on Group B's, at Group B on Group
 * A's), and the visit called off from the same page with the email it sends
 * Ben.
 *
 * ## What it does not drive
 *
 * Nobody else signs in, and nobody facilitates either group at this point, so
 * the two groups' facilitators' emails, both registers, the host's reading of
 * that week, the facilitators' own group pages and Ben's own programme page
 * with its cancel are executed by `tests/course-visit.test.mjs` and
 * `tests/course-visit-readers.test.mjs`, not here.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { fixtureDoc } from "./core.mjs";
import { accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

export const VISIT_STEPS = [
  "the admin names the running course run on the programme's Settings tab and hands its people over",
  "the People tab's More menu leads to a person's page for a one-week visit to another group",
  "the page offers the weeks still to come and that week's other sessions, says what will happen and the email to the person, and the button counts the emails",
  "the press arranges the visit, and the page says so",
  "the person's email reaches their mailbox with the approved words",
  "the host group's page lists them visiting for that week, and their own group's page says where they are",
  "the same page calls the visit off, and the person's email says so",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/**
 * The counters the visit's presses leave (`src/lib/courses/visit/limits.ts`
 * keeps them in `courseNudges` as `emailrate__<key>`): one a day for the
 * person visited on this run, and one a day for the presser, the harness's
 * admin. They carry no run id, so the term's own teardown never reaches them.
 */
function visitCounterIdsOf(state) {
  const ben = (state.people ?? []).find((each) => each.key === "ben");
  return [
    ...(ben ? [`emailrate__visitperson__${state.runId}__${ben.uid}`] : []),
    ...(state.adminUid ? [`emailrate__visitpresser__${state.adminUid}`] : []),
  ];
}

async function countOwn(state) {
  let visitCounters = 0;
  for (const id of visitCounterIdsOf(state)) if ((await fixtureDoc("courseNudges", id).get()).exists) visitCounters += 1;
  return { visitCounters };
}

async function teardown(state) {
  // The namespace check FIRST, before a single delete, as every fixture's teardown makes it.
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  for (const id of visitCounterIdsOf(state)) await fixtureDoc("courseNudges", id).delete();
  const term = await teardownTerm(state);
  const left = await countOwn(state);
  return { ...term, ...left, total: term.total + left.visitCounters };
}

export const SPEC = {
  name: "course-hub-visit",
  specFile: "tests/e2e/course-hub-visit.spec.mjs",
  steps: VISIT_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  needs: { admin: true },
  requiresCaughtMail: true,
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/visit",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/visit",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]",
    ],
  },
  // Verified: first run on Wednesday 18 November 2026. Changed since (its
  // sixth step checks the chip itself; its count and teardown include the two
  // limit counters its presses leave) and run again as it now stands on
  // Thursday 19 November 2026 against the harness's own server on
  // http://127.0.0.1:3100 with its mail caught: all seven steps completed, 46
  // rows of the term and the 2 counters before teardown, and a manifest of
  // zero after it.
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "week-three" }),
  countRows: async (state) => ({ ...(await countTerm(state)), ...(await countOwn(state)) }),
  teardown,
};
