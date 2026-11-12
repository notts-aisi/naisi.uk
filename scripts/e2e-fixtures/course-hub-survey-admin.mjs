/**
 * The course hub's browser spec for the admins' side of surveys: Reports,
 * Make a chart (a survey's and a programme's check-ins), and a question set.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at "week-three": the fellowship three weeks into its run, Ada and Ben told
 * their place in Group A and Cleo hers in Group B, and the registers of the
 * first three weeks taken. On top of it this fixture writes what the weeks
 * since decision day would have left in the survey records, because a chart
 * needs answers and a browser run cannot wait weeks for them:
 *
 *  - THE PROGRAMME'S BEFORE SURVEY, sent the day before the run began and
 *    closed at the end of week 1, answered by all three people
 *    (`BEFORE_SURVEY`): one row a person, with their own link's secret, and
 *    one answer each. Three questions: a rating, a choice and a short answer,
 *    so a chart has two questions to offer and leaves the comment out.
 *  - THE CHECK-INS AT THE END OF WEEKS 1 AND 2, one per group per session
 *    (`CHECK_INS`), at the id a check-in's session gives it, each reaching the
 *    people that week's register marks there, and answered as the plan says:
 *    both of Group A in week 1, Ada alone in week 2 (Ben was absent), Cleo in
 *    week 1 and nobody in week 2 (Cleo left early and did not answer). So the
 *    check-ins are answered in more than one group, and a week can be empty.
 *
 * Nothing else is seeded: the programme names no run yet (the admin names it
 * on the Settings tab before making a survey, as every course hub spec does),
 * nobody leads it, and nobody facilitates. Every survey record names the term's
 * form and run, so the world's own teardown finds and removes them with
 * everything a survey route writes under them.
 *
 * ## A shared document, borrowed and put back
 *
 * The spec changes the words of the end of a programme's question set
 * (`surveyQuestionSets/after`), which is one document for the whole project.
 * So the seed reads it FIRST, before anything is written, and keeps what it
 * found: whether it existed (in the ledger) and the document itself (in the
 * ledger's private half, because it names the admin who last changed it).
 * Teardown puts it back exactly whenever it differs, whatever the spec reached,
 * and the manifest counts it as one row left until it matches. A ledger that
 * lost its private half can still delete a set that did not exist before;
 * one that did exist is then reported, never guessed at. The spec is in
 * `BORROWS_A_SHARED_SETTING` (scripts/e2e/lib/shard.mjs) so no two runs ever
 * borrow it at once.
 *
 * ## The scheduler's weeks
 *
 * Once the admin names the run, the scheduler's `surveys-check-in-weeks` job
 * looks at it, and weeks 1 and 2 are whole: on a project whose tick is armed
 * it may fix them while the spec runs (`checkInWeeks/{runId}__w01`). Nothing
 * here writes one, but the manifest counts every week of the run by its
 * constructed id and teardown removes any it finds.
 *
 * ## No mail
 *
 * Nothing on this journey emails anybody: making a chart, downloading it,
 * naming a run, saving a question set and making a survey all send nothing.
 * So the spec runs against a deployed target as well, with every fixture
 * address suppressed there as on every term.
 */
import { createHash, randomBytes } from "node:crypto";
import { fixtureDoc, surveyQuestionSetDoc } from "./core.mjs";
import {
  WEEK_COUNT,
  WEEK_THREE,
  countTerm,
  londonDateKey,
  londonWallClockToInstant,
  seedTerm,
  sessionOf,
  shiftDateKey,
  teardownTerm,
  weekDocId,
} from "./worlds/course-hub-term.mjs";

const log = (msg) => console.log(`[survey-admin] ${msg}`);

/** The world's point this spec stands on. */
export const POINT = "week-three";

/**
 * The before survey as the fixture writes it: its three questions and what
 * each person answered. The words are the fixture's own, worded as a survey
 * would word them; the ids are fixed so a spec can ask for one.
 */
