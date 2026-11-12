/**
 * The course hub's browser spec of a register that is wrong: a facilitator
 * asking for a correction of a finished register, the programme's lead
 * deciding it from the Requests page, and an admin correcting a line and a
 * whole column from the group's Attendance tab.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its "week-three-unmarked" point: three weeks into a running run, Ada and
 * Ben in Group A, Cleo in Group B, Publish having told everybody. Group A's
 * weeks 1 and 2 registers are finished (Ada and Ben in the room in week 1;
 * Ada late and Ben absent in week 2), and its week 3 session has passed with
 * nobody having opened its register. On top of it this fixture makes two
 * more accounts, made like every other fixture account (role `pending`, by
 * `createFixtureUser`) and kept on the term's state so the term counts them
 * and tears them down with its own (`accountsOf`):
 *
 *  - GUS, kept as `lead`: the admin approves Gus, makes Gus SU-recognised
 *    committee on Gus's member page and names Gus the programme's lead on
 *    its Settings tab, each on the real page. The fixture grants Gus nothing.
 *  - HAL, kept as `otherFacilitator`: a plain member once the admin approves
 *    Hal, appointed by the admin to facilitate Group B.
 *
 * The spec (`tests/e2e/course-hub-correct-register.spec.mjs`) is driven by the
 * people who use it, and read as the people it affects: Fern, Group A's
 * facilitator, finishes week 3 with a wrong line and asks for a correction;
 * Gus opens the Requests page from Home, takes the request and approves it;
 * Ada, whose line it was, reads "Corrected on" and nothing else, and Ben
 * nothing; Fern reads "as you asked", asks again, withdraws it, asks once
 * more and is declined with a reply, which Hal (another group's facilitator)
 * cannot read; and the admin corrects a line and a whole column from the
 * group's Attendance tab, each in the group's history.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Nobody is emailed by a correction or a request: the spec counts every
 * person's caught mail before and after each press. So it declares
 * `requiresCaughtMail`, and the runner skips it anywhere but a server it
 * started with its mail forced into Mailpit.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser } from "./core.mjs";
import { accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const CORRECT_REGISTER_STEPS = [
  "the admin approves the people, the account that will lead the programme and the other group's facilitator",
  "the admin makes the lead's account SU-recognised committee on its member page",
  "the admin names the running course run and the programme's lead on the Settings tab, and hands its people over",
  "the admin appoints a facilitator to each group",
  "the facilitator finishes week 3's register with a wrong line, asks for a correction with why, and the line says the ask is waiting; nobody is emailed by the ask",
  "the lead opens the Requests page from Home, takes the request and approves it; the register's line changes, and nobody is emailed",
  "the member whose line it was reads Corrected on and nothing more; another member of the group reads nothing",
  "the facilitator reads as you asked; a second ask is withdrawn, asked again and declined with a reply, which the facilitator reads and the other group's facilitator cannot",
  "the admin corrects a line and then a whole column as held online from the group's Attendance tab, after reading Before you save, and the group's history keeps each under Registers",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people drive takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The account the admin makes the programme's lead, and the other group's facilitator. */
const LEAD_PLAN = Object.freeze({ key: "gus", first: "Gus" });
const OTHER_FACILITATOR_PLAN = Object.freeze({ key: "hal", first: "Hal" });

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "week-three-unmarked",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");

  // Gus and Hal, waiting like every fixture account, numbered after the term's own.
  for (const [slot, plan] of [
    ["lead", LEAD_PLAN],
    ["otherFacilitator", OTHER_FACILITATOR_PLAN],
  ]) {
    const names = { preferred: plan.first, display: `${plan.first} Fixture ${state.termRunId}` };
    const account = await createFixtureUser({ runId: state.termRunId, index: accountsOf(state).length, suppress, names });
    if (account.suppressionId) state.suppressed.push(account.suppressionId);
    state[slot] = {
      key: plan.key,
      uid: account.uid,
      email: account.email,
      password: account.password,
      first: names.preferred,
      displayName: names.display,
    };
    onState?.(state);
  }
  return state;
}

async function teardown(state) {
  // The namespace check FIRST, before a single delete: a tampered or stale
  // ledger naming a real person is refused before anything runs. The term's
  // own teardown checks again before its own, and sweeps Gus's and Hal's
  // rows with the term's (`accountsOf`), the requests among them.
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  return teardownTerm(state);
}

export const SPEC = {
  name: "course-hub-correct-register",
  specFile: "tests/e2e/course-hub-correct-register.spec.mjs",
  steps: CORRECT_REGISTER_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, a member's page, the Settings tab, the Facilitators view and
  // the Attendance tab's corrections are an admin's here. The account is one
  // the harness is given; it can never make one.
  needs: { admin: true },
  // Nobody is emailed by a correction or a request: every person's caught
  // mail is counted before and after each press.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run/hand-over",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/attendance/push",
      "/api/courses/groups/[groupId]/attendance/requests",
      "/api/courses/groups/[groupId]/attendance/column",
      "/api/courses/requests/[requestId]/take",
      "/api/courses/requests/[requestId]/approve",
      "/api/courses/requests/[requestId]/withdraw",
      "/api/courses/requests/[requestId]/decline",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/dashboard",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]",
      "/(app)/admin/admissions/requests",
      "/(app)/admin/admissions/requests/[requestId]",
      "/(app)/learn/[runId]",
      "/(app)/learn/[runId]/group/[groupId]/register",
    ],
  },
  /**
   * VERIFIED on 13 Nov 2026 against the harness's loopback server on a laptop
   * (a production build of the branch), alone and then beside the five specs
   * that touch the register, Finish and the group's page: all nine steps ran,
   * and the fixture manifest read zero afterwards each time. The pull
   * request's end-to-end job is its first CI run.
   */
  status: "verified",
  seed,
  countRows: countTerm,
  teardown,
};
