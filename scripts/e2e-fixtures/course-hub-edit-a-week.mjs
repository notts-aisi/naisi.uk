/**
 * The course hub's browser spec for changing one block of a live week where
 * it stands, on the programme's Weeks page: the people who use it (the
 * programme's lead and a second admin) and the people it reaches (a member
 * whose tick must survive every save, the people a notice goes to, and a
 * facilitator and a member who are refused).
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its coursework point: three weeks into a running run, its weeks 1 to 3
 * written as blocks and published, Ada and Ben in Group A and Cleo in Group
 * B, Dan holding a place in no group. Ada has ticked week 3's first reading
 * and written in it, and Cleo has written a reflection in it, so they are the
 * people who have started week 3. On top of it this fixture writes:
 *
 *  - ONE MORE ACCOUNT, Gus, made like every other fixture account: role
 *    `pending`, by `createFixtureUser`, kept on the term's state as `lead` so
 *    the term counts it and tears it down with its own. The fixture grants
 *    Gus nothing. The admin approves Gus, makes Gus SU-recognised committee on
 *    Gus's member page and names Gus the programme's lead on its Settings tab,
 *    each on the real page, which is how a lead comes to be one.
 *
 * The spec (`tests/e2e/course-hub-edit-a-week.spec.mjs`) is the harness's
 * admin, Gus, Ada and Fern, each in a browser of their own. Last, Gus
 * rewords the prompt Ada and Cleo answered, telling nobody, and Ada's week
 * page and Fern's reflections with names (the page of one question across
 * the group) show the words it had.
 *
 * ## What it leaves, and how it goes
 *
 * Every save goes in week 3's history and the lock is a document under the
 * week: the term's own teardown drains both before it deletes the weeks. The
 * notice and its test leave send counters in `courseNudges`, keyed by the run,
 * the week and whoever pressed (`src/app/api/courses/runs/[runId]/weeks/[weekId]/tell/route.ts`):
 * counted and deleted here, by the ids the route builds. Their `emailSends`
 * rows name the run, so the term's teardown takes them.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * "Send me a test first" emails the lead, and the notice emails the people
 * who have started the week; the spec reads every one of them. So it declares
 * `requiresCaughtMail`, and the runner skips it anywhere else. Every address
 * it emails is one the harness made.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser, fixtureDoc } from "./core.mjs";
import { COURSEWORK, accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const EDIT_A_WEEK_STEPS = [
  "the admin approves the facilitator, the account that will lead the programme and the member who ticked week 3's reading",
  "the admin makes that account SU-recognised committee on its member page",
  "the admin names the running course run and the programme's lead on the Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the lead opens live week 3, fixes a reading's title in its side panel and saves it for every group, telling nobody",
  "the member who ticked the reading still sees it ticked, under its new title",
  "the lead gives the same reading a new address, and the tell dialog's test emails the lead alone",
  "the lead tells the people who have started week 3: the count on the button is the emails sent, none with a meeting link and none to the lead",
  "a second admin opens week 3 while the lead has a panel open: the notice names the lead and every editing control is off",
  "the history lists every save, compares the first with now and restores it as a new save, and the member's tick is still there",
  "a facilitator and a member are refused the week's page, its history and its routes",
  "the lead rewords a prompt the member answered: her week page shows the earlier wording under her words, and the facilitator's reflections with names show the question when it was written",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the four of them drive takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The account the admin makes the programme's lead. */
const LEAD_PLAN = Object.freeze({ key: "gus", first: "Gus" });

/** The week the journey changes: published, written as blocks, with Ada's tick on its first reading. */
export const EDIT_WEEK = Object.freeze({ weekNumber: 3, weekId: "w03" });

/** Who has anything of theirs on the week, by the term's plan: the people a notice to "the people who have started" reaches. */
export function startedKeys() {
  const keys = new Set();
  for (const list of [COURSEWORK.coursework.reflections, COURSEWORK.coursework.ticks, COURSEWORK.coursework.answers]) {
    for (const row of list) if (row.weekNumber === EDIT_WEEK.weekNumber) keys.add(row.person);
  }
  return [...keys].sort();
}

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "coursework",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");

  // Gus, waiting like every fixture account, numbered after the term's own.
  const names = { preferred: LEAD_PLAN.first, display: `${LEAD_PLAN.first} Fixture ${state.termRunId}` };
  const account = await createFixtureUser({ runId: state.termRunId, index: accountsOf(state).length, suppress, names });
  if (account.suppressionId) state.suppressed.push(account.suppressionId);
  state.lead = {
    key: LEAD_PLAN.key,
    uid: account.uid,
    email: account.email,
    password: account.password,
    first: names.preferred,
    displayName: names.display,
  };
  onState?.(state);
  return state;
}