export const BEFORE_SURVEY = Object.freeze({
  title: "Before you start",
  ready: Object.freeze({
    id: "q_e2e_ready",
    title: "How ready do you feel to start?",
    minLabel: "Not at all",
    maxLabel: "Very",
  }),
  heard: Object.freeze({
    id: "q_e2e_heard",
    title: "Where did you first hear about the programme?",
    options: Object.freeze([
      Object.freeze({ id: "o_e2e_fair", label: "The freshers’ fair" }),
      Object.freeze({ id: "o_e2e_friend", label: "A friend" }),
      Object.freeze({ id: "o_e2e_online", label: "Online" }),
    ]),
  }),
  hope: Object.freeze({ id: "q_e2e_hope", title: "What do you most hope to get from it?" }),
  /** Each person's answers, by the world's key. */
  answers: Object.freeze({
    ada: Object.freeze({ ready: 4, heard: "o_e2e_fair", hope: "A way into the field" }),
    ben: Object.freeze({ ready: 2, heard: "o_e2e_friend", hope: "People to read papers with" }),
    cleo: Object.freeze({ ready: 5, heard: "o_e2e_fair", hope: "A clearer sense of the risks" }),
  }),
});

/**
 * The check-ins, by group and week: who the register marked there (and so who
 * each reached) and what each who answered said. The marks are the world's
 * (`WEEK_THREE.marks`): an absent person is reached by nothing, and a person
 * reached who sent nothing has no answer.
 */
export const CHECK_INS = Object.freeze([
  Object.freeze({
    group: "A",
    weekNumber: 1,
    reached: Object.freeze(["ada", "ben"]),
    answers: Object.freeze({
      ada: Object.freeze({ useful: 5, confident: 4, most: "Arguing about the reading", unclear: "o_ci_nothing" }),
      ben: Object.freeze({ useful: 3, confident: 2, most: "The worked example", unclear: "o_ci_else" }),
    }),
  }),
  Object.freeze({
    group: "B",
    weekNumber: 1,
    reached: Object.freeze(["cleo"]),
    answers: Object.freeze({
      cleo: Object.freeze({ useful: 4, confident: 3, most: "Hearing what the others thought", unclear: "o_ci_nothing" }),
    }),
  }),
  Object.freeze({
    group: "A",
    weekNumber: 2,
    reached: Object.freeze(["ada"]),
    answers: Object.freeze({
      ada: Object.freeze({ useful: 2, confident: 3, most: "The last ten minutes", unclear: "o_ci_else" }),
    }),
  }),
  Object.freeze({ group: "B", weekNumber: 2, reached: Object.freeze(["cleo"]), answers: Object.freeze({}) }),
]);

/** The check-in's question ids (`CHECK_IN_QUESTION_IDS` in src/lib/surveys/checkIns/template.ts), restated. */
export const CHECK_IN_IDS = Object.freeze({
  useful: "q_ci_useful",
  most: "q_ci_most",
  better: "q_ci_better",
  unclear: "q_ci_unclear",
  confident: "q_ci_confident",
});

/** Every step the spec must complete, in order. */
export const SURVEY_ADMIN_STEPS = [
  "the admin opens Reports from the menu, and each of its three reports leads back to it",
  "the admin makes a chart of a survey's answers, split by group, and downloads the picture and the numbers, which name nobody",
  "the admin charts a programme's check-ins, by week and by group, from one of them, and downloads the picture and the numbers, which name nobody",
  "the admin names the running course run on the programme's Settings tab",
  "the admin changes the words of the end of a programme's question set and saves them",
  "a survey at the end made from it now starts with the new words",
  "the admin puts the words back, and the survey already made keeps the new ones",
];

/** Nothing on this journey is reCAPTCHA-gated: sign-in is a password and no route takes a token. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

// ---------------------------------------------------------------------------
// Restated from the TypeScript
// ---------------------------------------------------------------------------

/** `checkInSurveyId` in src/lib/surveys/checkIns/ids.ts. */
export function checkInSurveyId(runId, groupId, sessionKey) {
  const digest = createHash("sha256").update(`check-in\u0000${runId}\u0000${groupId}\u0000${sessionKey}`).digest("hex");
  return `ci-${digest.slice(0, 40)}`;
}

