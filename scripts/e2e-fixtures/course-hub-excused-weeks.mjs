/**
 * The course hub's browser spec of asking to be excused from a week: a
 * member asking from their session's card, an admin deciding each week, and
 * what the group's facilitator and the programme's lead are and are not told.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its "week-three-unmarked" point: three weeks into a running run, Ada and
 * Ben in Group A (a room, with a meeting link), Cleo in Group B, Publish
 * having told everybody. Group A's weeks 1 and 2 registers are finished (Ben
 * absent in week 2), its week 3 session has passed with nobody having opened
 * its register, and its week 4 session is days ahead. On top of it this
 * fixture makes two more accounts, made like every other fixture account
 * (role `pending`, by `createFixtureUser`) and kept on the term's state so
 * the term counts them and tears them down with its own (`accountsOf`):
 *
 *  - GUS, kept as `lead`: the admin approves Gus, makes Gus SU-recognised
 *    committee and names Gus the programme's lead, each on the real page.
 *  - HAL, kept as `otherFacilitator`: appointed by the admin to facilitate
 *    Group B, so a facilitator of another group is somebody real.
 *
 * Every request to be excused the spec makes is a `courseRequests` row of the
 * run, swept by the term's teardown with the run's other rows (`teardownTerm`
 * deletes every `courseRequests` row whose `runId` is the term's run), and the
 * history rows an approval writes are `courseAudit` rows of the run, swept the
 * same way. Nothing here seeds a request: every one is asked on the real page.
 *
 * The spec (`tests/e2e/course-hub-excused-weeks.spec.mjs`) is driven by the
 * people who use it, and read as the people it affects, counting every
 * person's caught mail before and after each press.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Asking emails the admins and nobody else, withdrawing emails nobody, and
 * each decision emails exactly who it says: the spec reads that off the
 * harness's own mailboxes, the harness admin's among them. So it
 * declares `requiresCaughtMail`, and the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser } from "./core.mjs";
import { accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const EXCUSED_WEEKS_STEPS = [
  "the admin approves the people, the account that will lead the programme and the other group's facilitator",
  "the admin makes the lead's account SU-recognised committee on its member page",
  "the admin names the running course run and the programme's lead on the Settings tab, and hands its people over",
  "the admin appoints a facilitator to each group",
  "a member confirms they can't take part another way and asks to be excused from their next session's card; the admins alone are emailed",
  "the facilitator's register says the member asked and nothing else, in the page and in its data",
  "the programme's lead is shown no request to be excused, on the Requests page or Home",
  "an admin opens it from Home and approves it with a reply: two emails, no reason, no link; the register and the card say excused",
  "a past week whose finished register says Absent is asked about and approved: Excused, in the group's history, and the figures change",
  "another week is declined with a reply, after a reply without deciding: the member reads it; the register shows nothing",
  "the member asks, then withdraws: the admins alone are told of the ask, and the admin's list no longer shows it",
  "came anyway: the facilitator marks the excused member in the room; the figures count them, and the request stays approved",
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
  // rows with the term's (`accountsOf`), the requests to be excused among
  // the run's requests.
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  return teardownTerm(state);
}

export const SPEC = {
  name: "course-hub-excused-weeks",
  specFile: "tests/e2e/course-hub-excused-weeks.spec.mjs",
  steps: EXCUSED_WEEKS_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, a member's page, the Settings tab, the Facilitators view and
  // deciding a request to be excused are an admin's here. The account is one
  // the harness is given; it can never make one.
  needs: { admin: true },
  // Every person's caught mail is counted before and after each press.
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
      "/api/courses/groups/[groupId]/excused",
      "/api/courses/requests/[requestId]/excused/approve",
      "/api/courses/requests/[requestId]/excused/decline",
      "/api/courses/requests/[requestId]/excused/withdraw",
      "/api/courses/requests/[requestId]/excused/reply",
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
   * VERIFIED on 12 Nov 2026 against the harness's loopback server on a laptop
   * (a production build of the branch): all twelve steps ran, and the fixture
   * manifest read zero afterwards. The pull request's end-to-end job is its
   * first CI run.
   */
  status: "verified",
  seed,
  countRows: countTerm,
  teardown,
};
