/**
 * The course hub's browser spec of covering a register: taking a session's
 * register in its facilitator's place, giving one session to somebody else,
 * the facilitator who arrives to a register somebody else started, and a
 * session that didn't happen.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its "week-three-covering" point: three weeks into a running run, Ada and
 * Ben in Group A, Cleo in Group B, Publish having told everybody. Group A's
 * week 3 session has passed and nobody opened its register; Group B's week 3
 * session has passed and its register was saved with a mark and not
 * finished. On top of it this fixture makes two more accounts, made like
 * every other fixture account (role `pending`, by `createFixtureUser`) and
 * kept on the term's state so the term counts them and tears them down with
 * its own (`accountsOf`):
 *
 *  - GUS, kept as `lead`: the admin approves Gus, makes Gus SU-recognised
 *    committee on Gus's member page and names Gus the programme's lead on
 *    its Settings tab, each on the real page, which is how a lead comes to be
 *    one. The fixture grants Gus nothing.
 *  - OLA, kept as `covering`: a plain member once the admin approves Ola,
 *    holding no place on the run, given one session of Group A by the admin
 *    on the group's page.
 *
 * The spec (`tests/e2e/course-hub-cover-register.spec.mjs`) is driven by the
 * people who use it: Gus, as the programme's lead, takes Group A's week 3
 * register in Fern's place from the group's page, finishes it, and says
 * Group B's week 3 didn't happen; the admin gives Ola Group A's week 4
 * session; Ola opens it from the email and is refused everything else of the
 * group; and Fern, Group A's facilitator, opens the same register.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Giving a session emails the person given it, and saying a session didn't
 * happen with the notice ticked emails the group: each email is read out of
 * the harness's own mailboxes, for its count, its link and the meeting link
 * it must never carry. So the spec declares `requiresCaughtMail`, and the
 * runner skips it anywhere but a server it started with its mail forced into
 * Mailpit.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser } from "./core.mjs";
import { accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const COVER_REGISTER_STEPS = [
  "the admin approves the facilitator, the account that will lead the programme and the member who will cover a session",
  "the admin makes the lead's account SU-recognised committee on its member page",
  "the admin names the running course run and the programme's lead on the Settings tab, and hands its people over",
  "the admin appoints the facilitator to the group whose week 3 register nobody started",
  "the lead's group page says nobody has started week 3's register, and the lead takes it in the facilitator's place",
  "the lead sets lines that each say who set them, reads the check before Finish and finishes, and the report page says whose place it is written in",
  "the lead changes whether the facilitator was there, and the group's history says who took the register and, to the lead, the change",
  "the admin gives week 4's session to the member with the tick off, and one email reaches that member alone, with the register's link and no meeting link",
  "the member opens the link, sets a line, and is refused the group's page and another week's register",
  "the facilitator opens that register and reads who set each line, and nothing about their own record",
  "the lead says the other group's week 3 didn't happen with the notice ticked: the button's count is the emails caught, and its lines are gone",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the four of them drive takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The account the admin makes the programme's lead, and the one given a session. */
const LEAD_PLAN = Object.freeze({ key: "gus", first: "Gus" });
const COVERING_PLAN = Object.freeze({ key: "ola", first: "Ola" });

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "week-three-covering",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");

  // Gus and Ola, waiting like every fixture account, numbered after the term's own.
  for (const [slot, plan] of [
    ["lead", LEAD_PLAN],
    ["covering", COVERING_PLAN],
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
  // own teardown checks again before its own, and sweeps Gus's and Ola's
  // rows with the term's (`accountsOf`).
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  return teardownTerm(state);
}

export const SPEC = {
  name: "course-hub-cover-register",
  specFile: "tests/e2e/course-hub-cover-register.spec.mjs",
  steps: COVER_REGISTER_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, a member's page, the Settings tab, the Facilitators view and
  // giving a session are an admin's here. The account is one the harness is
  // given; it can never make one.
  needs: { admin: true },
  // The email to the person given a session and the group's notice are read
  // out of the harness's own mailboxes.
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
      "/api/courses/groups/[groupId]/attendance/cover",
      "/api/courses/groups/[groupId]/attendance/facilitators",
      "/api/courses/groups/[groupId]/attendance/push",
      "/api/courses/groups/[groupId]/session/change",
      "/api/courses/runs/[runId]/updates",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/register",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/report",
      "/(app)/learn/[runId]/group/[groupId]/register",
    ],
  },
  /**
   * NOT VERIFIED YET: written beside the pages it drives, and marked
   * verified only once it has passed against the harness's loopback server
   * with a teardown manifest of zero rows.
   */
  status: "unverified",
  seed,
  countRows: countTerm,
  teardown,
};
