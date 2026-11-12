/**
 * The course hub's spec of who has done a week, and Remind by hand: driven as
 * the group's FACILITATOR, read as a MEMBER.
 *
 * The term at its coursework point (`./worlds/course-hub-term.mjs`): three
 * weeks into a running run whose weeks are written as blocks, Ada and Ben in
 * Group A (which has a meeting link, so an email that carried it would be
 * caught), Cleo in Group B, Dan in no group, Fern the account the admin
 * appoints to Group A. On top of it this fixture writes what the journey
 * needs and the term does not have:
 *
 *  - WEEK 1'S THIS WEEK, as the paste writes one: a task for each of its
 *    three parts, so done counts the week's two readings, its three
 *    reflections and its written answer (the term's coursework weeks count
 *    nothing, and a week that counts nothing is never said to be done);
 *  - ADA'S WEEK 1, ALL OF IT, done before Group A's week 1 session: both
 *    readings ticked, the three reflections written, the answer sent.
 *
 * So Ben is the one fellow whose past week is not done. The spec
 * (`tests/e2e/course-hub-remind.spec.mjs`) is the admin, who approves Fern
 * and Ben, names the running run on the programme's Settings tab and appoints
 * Fern to Group A; Fern, signed in, who opens week 1 on her group page, reads
 * "1 of 2 have done week 1", previews Remind and sends it; Ben's mailbox, which
 * holds the one email; Fern again, reading Last reminded and the warning;
 * Ben, signed in, who finishes week 1 on its page; and Fern, for whom Ben has
 * dropped out of Remind.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The reminder is read out of Ben's mailbox for its words and for the
 * meeting link it must never carry, and Ada's and Fern's for its absence. So
 * the spec declares `requiresCaughtMail`, and the runner skips it anywhere but
 * a server it started with its mail forced into Mailpit.
 */
import { fixtureDoc, fixtureSubcollection } from "./core.mjs";
import { countTerm, courseworkItemId, seedTerm, sessionOf, teardownTerm, weekDocId } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const REMIND_STEPS = [
  "the admin approves the facilitator and the fellow who has not done week 1",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the facilitator opens week 1 on their group page: who has done it, and Remind for the one fellow who has not",
  "the facilitator previews Remind: the one fellow, never reminded, and the email word for word",
  "the facilitator sends it, and the one email goes to that fellow alone, in its words and with no meeting link",
  "the panel says when the fellow was last reminded and by whom, and warns before a second reminder",
  "the fellow finishes week 1 on its page, as a member",
  "the fellow drops out of Remind: week 1 is done by everybody, and nobody is left to remind",
];

/** NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED: sign-in is a password, and no route it drives takes a token. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The week the journey is about: the coursework point's week 1, whose sessions are long over. */
export const REMIND_WEEK = 1;

/** What Ada wrote of week 1, every word made up. */
export const ADA_WEEK_ONE = Object.freeze({
  rp1: "Five lamps, two of them automatic now.",
  rp2: "The harbour board, since the boats use the light.",
  rp3: "They disagree about who pays for the oil.",
  answer: "The harbour board should keep the lamps lit, because it charges the ships that need them most.",
});

/** Ada did week 1 this long before Group A's week 1 session started. */
const BEFORE_SESSION_MS = 26 * 60 * 60 * 1000;

/** Week 1's This week: a task for each of its three parts, so done counts all of them. */
function thisWeekBlock(weekNumber) {
  const id = (key) => courseworkItemId(weekNumber, key);
  const task = (what, part) => ({ type: "task", what, time: "About 20 minutes", when: "before", whenText: "", covers: [id(part)] });
  return {
    id: id("tw"),
    type: "thisWeek",
    rows: [task("Part 1: start with what you think", "p1"), task("Part 2: two keepers' views", "p2"), task("Part 3: your answer", "p3")],
    total: "About an hour",
    note: [],
  };
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
  const ada = state.people.find((person) => person.key === "ada");
  const groupA = state.groups.find((group) => group.key === "A");
  if (!ada || !groupA) throw new Error("The term has no Ada or no Group A.");

  // Week 1 as the paste writes a week: its This week first.
  const weekRef = fixtureSubcollection("courseRuns", state.runId, "weeks").doc(weekDocId(REMIND_WEEK));
  const week = (await weekRef.get()).data();
  if (!week || !Array.isArray(week.blocks)) throw new Error("The term has no week 1 written as blocks.");
  await weekRef.set({ ...week, blocks: [thisWeekBlock(REMIND_WEEK), ...week.blocks.filter((block) => block.type !== "thisWeek")] });

  // Ada's week 1, all of it, before her group met: each row as its route stores it.
  const at = new Date(sessionOf(groupA, REMIND_WEEK).startsAt.getTime() - BEFORE_SESSION_MS);
  const weekId = weekDocId(REMIND_WEEK);
  for (const key of ["s1", "s2"]) {
    const itemId = courseworkItemId(REMIND_WEEK, key);
    await fixtureDoc("courseProgress", `${state.runId}__${ada.uid}__${itemId}`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: ada.uid,
      weekNumber: REMIND_WEEK,
      itemKind: "material",
      itemId,
      completed: true,
      completedAt: at,
      hasPublicComment: false,
      updatedAt: at,
    });
  }
  for (const key of ["rp1", "rp2", "rp3"]) {
    const promptId = courseworkItemId(REMIND_WEEK, key);
    await fixtureDoc("courseExerciseResponses", `${state.runId}__${ada.uid}__${weekId}__${promptId}`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: ada.uid,
      weekId,
      weekNumber: REMIND_WEEK,
      exerciseId: promptId,
      kind: "reflection",
      responseType: "text",
      text: ADA_WEEK_ONE[key],
      submittedAt: null,
      reviewStatus: "unreviewed",
      firstWrittenAt: at,
      updatedAt: at,
    });
  }
  const answerId = courseworkItemId(REMIND_WEEK, "wa");
  await fixtureDoc("courseExerciseResponses", `${state.runId}__${ada.uid}__${weekId}__${answerId}`).set({
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    uid: ada.uid,
    weekId,
    weekNumber: REMIND_WEEK,
    exerciseId: answerId,
    responseType: "text",
    text: ADA_WEEK_ONE.answer,
    words: ADA_WEEK_ONE.answer.trim().split(/\s+/).length,
    firstWrittenAt: at,
    firstSentAt: at,
    sentAt: at,
    submittedAt: at,
    reviewStatus: "unreviewed",
    updatedAt: at,
  });
  // The runner writes what this returns as the spec's state.
  return state;
}