/** `checkInName` in src/lib/surveys/checkIns/words.ts. */
export function checkInName(programmeName, groupName, weekNumber) {
  return `${programmeName}: check-in, ${groupName}, week ${weekNumber}`;
}

/** `surveyNameFor(name, "before")` in src/lib/surveys/words.ts. */
export function beforeSurveyName(programmeName) {
  return `${programmeName}: before`;
}

/** `checkInWeekId` in src/lib/firestore/checkInWeeks.ts. */
function checkInWeekId(runId, weekNumber) {
  return `${runId}__${weekDocId(weekNumber)}`;
}

/** `mintSurveyToken`: 32 random bytes, base64url, 43 characters. Never logged or kept in the ledger. */
const mintToken = () => randomBytes(32).toString("base64url");

/** `surveyPersonId` in src/lib/firestore/surveys.ts. */
const personRowId = (surveyId, uid) => `${surveyId}__${uid}`;

/** One stored answer's id: the answer route's are random, a fixture's say whose survey they are. */
const answerRowId = (surveyId, uid) => `${surveyId}--${uid}`;

const question = (id, title, required) => ({ kind: "question", id, title, body: [], required });

/** The before survey's items, as `sanitizeSurveyItems` keeps them. */
function beforeItems() {
  const { ready, heard, hope } = BEFORE_SURVEY;
  return [
    { ...question(ready.id, ready.title, true), type: "rating", rating: { max: 5, minLabel: ready.minLabel, maxLabel: ready.maxLabel } },
    { ...question(heard.id, heard.title, true), type: "singleChoice", options: heard.options.map((option) => ({ ...option })) },
    { ...question(hope.id, hope.title, false), type: "shortText", limit: { unit: "characters", max: 500 } },
  ];
}

/**
 * A check-in's items for a week with no parts and nothing to read
 * (`checkInItems` in src/lib/surveys/checkIns/template.ts, restated): the
 * week's parts are a course page's, and the world's weeks list none.
 */
export function checkInItems() {
  return [
    { ...question(CHECK_IN_IDS.useful, "How useful was today’s session?", true), type: "rating", rating: { max: 5, minLabel: "Not at all", maxLabel: "Very" } },
    { ...question(CHECK_IN_IDS.most, "What was the most useful thing?", true), type: "shortText", limit: { unit: "characters", max: 500 } },
    { ...question(CHECK_IN_IDS.better, "What could have gone better?", false), type: "shortText", limit: { unit: "characters", max: 500 } },
    {
      ...question(CHECK_IN_IDS.unclear, "Was anything unclear?", true),
      type: "multipleChoice",
      options: [
        { id: "o_ci_else", label: "Something else" },
        { id: "o_ci_nothing", label: "Nothing was unclear" },
      ],
      noneIds: ["o_ci_nothing"],
    },
    {
      ...question(CHECK_IN_IDS.confident, "How confident do you feel about this week’s topic now?", true),
      type: "rating",
      rating: { max: 5, minLabel: "Lost", maxLabel: "Could explain it" },
    },
  ];
}

/** `checkInWindow` in src/lib/surveys/checkIns/model.ts: 11pm on the day after the session's London day. */
export function checkInClosesAt(session) {
  return londonWallClockToInstant(shiftDateKey(session.dateKey, 1), "23:00");
}

