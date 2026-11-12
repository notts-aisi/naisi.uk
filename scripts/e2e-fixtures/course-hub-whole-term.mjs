/**
 * The course hub's browser spec of a WHOLE TERM: the five pieces of running a
 * term (one way to change a group's time, covering and correcting a register,
 * a week that stays open with a reminder by hand, asking to be excused, and
 * changing one block of a live week in place) used together, each press made
 * by the person who really makes it and read by the people it affects, and
 * at the end the figures held to agree on every page that shows them.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its "whole-term" point: two weeks into a running run whose weeks are
 * written as blocks and count their work, Ada, Ben, Dan, Eve and Ivo in
 * Group A (Eve told her group after its week 2 session; Ivo holding a place
 * in the group he will facilitate), Cleo in Group B, Fern the account the
 * admin appoints to Group A. Group A's week 1 register is finished and its
 * week 2 was never opened; Group B's weeks 1 and 2 are finished. On top of it
 * this fixture makes four more accounts, made like every other fixture
 * account (role `pending`, by `createFixtureUser`) and kept on the term's
 * state so the term counts them and tears them down with its own
 * (`accountsOf`):
 *
 *  - GUS, kept as `lead`: the admin approves Gus, makes Gus SU-recognised
 *    committee and names Gus the programme's lead, each on the real page.
 *  - HAL, kept as `otherFacilitator`: appointed by the admin to Group B.
 *  - KIT, kept as `covering`: made a committee member by the admin, holding
 *    no place and facilitating nothing; the admin gives Kit one session.
 *  - MAX, kept as `outsider`: a member on no programme, whom the session
 *    picker never offers and to whom nothing is sent.
 *
 * The fixture grants none of them anything.
 *
 * ## What it leaves, and how it goes
 *
 * Every row a press writes that names the run (registers, requests, the
 * group's history, the reminders by hand, the weeks' histories and edit
 * locks, the work, the sends about the run) goes with the term's own
 * teardown. Three kinds of send counter carry no run on the row, so they are
 * counted and deleted here by the ids their routes build: finishing a
 * register's throttle for the lead who finishes one, Remind's caps, and the
 * week notice's caps.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * Every person's caught mail is counted before and after every press, and
 * every email is read for a meeting link it must never carry. So the spec
 * declares `requiresCaughtMail`, and the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser, fixtureDoc } from "./core.mjs";
import { WEEK_COUNT, accountsOf, countTerm, seedTerm, teardownTerm, weekDocId } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const WHOLE_TERM_STEPS = [
  "the admin approves everybody on the term and the member on no programme",
  "the admin makes the lead SU-recognised committee, and the account that will cover a session committee, on their member pages",
  "the admin names the running course run and the programme's lead on the Settings tab, and hands its people over",
  "the admin appoints two facilitators to Group A, one of them holding a place in it, and one to Group B",
  "the facilitator moves one coming week from her group's page, reading the preview and its count first, with the notice on: the group alone is emailed, once each, with no meeting link, and a fellow reads the new time",
  "the lead changes Group A's regular time from a later week: the weeks that met keep their day and time on the group's page, the fellow's own sessions and the register, and a fellow answers most weeks, not all, naming one week, and later can add no other",
  "the lead takes a passed week's register in the facilitators' place, marks every line, one of them wrongly, and finishes it, and the facilitator reads who took it",
  "the admin gives the other group's coming session to the committee member, who is emailed once, opens that one register and is refused the rest of the group; the member on no programme cannot be chosen",
  "the facilitator asks for a correction of the wrong line with a reason, the lead approves it from the Requests page, the fellow reads corrected with the day and another fellow nothing, and nobody is emailed",
  "the admin says the other group's passed week didn't happen, keeping pace, with no notice",
  "one fellow does week 3 before its session and another does week 2 after its session, and the facilitator and the lead read the second as late, with how late, and the on time ones as on time",
  "the second facilitator does their own week late: the lead and the admin read it, the facilitator of the group they sit in is shown nothing of it, and it is in no count",
  "the facilitator reads who has done week 1 and reminds by hand: only the fellows whose week is not done are emailed, once each, with no meeting link, and one of them finishes it and is offered no reminder",
  "a fellow confirms they can't take part another way and asks to be excused from their next session with a reason: the admins alone are emailed, the facilitator's register says they asked and nothing else, and the lead's Requests page does not list it",
  "the admin approves it with a reply: the fellow is emailed once and the group's facilitators once each without the reason, and the register's line says excused",
  "a fellow marked absent on a finished register asks about that week, confirming nothing about a session past, the admins alone are told, and the admin approves it: absent becomes excused, which the facilitator and the lead read as set by an approved request",
  "the lead fixes the title of a reading a fellow ticked and then its link, and tells the people who have started the week: the count on the button is the emails caught, none to the lead and none with a meeting link, and the tick stays",
  "the lead rewords a question a fellow answered: the fellow reads their answer under the wording they answered, and the facilitator reads the question as it was when the answer was written",
  "the lead restores the week's first version from its history, and every tick and answer is still there",
  "every fellow's attendance reads the same on their own page, the facilitator's register, the group's page, the Attendance tab and the Overview",
  "every week's work reads the same on the fellow's own week page, the group's week card, the page of the week's work, the Coursework tab and one person's page",
  "the group's history lists every change of the time, the register and being excused in the order made, with who and when and no reason for being excused, and the week's history lists every save",
  "every person's mail adds up to what each step sent, no email holds a meeting link or a reason for being excused, and nobody outside the term got anything but the admins' word of each ask",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people drive takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The accounts beside the term's own, by the slot each is kept in. */
