/**
 * The course hub's browser spec for two things around a week's review that
 * reach people other than the admin who pressed them: an explainer scheduled
 * from the review, which a group's facilitator reads on their session ticket,
 * and the notes about a person a programme's lead reads and keeps.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its coursework point: three weeks into a running run, Ada and Ben in
 * Group A, Cleo in Group B and Dan in no group, week 3's sessions of both
 * groups over and week 4's days ahead. On top of it this fixture writes:
 *
 *  - ONE MORE ACCOUNT, Gus, made like every other fixture account: role
 *    `pending`, by `createFixtureUser`, kept on the term's state as `lead` so
 *    the term counts it and tears it down with its own (`accountsOf`). The
 *    fixture grants Gus nothing. The admin approves Gus, makes Gus
 *    SU-recognised committee on Gus's member page and names Gus the
 *    programme's lead on its Settings tab, each on the real page in the
 *    admin's own browser, which is how a lead comes to be one.
 *  - TWO NOTES ABOUT ADA from the programme's run, written by the admin a
 *    second after her account agreed to the policy (every fixture account
 *    agrees to the current version, 15, when it is seeded): one kept for
 *    admins and the programme's leads, one kept to admins. The lead reads
 *    the first and never the second.
 *
 * The spec (`tests/e2e/course-hub-explainers-and-lead-notes.spec.mjs`) is the
 * harness's admin, Fern and Gus. The admin approves Fern and Gus, makes Gus
 * SU-recognised committee, names the running run and Gus as the programme's
 * lead on the Settings tab and appoints Fern to Group A; from week 3's
 * review schedules an explainer with a typed topic, given by Gus, at the
 * start of Group A's next session; Fern, signed in, reads it on her next
 * session's ticket; the admin cancels it from the review, and Fern's ticket
 * is clear of it; and Gus, signed in as the programme's lead, reads the
 * notes about Ada kept for leads beside her weeks, adds one, changes it and
 * deletes it.
 *
 * ## What it cannot drive, and where that is held instead
 *
 * Nothing here reaches Claude or Pangram: an explainer sends Claude nothing,
 * and a lead is never offered either. Each person in the group reads the
 * explainer on their own ticket and in "Week N is open" while that email has
 * not gone; `tests/course-explainers.test.mjs` holds those readers, and this
 * spec reads the facilitator's.
 *
 * ## It reads no mail
 *
 * Scheduling an explainer emails whoever gives it, Gus, and approving an
 * account emails it; every fixture address is suppressed first, so nothing
 * leaves, and the spec reads no mail.
 */
import { isHarnessAccount } from "../e2e/lib/admin.mjs";
import { createFixtureUser, deleteQuery, fixtureDoc, fixtureQuery } from "./core.mjs";
import { accountsOf, countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const EXPLAINERS_AND_LEAD_NOTES_STEPS = [
  "the admin approves the facilitator and the account that will lead the programme",
  "the admin makes that account SU-recognised committee on its member page",
  "the admin names the running course run and the programme's lead on the Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the admin schedules an explainer with a typed topic from week 3's review, for Group A's next session, given by the lead",
  "the facilitator reads the explainer on their next session's ticket",
  "the admin cancels the explainer from the review, and its task closes",
  "the facilitator's ticket is clear of it",
  "the lead reads the notes about a person kept for leads beside their weeks, and none kept for admins alone",
  "the lead adds a note, changes it and deletes it, and the record agrees each time",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the three of them drive takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The account the admin makes the programme's lead. */
const LEAD_PLAN = Object.freeze({ key: "gus", first: "Gus" });

/** The notes about Ada the fixture writes, as the admin would have kept them from the run. */
export const NOTE_FOR_LEADS = "Asks the group good questions about the reading.";
export const NOTE_FOR_ADMINS = "Mentioned a clash with exams in week 5.";

/** Written a second after the seed, so after Ada's account agreed to the policy. */
const AFTER_AGREEMENT_MS = 1_000;

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
  const ada = state.people.find((person) => person.key === "ada");
  if (!ada) throw new Error("The term has no Ada.");

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

  // The two notes about Ada, from the run, kept by the admin.
  const at = new Date(Date.now() + AFTER_AGREEMENT_MS);
  const note = (text, audience) => ({
    uid: ada.uid,
    text,
    authorUid: state.adminUid ?? "e2e-note-record",
    draftedByClaude: false,
    runId: state.runId,
    programmeLabel: state.programmeName,
    audience,
    suggest: [],
    kind: "note",
    weekId: null,
    weekNumber: null,
    builtFrom: [],
    createdAt: at,
    updatedAt: at,
  });
  await fixtureDoc("memberNotes", `e2e-lead-notes-leads-${state.termRunId}`).set(note(NOTE_FOR_LEADS, "leads"));
  await fixtureDoc("memberNotes", `e2e-lead-notes-admins-${state.termRunId}`).set(note(NOTE_FOR_ADMINS, "admins"));
  return state;
}

/** The explainers scheduled on the run, and the notes about the term's people. */
async function countOwn(state) {
  const courseExplainers = (await fixtureQuery("courseExplainers").where("runId", "==", state.runId).get()).size;
  let memberNotes = 0;
  for (const person of state.people ?? []) {
    memberNotes += (await fixtureQuery("memberNotes").where("uid", "==", person.uid).get()).size;
  }
  return { courseExplainers, memberNotes };
}

async function teardown(state) {
  // The namespace check FIRST, before a single delete: the notes below are
  // found by the uids out of this state file, and a tampered or stale ledger
  // naming a real person must be refused before any of them runs. The term's
  // own teardown checks again before its own.
  for (const account of accountsOf(state)) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(`REFUSING to tear down ${account.email}: not a harness account. The state file is not one this harness wrote.`);
    }
  }
  await deleteQuery(fixtureQuery("courseExplainers").where("runId", "==", state.runId));
  // Before the term's own teardown, which deletes the accounts the notes name.
  for (const person of state.people ?? []) {
    await deleteQuery(fixtureQuery("memberNotes").where("uid", "==", person.uid));
  }
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own (Gus's account among them),
  // plus what is left of the two above, counted again after the deletes.
  const term = await teardownTerm(state);
  const left = await countOwn(state);
  return { ...term, ...left, total: term.total + left.courseExplainers + left.memberNotes };
}

export const SPEC = {
  name: "course-hub-explainers-and-lead-notes",
  specFile: "tests/e2e/course-hub-explainers-and-lead-notes.spec.mjs",
  steps: EXPLAINERS_AND_LEAD_NOTES_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, a member's page, the Settings tab, the Facilitators view and
  // the review are an admin's. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/roles",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/summary",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/explainers",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/explainers/[explainerId]",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/notes/[noteId]",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/dashboard",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review/explainer",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]",
    ],
  },
  status: "unverified",
  seed,
  countRows: async (state) => ({ ...(await countTerm(state)), ...(await countOwn(state)) }),
  teardown,
};