/**
 * The send counters a Remind leaves (`claimRemindSlot` in
 * src/lib/courses/groupWeekWork/remind.ts keeps them in `courseNudges` as
 * `emailrate__<key>`, with nothing on the row to query by): each group's
 * daily one, and each presser's hourly one for a group's week and who it was
 * for (everybody, or one person). The pressers are the term's facilitator and
 * the admin. Each Remind's per-person record carries the run, so the term
 * counts and removes those itself (`courseNudges` by `runId`), and its one
 * history row (`courseAudit` by `runId`) and its emails (by address) too.
 */
function remindCounterIdsOf(state) {
  const ids = [];
  const pressers = [state.facilitator?.uid, state.adminUid].filter(Boolean);
  const people = (state.people ?? []).map((person) => person.uid).filter(Boolean);
  for (const group of state.groups ?? []) {
    ids.push(`emailrate__weekremindday__${group.id}`);
    for (const uid of pressers) {
      for (let weekNumber = 1; weekNumber <= 3; weekNumber += 1) {
        for (const who of ["all", ...people]) ids.push(`emailrate__weekremind__${uid}__${group.id}__${weekDocId(weekNumber)}__${who}`);
      }
    }
  }
  return ids;
}

async function countRemind(state) {
  const snaps = await Promise.all(remindCounterIdsOf(state).map((id) => fixtureDoc("courseNudges", id).get()));
  return { remindCounters: snaps.filter((snap) => snap.exists).length };
}

async function countRows(state) {
  const [term, remind] = await Promise.all([countTerm(state), countRemind(state)]);
  return { ...term, ...remind, total: term.total + remind.remindCounters };
}

async function teardown(state) {
  await Promise.all(remindCounterIdsOf(state).map((id) => fixtureDoc("courseNudges", id).delete()));
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own, plus the counters, counted
  // again after the deletes.
  const term = await teardownTerm(state);
  const left = await countRemind(state);
  return { ...term, ...left, total: term.total + left.remindCounters };
}

export const SPEC = {
  name: "course-hub-remind",
  specFile: "tests/e2e/course-hub-remind.spec.mjs",
  steps: REMIND_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab and the Facilitators view are an admin's here.
  // The account is one the harness is given; it can never make one.
  needs: { admin: true },
  // The reminder is read out of the fellow's mailbox, and the others' for its absence.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/groups/[groupId]/remind",
      "/api/courses/runs/[runId]/overview",
      "/api/courses/runs/[runId]/ticks/[itemId]",
      "/api/courses/runs/[runId]/reflections/[promptId]",
      "/api/courses/runs/[runId]/written-answers/[answerId]",
      "/api/courses/runs/[runId]/written-answers/[answerId]/send",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/weeks/[n]",
    ],
  },
  /**
   * VERIFIED on 12 Nov 2026 against the harness's loopback server on a laptop
   * (a production build of the branch): all nine steps ran, 69 rows existed
   * before teardown (the form and its question set, 4 applications and 4
   * decisions, the course, the run and its 3 published weeks, 2 groups, 4
   * enrolments, 2 audit rows, Ben's reminder record, 6 ticks, 14 responses,
   * 7 log rows, 3 cohort subscriptions, 3 sends, Remind's 2 send counters, 5
   * accounts and their documents), and the manifest read zero afterwards. The
   * pull request's end-to-end job is its first CI run.
   */
  status: "verified",
  seed,
  countRows,
  teardown,
};