const EXTRA_PLANS = Object.freeze([
  Object.freeze({ slot: "lead", key: "gus", first: "Gus" }),
  Object.freeze({ slot: "otherFacilitator", key: "hal", first: "Hal" }),
  Object.freeze({ slot: "covering", key: "kit", first: "Kit" }),
  Object.freeze({ slot: "outsider", key: "max", first: "Max" }),
]);

/** The week the work, the reminder and the live edit are about. */
export const WHOLE_TERM_WEEKS = Object.freeze({ remind: 1, late: 2, onTime: 3, edited: 3 });

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "whole-term",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");

  // Gus, Hal, Kit and Max, waiting like every fixture account, numbered after the term's own.
  for (const plan of EXTRA_PLANS) {
    const names = { preferred: plan.first, display: `${plan.first} Fixture ${state.termRunId}` };
    const account = await createFixtureUser({ runId: state.termRunId, index: accountsOf(state).length, suppress, names });
    if (account.suppressionId) state.suppressed.push(account.suppressionId);
    state[plan.slot] = {
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

/**
 * The send counters this journey's presses leave with no run on the row, by
 * the ids their routes build (`reserveSendSlot` and `reserveNoticeSlots` keep
 * them in `courseNudges` as `emailrate__<key>`):
 *  - finishing a register's throttle, one per group and presser
 *    (`push__<groupId>__<uid>`), for the lead, whom the term's own count does
 *    not name as a presser;
 *  - Remind's: each group's daily cap and each presser's hourly one for a
 *    group's week and who it was for (`claimRemindSlot` in
 *    src/lib/courses/groupWeekWork/remind.ts);
 *  - the week notice's: one a day for the week, one a day for the run for the
 *    two choices that reach everyone the week is open for or the whole
 *    programme, one an hour per presser and choice, and one an hour per
 *    presser for a test (the tell route).
 * The pressers are the lead, the facilitator and the admin. Giving a session
 * (per giver and group, per group, per person given it) is the term's own
 * count (`sendCounterIdsOf` in worlds/course-hub-term.mjs).
 */
function ownCounterIdsOf(state) {
  const ids = [];
  const pressers = [state.lead?.uid, state.facilitator?.uid, state.adminUid].filter(Boolean);
  const people = (state.people ?? []).map((person) => person.uid).filter(Boolean);
  for (const group of state.groups ?? []) {
    if (state.lead?.uid) ids.push(`emailrate__push__${group.id}__${state.lead.uid}`);
    ids.push(`emailrate__weekremindday__${group.id}`);
    for (const uid of pressers) {
      for (let weekNumber = 1; weekNumber <= (state.weekCount ?? WEEK_COUNT); weekNumber += 1) {
        for (const who of ["all", ...people]) ids.push(`emailrate__weekremind__${uid}__${group.id}__${weekDocId(weekNumber)}__${who}`);
      }
    }
  }
  for (let weekNumber = 1; weekNumber <= (state.weekCount ?? WEEK_COUNT); weekNumber += 1) {
    const weekId = weekDocId(weekNumber);
    ids.push(`emailrate__weekeditday__${state.runId}__${weekId}`);
    for (const uid of pressers) {
      for (const audience of ["started", "open", "programme"]) ids.push(`emailrate__weekedit__${audience}__${state.runId}__${weekId}__${uid}`);
    }
  }
  ids.push(`emailrate__weekeditwideday__${state.runId}`);
  for (const uid of pressers) ids.push(`emailrate__weekedittest__${state.runId}__${uid}`);
  return [...new Set(ids)];
}

async function countOwn(state) {
  const snaps = await Promise.all(ownCounterIdsOf(state).map((id) => fixtureDoc("courseNudges", id).get()));
  return { ownCounters: snaps.filter((snap) => snap.exists).length };
}

async function countRows(state) {
  const [term, own] = await Promise.all([countTerm(state), countOwn(state)]);
  return { ...term, ...own, total: term.total + own.ownCounters };
}

async function teardown(state) {
  // The namespace check FIRST, before a single delete: every id below is
  // built from this state file, and a tampered or stale ledger naming a real
  // person must be refused before any of them runs. The term's own teardown
  // checks again before its own, and sweeps Gus's, Hal's, Kit's and Max's
  // rows with the term's (`accountsOf`).
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  await Promise.all(ownCounterIdsOf(state).map((id) => fixtureDoc("courseNudges", id).delete()));
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own, plus the counters, counted
  // again after the deletes.
  const term = await teardownTerm(state);
  const left = await countOwn(state);
  return { ...term, ...left, total: term.total + left.ownCounters };
}

export const SPEC = {
  name: "course-hub-whole-term",
  specFile: "tests/e2e/course-hub-whole-term.spec.mjs",
  steps: WHOLE_TERM_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, members' pages, the Settings tab, the Facilitators view,
  // giving a session, a whole column and deciding a request to be excused are
  // an admin's here. The account is one the harness is given; it can never
  // make one.
  needs: { admin: true },
  // Every person's caught mail is counted before and after every press.
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
      "/api/courses/groups/[groupId]/session/change",
      "/api/courses/groups/[groupId]/session/regular",
      "/api/courses/runs/[runId]/updates",
      "/api/courses/runs/[runId]/time-answer",
      "/api/courses/runs/[runId]/overview",
      "/api/courses/groups/[groupId]/attendance",
      "/api/courses/groups/[groupId]/attendance/cover",
      "/api/courses/groups/[groupId]/attendance/push",
      "/api/courses/groups/[groupId]/attendance/requests",
      "/api/courses/groups/[groupId]/attendance/column",
      "/api/courses/requests/[requestId]/take",
      "/api/courses/requests/[requestId]/approve",
      "/api/courses/runs/[runId]/ticks/[itemId]",
      "/api/courses/runs/[runId]/reflections/[promptId]",
      "/api/courses/runs/[runId]/written-answers/[answerId]",
      "/api/courses/runs/[runId]/written-answers/[answerId]/send",
      "/api/courses/groups/[groupId]/remind",
      "/api/courses/groups/[groupId]/excused",
      "/api/courses/requests/[requestId]/excused/approve",
      "/api/courses/runs/[runId]/weeks/[weekId]/editor",
      "/api/courses/runs/[runId]/weeks/[weekId]/lock",
      "/api/courses/runs/[runId]/weeks/[weekId]/blocks/[blockId]",
      "/api/courses/runs/[runId]/weeks/[weekId]/tell",
      "/api/courses/runs/[runId]/weeks/[weekId]/history",
      "/api/courses/runs/[runId]/weeks/[weekId]/history/[saveId]",
      "/api/courses/runs/[runId]/weeks/[weekId]/history/[saveId]/restore",
      "/api/courses/runs/[runId]/my-exercises",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/dashboard",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/attendance",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/history",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/register",
      "/(app)/admin/admissions/requests",
      "/(app)/admin/admissions/requests/[requestId]",
      "/(app)/learn/[runId]",
      "/(app)/learn/[runId]/weeks/[n]",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/register",
      "/(app)/learn/[runId]/group/[groupId]/reflections/names",
    ],
  },
  /**
   * VERIFIED on 12 Nov 2026 against the harness's loopback server on a laptop
   * (a production build of the branch): all twenty three steps ran, 209 rows
   * existed before teardown (the term's form, course, run, 3 weeks and their
   * 5 saves, 2 groups, 8 places, 7 registers, 14 history rows, 3 requests, 40
   * sends, 11 accounts and their documents among them, and 5 of the counters
   * this fixture keeps), and the manifest read zero afterwards, on two runs of
   * the same head. The pull request's end-to-end job is its first CI run.
   */
  status: "verified",
  seed,
  countRows,
  teardown,
};
