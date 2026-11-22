/**
 * The course hub's spec of searching for a person or a group from the
 * sidebar, as an admin and as a programme's lead.
 *
 * The term T2 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the run three weeks in, Ada and Ben in Group A, Cleo in
 * Group B, each account the fixture's own (a waiting account, which an admin
 * finds like any other: the Members page and Approvals show them one). On
 * top of it this fixture writes:
 *
 *  - ONE MORE ACCOUNT, Gus, made like every other fixture account: role
 *    `pending`, by `createFixtureUser`, kept on the term's state as `lead` so
 *    the term counts it and tears it down with its own (`accountsOf`). The
 *    fixture grants Gus nothing: the admin approves Gus, makes Gus
 *    SU-recognised committee and names Gus the programme's lead, each on the
 *    real page, which is how a lead comes to be one.
 *  - IVY, somebody who ranked the programme, was told "No offer this time"
 *    and has since been offered a place given back, not answered yet: her
 *    account (kept as `invited`), and her application and decision as the
 *    freed places page leaves them, each on the form, so the term counts and
 *    deletes them with the form's own. The People tab lists her under Invited,
 *    and leaves her out of Everyone.
 *
 * The spec (`tests/e2e/course-hub-search.spec.mjs`) is the admin, then Gus:
 * "/" opens the box on Home, a person's name finds them with the page under
 * Members, a group's name and run find the group and Enter opens its page;
 * the programme's name finds it under Programmes and Enter opens its
 * Overview; the admin makes Gus the programme's lead; and Gus finds Ivy, and
 * Enter opens the People tab on her row, under Invited.
 *
 * ## What it does not drive
 *
 * A group's facilitator does not sign in. What a facilitator finds, and that
 * everybody else is drawn no box and answered one refusal, is driven as
 * every kind of reader against a real term in `tests/search.test.mjs`, and
 * every persona's answer from the route by the standing red team.
 *
 * ## It reads no mail
 *
 * Search sends nothing. Approving Gus emails Gus, and every fixture address
 * is suppressed first, so nothing leaves.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser, fixtureDoc } from "./core.mjs";
import { accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

export const SEARCH_STEPS = [
  "the admin presses / on Home and the search opens, its box ready for typing",
  "a person's name finds them, by the name the admin is shown, with their page under Members",
  "a group's name and run find it, and Enter opens the group's page",
  "the programme's name finds it, first, and Enter opens its Overview",
  "the admin approves the account that will lead the programme and makes it SU-recognised committee",
  "the admin names the running course run and the programme's lead on the Settings tab",
  "the lead finds somebody invited, and Enter opens the People tab on their row, under Invited",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The account the admin makes the programme's lead. */
const LEAD_PLAN = { key: "gus", first: "Gus" };
/** Somebody offered a place given back, not answered yet. */
const INVITED_PLAN = { key: "ivy", first: "Ivy" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** A civil date in London, `days` from now. */
function dateKeyIn(days) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * DAY_MS),
  );
}

async function fixtureAccount(state, plan, suppress) {
  const names = { preferred: plan.first, display: `${plan.first} Fixture ${state.termRunId}` };
  const account = await createFixtureUser({ runId: state.termRunId, index: accountsOf(state).length, suppress, names });
  if (account.suppressionId) state.suppressed.push(account.suppressionId);
  return {
    key: plan.key,
    uid: account.uid,
    email: account.email,
    password: account.password,
    first: names.preferred,
    displayName: names.display,
  };
}

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "week-three",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");
  const ada = state.people.find((person) => person.key === "ada");
  const groupB = state.groups.find((group) => group.key === "B");
  if (!ada || !groupB) throw new Error("The term has no Ada or no Group B.");

  state.lead = await fixtureAccount(state, LEAD_PLAN, suppress);
  onState?.(state);
  state.invited = await fixtureAccount(state, INVITED_PLAN, suppress);
  onState?.(state);

  // Ivy's application and decision, made from Ada's (the same form, the same
  // ranking), as decision day's "No offer this time" and then a freed place
  // offered and not answered leave them.
  const [application, decision] = await Promise.all([
    fixtureDoc("admissionApplications", `${state.formId}__${ada.uid}`).get(),
    fixtureDoc("admissionDecisions", `${state.formId}__${ada.uid}`).get(),
  ]);
  if (!application.exists || !decision.exists) throw new Error("Ada's application or decision is not there.");
  const now = new Date();
  const told = new Date(now.getTime() - 2 * DAY_MS);
  const ivy = state.invited;
  const madeApplication = application.data();
  await fixtureDoc("admissionApplications", `${state.formId}__${ivy.uid}`).set({
    ...madeApplication,
    uid: ivy.uid,
    email: ivy.email,
    displayName: ivy.displayName,
    status: "no-offer",
    result: { kind: "no-offer", programmeId: null, publishedAt: told, email: "sent", emailedAt: told, emailClaimedAt: told },
    invitation: { programmeId: state.programmeId, replyBy: dateKeyIn(5), response: null, respondedAt: null, lastReminderOn: null },
    freedPlace: { groupId: groupB.id, offeredAt: now, email: "sent", emailedAt: now, emailClaimedAt: now },
    attendance: null,
  });
  const madeDecision = decision.data();
  const decided = madeDecision.programmes[state.programmeId];
  await fixtureDoc("admissionDecisions", `${state.formId}__${ivy.uid}`).set({
    ...madeDecision,
    uid: ivy.uid,
    programmes: { [state.programmeId]: { ...decided, decision: "pool", poolReason: "capacity" } },
    pooledOutcome: { kind: "no-offer", setByUid: decided.decidedByUid, setAt: told },
  });
  return state;
}

async function teardown(state) {
  // The namespace check FIRST, before a single delete; the term's own teardown checks again.
  for (const each of accountsOf(state)) {
    if (!isHarnessAccount(each.email)) {
      throw new Error(`REFUSING to tear down ${each.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  // Ivy's application and decision are the form's, and Gus's and Ivy's accounts the term's: its teardown takes all four.
  return teardownTerm(state);
}

export const SPEC = {
  name: "course-hub-search",
  specFile: "tests/e2e/course-hub-search.spec.mjs",
  steps: SEARCH_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  needs: { admin: true },
  covers: {
    routes: [
      "/api/auth/session",
      "/api/search",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/dashboard",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/people",
    ],
  },
  /**
   * Passed locally on 19 Nov 2026 with its six steps then, the lead's included, with a teardown manifest of
   * zero. A seventh step (the programme's name finds it and Enter opens its Overview) has been added since and
   * has never run in a browser, so the spec as written has not passed: unverified until it passes whole again.
   */
  status: "unverified",
  seed,
  countRows: countTerm,
  teardown,
};