/** Two years after the run's last session, as `namesOffDayFor` dates it. */
function namesOffOnOf(state) {
  const lastKey = state.groups.map((group) => sessionOf(group, WEEK_COUNT).dateKey).sort().at(-1);
  const [year, month, day] = lastKey.split("-");
  return `${Number(year) + 2}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// The question set: snapshot, compare, restore
// ---------------------------------------------------------------------------

/** A stored set as the ledger keeps it: its fields, with the instant as a string. */
function snapshotOf(snap) {
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value && typeof value.toDate === "function" ? { at: value.toDate().toISOString() } : value;
  }
  return out;
}

/** The snapshot as a document again. */
function documentOf(snapshot) {
  const out = {};
  for (const [key, value] of Object.entries(snapshot)) {
    out[key] = value && typeof value === "object" && typeof value.at === "string" && Object.keys(value).length === 1 ? new Date(value.at) : value;
  }
  return out;
}

/**
 * Whether the set stands as it did before the run: 0 when it does, 1 when it
 * differs or cannot be told, so a manifest never reads zero past a set the
 * spec left changed.
 */
async function questionSetLeft(state) {
  const held = state.questionSet;
  if (!held) return 0;
  const now = snapshotOf(await surveyQuestionSetDoc().get());
  if (!held.existed) return now === null ? 0 : 1;
  if (!state.questionSetBefore || now === null) return 1;
  return JSON.stringify(sorted(now)) === JSON.stringify(sorted(state.questionSetBefore)) ? 0 : 1;
}

/** An object with its keys in order, at every depth, so two equal documents print the same. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

async function seedSurveys(state) {
  const people = new Map(state.people.map((person) => [person.key, person]));
  const groups = new Map(state.groups.map((group) => [group.key, group]));
  const namesOffOn = namesOffOnOf(state);
  const base = {
    privacy: "confidential",
    programmeName: state.programmeName,
    programmeKind: "fellowship",
    runId: state.runId,
    pairOf: null,
    strand: null,
    closedAt: null,
    namesOffOn,
    namesOffAt: null,
    reached: 0,
    tests: { survey: null, reminder: null },
    testToken: null,
    createdByUid: state.adminUid,
  };

  // The before survey: sent the day before the run began, closed at the end of week 1.
  const before = state.surveyAdmin.beforeSurveyId;
  const sentAt = londonWallClockToInstant(shiftDateKey(state.startDate, -1), "10:00");
  const beforePress = "e2e-press-before";
  const items = beforeItems();
  await fixtureDoc("surveys", before).set({
    ...base,
    kind: "before",
    name: beforeSurveyName(state.programmeName),
    title: BEFORE_SURVEY.title,
    intro: "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 3 questions and takes about 1 minute.",
    items,
    minutes: 1,
    audience: { kind: "programme", roundId: state.formId, programmeId: state.programmeId },
    roundId: state.formId,
    checkIn: null,
    closesAt: londonWallClockToInstant(shiftDateKey(state.startDate, 6), "23:59"),
    firstSentAt: sentAt,
    presses: [{ id: beforePress, kind: "first", at: sentAt, count: people.size, byUid: state.adminUid }],
    createdAt: new Date(sentAt.getTime() - 60 * 60_000),
    updatedAt: sentAt,
  });
  for (const [key, said] of Object.entries(BEFORE_SURVEY.answers)) {
    const person = people.get(key);
    const answeredAt = londonWallClockToInstant(state.startDate, "12:00");
    await fixtureDoc("surveyPeople", personRowId(before, person.uid)).set({
      surveyId: before,
      roundId: state.formId,
      respondent: { kind: "account", uid: person.uid },
      token: mintToken(),
      pressId: beforePress,
      sentAt,
      delivery: "sent",
      remindedAt: null,
      reminders: 0,
      answered: true,
      consents: {},
      consentsAt: null,
    });
    await fixtureDoc("surveyAnswers", answerRowId(before, person.uid)).set({
      surveyId: before,
      roundId: state.formId,
      respondent: { kind: "account", uid: person.uid },
      answers: {
        [BEFORE_SURVEY.ready.id]: { type: "rating", value: said.ready },
        [BEFORE_SURVEY.heard.id]: { type: "choice", optionId: said.heard },
        [BEFORE_SURVEY.hope.id]: { type: "text", text: said.hope },
      },
      sentAt: answeredAt,
      via: "link",
      afterFirstSession: false,
    });
  }

  // The check-ins: one per group per session, as the register's opening writes them.
  for (const plan of CHECK_INS) {
    const group = groups.get(plan.group);
    const session = sessionOf(group, plan.weekNumber);
    const sessionKey = weekDocId(plan.weekNumber);
    const id = checkInSurveyId(state.runId, group.id, sessionKey);
    const openedAt = new Date(session.endsAt.getTime() - 10 * 60_000);
    const press = `e2e-press-${sessionKey}-${group.key.toLowerCase()}`;
    await fixtureDoc("surveys", id).set({
      ...base,
      kind: "checkIn",
      name: checkInName(state.programmeName, group.name, plan.weekNumber),
      title: `How was week ${plan.weekNumber}?`,
      intro: `${group.name}.`,
      items: checkInItems(),
      minutes: 2,
      audience: {
        kind: "checkIn",
        roundId: state.formId,
        programmeId: state.programmeId,
        groupId: group.id,
        sessionKey,
        weekNumber: plan.weekNumber,
      },
      checkIn: { groupName: group.name, startsAt: session.startsAt, endsAt: session.endsAt },
      closesAt: checkInClosesAt(session),
      firstSentAt: openedAt,
      presses: [{ id: press, kind: "first", at: openedAt, count: plan.reached.length, byUid: state.adminUid }],
      createdAt: openedAt,
      updatedAt: openedAt,
    });
    for (const key of plan.reached) {
      const person = people.get(key);
      const said = plan.answers[key];
      await fixtureDoc("surveyPeople", personRowId(id, person.uid)).set({
        surveyId: id,
        roundId: state.formId,
        respondent: { kind: "account", uid: person.uid },
        token: mintToken(),
        pressId: press,
        sentAt: openedAt,
        delivery: null,
        remindedAt: null,
        reminders: 0,
        answered: Boolean(said),
      });
      if (!said) continue;
      await fixtureDoc("surveyAnswers", answerRowId(id, person.uid)).set({
        surveyId: id,
        roundId: state.formId,
        respondent: { kind: "account", uid: person.uid },
        answers: {
          [CHECK_IN_IDS.useful]: { type: "rating", value: said.useful },
          [CHECK_IN_IDS.most]: { type: "text", text: said.most },
          [CHECK_IN_IDS.unclear]: { type: "choices", optionIds: [said.unclear] },
          [CHECK_IN_IDS.confident]: { type: "rating", value: said.confident },
        },
        sentAt: new Date(openedAt.getTime() + 5 * 60_000),
        via: "link",
        afterFirstSession: true,
      });
    }
  }
}

/**
 * The term three weeks in, then the survey records on top of it. The
 * question set is read before anything at all is written, and the ids of
 * every survey are on the ledger before the first of them is.
 */
async function seed({ runId, suppress, onState }) {
  const before = await surveyQuestionSetDoc().get();
  const snapshot = snapshotOf(before);
  let published = null;
  const state = await seedTerm({
    runId,
    suppress,
    point: POINT,
    onState: (term) => {
      term.questionSet = { id: before.id, existed: snapshot !== null };
      term.questionSetBefore = snapshot;
      published = term;
      onState?.(term);
    },
  });
  if (!published) throw new Error("The term was seeded without publishing its ledger.");
  state.surveyAdmin = {
    beforeSurveyId: `e2e-before-${runId}`,
    checkInIds: CHECK_INS.map((plan) =>
      checkInSurveyId(state.runId, state.groups.find((group) => group.key === plan.group).id, weekDocId(plan.weekNumber)),
    ),
  };
  // The world places people as WEEK_THREE does, and the check-ins above follow its marks.
  for (const plan of CHECK_INS) {
    for (const key of plan.reached) {
      const mark = WEEK_THREE.marks[plan.group]?.[plan.weekNumber]?.[key];
      if (!mark || mark === "absent") throw new Error(`The check-in plan reaches ${key} in week ${plan.weekNumber}, whom the register does not mark there.`);
    }
  }
  await seedSurveys(state);
  log(
    `Seeded a before survey answered by ${Object.keys(BEFORE_SURVEY.answers).length} and ${CHECK_INS.length} check-ins ` +
      `on ${state.runId}, on ${londonDateKey(new Date())}; the end of a programme's question set ` +
      `${snapshot === null ? "did not exist" : "existed"} before the run.`,
  );
  return state;
}