/**
 * The send counters the week's notice and its test leave, by the ids the
 * tell route builds (`reserveNoticeSlots` and `reserveSendSlot` keep them in
 * `courseNudges` as `emailrate__<key>`): one a day for the week, one a day
 * for the run for the two choices that reach everyone the week is open for or
 * the whole programme, one an hour per presser and choice, and one an hour
 * per presser for the tests. The pressers are the lead and the admin.
 */
function tellCounterIdsOf(state) {
  const { weekId } = EDIT_WEEK;
  const ids = [`emailrate__weekeditday__${state.runId}__${weekId}`, `emailrate__weekeditwideday__${state.runId}`];
  for (const uid of [state.lead?.uid, state.adminUid].filter(Boolean)) {
    ids.push(`emailrate__weekedittest__${state.runId}__${uid}`);
    for (const audience of ["started", "open", "programme"]) ids.push(`emailrate__weekedit__${audience}__${state.runId}__${weekId}__${uid}`);
  }
  return ids;
}

async function countOwn(state) {
  let weekEditCounters = 0;
  for (const id of tellCounterIdsOf(state)) if ((await fixtureDoc("courseNudges", id).get()).exists) weekEditCounters += 1;
  return { weekEditCounters };
}

async function teardown(state) {
  // The namespace check FIRST, before a single delete: every id below is
  // built from this state file, and a tampered or stale ledger naming a real
  // person must be refused before any of them runs. The term's own teardown
  // checks again before its own.
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  for (const id of tellCounterIdsOf(state)) await fixtureDoc("courseNudges", id).delete();
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own (Gus's account, week 3's
  // history and its lock among them), plus the counters, counted again.
  const term = await teardownTerm(state);
  const left = await countOwn(state);
  return { ...term, ...left, total: term.total + left.weekEditCounters };
}

export const SPEC = {
  name: "course-hub-edit-a-week",
  specFile: "tests/e2e/course-hub-edit-a-week.spec.mjs",
  steps: EDIT_A_WEEK_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, a member's page, the Settings tab and the Facilitators view
  // are an admin's, and the second editor is the admin. The account is one the
  // harness is given; it can never make one.
  needs: { admin: true },
  // The test goes to the lead's address and the notice to the people who
  // have started the week: the spec reads both out of the caught mail.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/runs/[runId]/weeks/[weekId]/editor",
      "/api/courses/runs/[runId]/weeks/[weekId]/lock",
      "/api/courses/runs/[runId]/weeks/[weekId]/blocks/[blockId]",
      "/api/courses/runs/[runId]/weeks/[weekId]/tell",
      "/api/courses/runs/[runId]/weeks/[weekId]/history",
      "/api/courses/runs/[runId]/weeks/[weekId]/history/[saveId]",
      "/api/courses/runs/[runId]/weeks/[weekId]/history/[saveId]/restore",
      "/api/courses/runs/[runId]/my-exercises",
      "/api/courses/runs/[runId]/first-read",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/history",
      "/(app)/learn/[runId]/weeks/[n]",
      "/(app)/learn/[runId]/group/[groupId]/question",
    ],
  },
  /**
   * VERIFIED on Thu 12 November 2026: in local mode, against the harness's own
   * server (`npm run e2e:browser -- --local --spec course-hub-edit-a-week`),
   * on the branch at 44380792: all twelve steps ran (the last, the earlier
   * wording read by the member and the facilitator, among them), 56 rows of
   * the term (Gus's account, week 3's five saves in its history and six sends
   * among them) and the notice's three send counters existed before
   * teardown, and the fixture manifest read zero after it. The last step's
   * reading by the facilitator moved from the group's reflections with names
   * to the page of one question on 13 November 2026, when that page was
   * retired; it has not yet run in a browser: the pull request's end-to-end
   * job runs it first.
   */
  status: "verified",
  seed,
  countRows: async (state) => ({ ...(await countTerm(state)), ...(await countOwn(state)) }),
  teardown,
};