// ---------------------------------------------------------------------------
// Counting and teardown
// ---------------------------------------------------------------------------

/** The weeks of the run the scheduler could have fixed while the spec ran. */
async function checkInWeeksLeft(state) {
  let n = 0;
  for (let week = 1; week <= WEEK_COUNT; week += 1) {
    if ((await fixtureDoc("checkInWeeks", checkInWeekId(state.runId, week)).get()).exists) n += 1;
  }
  return n;
}

async function countRows(state) {
  const counts = await countTerm(state);
  const mine = { checkInWeeks: await checkInWeeksLeft(state), questionSet: await questionSetLeft(state) };
  return { ...counts, ...mine, total: counts.total + mine.checkInWeeks + mine.questionSet };
}

/** Remove every week of the run the scheduler could have fixed, by its constructed id. */
async function deleteCheckInWeeks(state) {
  if (!state.runId) return;
  for (let week = 1; week <= WEEK_COUNT; week += 1) {
    await fixtureDoc("checkInWeeks", checkInWeekId(state.runId, week)).delete();
  }
}

/**
 * The question set first, put back exactly as the seed found it, whatever
 * became of the spec; then the scheduler's weeks; then the term, whose
 * teardown checks every address it holds before it deletes anything and
 * removes the surveys this fixture wrote with every row under them; then the
 * scheduler's weeks AGAIN, because a tick that lands while the term is being
 * torn down still finds the run and writes them back. Once the run is gone
 * the job has nothing to write them for, so only then are they counted.
 */
async function teardown(state) {
  const held = state.questionSet;
  if (held && (await questionSetLeft(state)) > 0) {
    if (!held.existed) {
      await surveyQuestionSetDoc().delete();
      log("Took the end of a programme's question set back to the code's, as it was before the run.");
    } else if (state.questionSetBefore) {
      await surveyQuestionSetDoc().set(documentOf(state.questionSetBefore));
      log("Put the end of a programme's question set back as it was before the run.");
    } else {
      log("The end of a programme's question set differs from before the run, and this ledger has lost what it was.");
    }
  }
  await deleteCheckInWeeks(state);
  const counts = await teardownTerm(state);
  await deleteCheckInWeeks(state);
  const mine = { checkInWeeks: await checkInWeeksLeft(state), questionSet: await questionSetLeft(state) };
  return { ...counts, ...mine, total: counts.total + mine.checkInWeeks + mine.questionSet };
}

export const SPEC = {
  name: "course-hub-survey-admin",
  specFile: "tests/e2e/course-hub-survey-admin.spec.mjs",
  steps: SURVEY_ADMIN_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Reports, Make a chart, the Settings tab and the question sets are an
  // admin's. The account is one the harness is given; it can never make one.
  needs: { admin: true },
  /**
   * What a green run drives, as src/app keys. The Surveys page, a survey's
   * Results and Questions tabs, New survey and the survey route are covered by
   * course-hub-before-survey and reached here on the way; they are listed so
   * this spec says what it drove. The three reports Reports leads to are
   * opened only as far as their heads and their way back, which reads none of
   * what each counts, so they are deliberately absent: each waits for a term
   * with the records it reads (tests/e2e-coverage-map.test.mjs).
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/surveys",
      "/api/surveys/[surveyId]/chart",
      "/api/surveys/check-ins/[roundId]/[programmeId]/chart",
      "/api/surveys/question-sets/[kind]",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)/reports",
      "/(app)/admin/(admin-only)/surveys",
      "/(app)/admin/(admin-only)/surveys/new",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/results",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/questions",
      "/(app)/admin/(admin-only)/surveys/[surveyId]/chart",
      "/(app)/admin/(admin-only)/surveys/check-ins/[roundId]/[programmeId]/chart",
      "/(app)/admin/(admin-only)/surveys/question-sets/[kind]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
    ],
  },
  /**
   * VERIFIED on 2026-11-02 against dev b457d82c: against the harness's
   * loopback server on a laptop, all seven steps ran, 57 rows existed before
   * teardown (a form and its question set, 3 applications and 3 decisions, a
   * course and its run with 3 weeks, 2 groups, 3 enrolments, 6 register
   * rows, 1 update, 3 cohort subscriptions, 6 surveys (the before survey,
   * 4 check-ins and the survey at the end the spec made) with 8 people and
   * 7 answers, and 4 accounts with their sign-ins), the end of a programme's
   * question set stood as before the run, and the fixture manifest read zero
   * after it.
   */
  status: "verified",
  seed,
  countRows,
  teardown,
};
