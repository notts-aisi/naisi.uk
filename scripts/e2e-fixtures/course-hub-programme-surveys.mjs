/**
 * The course hub's browser spec for a programme's Surveys tab, as its lead
 * reads it: the Overview, Before, Check-ins, End and Follow-ups, and a
 * survey's results from each.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at "six-months-on": the fellowship six months past its run's last session,
 * Ada, Ben and Dan in Group A and Cleo and Eve in Group B, every register
 * finished. On top of it this fixture writes what the programme's surveys
 * would hold by then, because a browser run cannot wait half a year for them:
 *
 *  - THE BEFORE SURVEY (`BEFORE`), sent the day before the run began and
 *    closed at the end of week 1, reaching all five and answered by four
 *    (Eve did not answer). It asks where each person is now (C1) and how well
 *    they could explain the case (C4) as the questionnaire asks them, what
 *    they want from the programme, and the box for the follow-ups, which
 *    Ada, Ben and Dan ticked.
 *  - THE SURVEY AT THE END (`AFTER`), paired with the before survey, sent in
 *    the run's last week and closed since, reaching all five and answered by
 *    four (Dan did not answer). It asks C1 and C4 again, Q1 to Q3 of how it
 *    went (with the facilitator line) and whether the programme had a
 *    negative effect. Ada, Ben and Cleo answered both.
 *  - THE FOLLOW-UP AT 6 MONTHS (`FOLLOW_UP`), paired with the survey at the
 *    end, sent three days before the seed to the three who ticked the box
 *    and still open: Ada and Dan have answered.
 *  - THE CHECK-INS OF WEEKS 1 TO 3 (`CHECK_INS`), one per group per session,
 *    each reaching the people the register marks there (everybody, in those
 *    weeks): every one of the five answered week 1, three answered week 2 and
 *    two week 3.
 *  - EACH WEEK OF THE CHECK-INS AS THE SCHEDULER FIXED IT (`checkInWeeks`),
 *    the first time it was whole, as the `surveys-check-in-weeks` job writes
 *    it: weeks 1 to 3 with their check-ins, weeks 4 to 6 with none, because
 *    no group opened one. So the lead reads a week with its comments (five
 *    answers), one with its totals and not its comments (three), one with
 *    too few to show (two) and three with none.
 *
 * Nobody leads the programme and nobody facilitates; the programme names no
 * run yet (the admin names it on the Settings tab, as at every course hub
 * spec). Every survey names the term's form, or its run for a check-in, so the
 * world's own teardown finds and removes each with every row under it. The
 * check-in weeks are this fixture's own, counted and removed by their
 * constructed ids.
 *
 * ## No mail
 *
 * Nothing on this journey emails anybody: naming a run sends nothing, and
 * every page under the Surveys tab writes nothing. So the spec runs against
 * a deployed target as well, with every fixture address suppressed there as
 * on every term.
 */
import { randomBytes } from "node:crypto";
import { fixtureDoc } from "./core.mjs";
import {
  CHECK_IN_IDS,
  beforeSurveyName,
  checkInClosesAt,
  checkInItems,
  checkInName,
  checkInSurveyId,
} from "./course-hub-survey-admin.mjs";
import {
  SIX_MONTHS_ON,
  WEEK_COUNT,
  countTerm,
  londonDateKey,
  londonWallClockToInstant,
  seedTerm,
  sessionOf,
  shiftDateKey,
  teardownTerm,
  weekDocId,
} from "./worlds/course-hub-term.mjs";

const log = (msg) => console.log(`[programme-surveys] ${msg}`);

/** The world's point this spec stands on. */
export const POINT = "six-months-on";

// ---------------------------------------------------------------------------
// The questions, restated from src/lib/surveys/templates.ts (their ids are the
// pairing, so they are the questionnaire's own)
// ---------------------------------------------------------------------------

/** C1's points: their ids and numbers are the stage (`STAGE_OPTIONS`). */
const STAGE_OPTIONS = Object.freeze([
  { id: "o_stage0", label: "Haven’t really thought about working on AI safety" },
  { id: "o_stage1", label: "Thought about it, not a serious option" },
  { id: "o_stage2", label: "One of several options I’m seriously considering" },
  { id: "o_stage3", label: "My leading plan, no concrete steps yet" },
  { id: "o_stage4", label: "Taking concrete steps (applying, upskilling, choosing modules or a dissertation)" },
  { id: "o_stage5", label: "Already doing AI safety work, paid or unpaid" },
]);

/** The questions this fixture's surveys ask, by their questionnaire numbers. */
export const QUESTIONS = Object.freeze({
  c1: Object.freeze({ id: "q_c1", title: "Which best describes you right now?" }),
  c4: Object.freeze({
    id: "q_c4",
    title: "How well could you explain why some researchers think advanced AI could be catastrophically dangerous, and the main objections?",
  }),
  p6: Object.freeze({ id: "q_p6", title: "What do you most want to get out of this programme?" }),
  a5: Object.freeze({ id: "q_a5", title: "Did the programme have any negative effect on you or your plans?" }),
  q1: Object.freeze({ id: "q_q1", title: "How likely are you to recommend this programme to a friend with similar interests?" }),
  q2: Object.freeze({ id: "q_q2", title: "How valuable was each part?", minLabel: "Not valuable", maxLabel: "Very valuable" }),
  q3: Object.freeze({ id: "q_q3", title: "Did you get what you wanted from it?" }),
  f1: Object.freeze({ id: "q_f1", title: "What’s your main activity now?" }),
  f7: Object.freeze({ id: "q_f7", title: "Anything else that happened partly because of NAISI?" }),
});

const option = (id, label) => ({ id, label });

function c1() {
  return {
    kind: "question",
    id: QUESTIONS.c1.id,
    type: "singleChoice",
    title: QUESTIONS.c1.title,
    body: [],
    required: false,
    options: STAGE_OPTIONS.map((each) => ({ ...each })),
    look: "points",
    scores: Object.fromEntries(STAGE_OPTIONS.map((each, at) => [each.id, at])),
  };
}

function c4() {
  return {
    kind: "question",
    id: QUESTIONS.c4.id,
    type: "scale",
    title: QUESTIONS.c4.title,
    min: 1,
    max: 7,
    anchors: [
      { at: 1, label: "Not at all" },
      { at: 4, label: "The gist, to a friend" },
      { at: 7, label: "Could hold my own with a researcher" },
    ],
  };
}

function text(question, long) {
  return {
    kind: "question",
    id: question.id,
    type: long ? "longText" : "shortText",
    title: question.title,
    body: [],
    required: false,
    limit: { unit: "characters", max: long ? 2000 : 300 },
  };
}

/** P7, the box for the follow-ups. */
function p7() {
  return {
    kind: "consent",
    id: "c_p7",
    statement: "Anonymised results go to our funders: totals, never your name.",
    boxes: [{ purpose: "followUps", label: "Contact me at 6 and 12 months with a short follow-up survey" }],
  };
}

function q1() {
  return {
    kind: "question",
    id: QUESTIONS.q1.id,
    type: "scale",
    title: QUESTIONS.q1.title,
    min: 0,
    max: 10,
    anchors: [
      { at: 0, label: "Not at all likely" },
      { at: 10, label: "Extremely likely" },
    ],
  };
}

/** The facilitator line's id (`FACILITATOR_LINE_ID`). */
export const FACILITATOR_LINE = "l_facilitator";

function q2() {
  return {
    kind: "question",
    id: QUESTIONS.q2.id,
    type: "lines",
    title: QUESTIONS.q2.title,
    hint: "Leave a part blank if you didn’t have it.",
    lines: [
      { id: "l_sessions", label: "Sessions" },
      { id: "l_readings", label: "Readings" },
      { id: FACILITATOR_LINE, label: "Facilitator" },
      { id: "l_participants", label: "Other participants" },
      { id: "l_speakers", label: "Speakers" },
      { id: "l_socials", label: "Socials" },
      { id: "l_oneones", label: "1:1s" },
    ],
    scale: { max: 5, minLabel: QUESTIONS.q2.minLabel, maxLabel: QUESTIONS.q2.maxLabel },
  };
}

function q3() {
  return {
    kind: "question",
    id: QUESTIONS.q3.id,
    type: "scale",
    title: QUESTIONS.q3.title,
    min: 1,
    max: 5,
    anchors: [
      { at: 1, label: "Not at all" },
      { at: 5, label: "Completely" },
    ],
    pipe: { from: QUESTIONS.p6.id, words: "At the start you said:" },
  };
}

function f1() {
  return {
    kind: "question",
    id: QUESTIONS.f1.id,
    type: "singleChoice",
    title: QUESTIONS.f1.title,
    body: [],
    required: false,
    options: [
      option("o_studying", "Studying"),
      option("o_employed", "Employed"),
      option("o_fellowship", "Fellowship or programme"),
      option("o_independent", "Independent work"),
      option("o_other", "Other"),
    ],
  };
}

// ---------------------------------------------------------------------------
// What each survey reached, and what each person said
// ---------------------------------------------------------------------------

/** The before survey: everybody reached, Eve did not answer, and who ticked the box for the follow-ups. */
export const BEFORE = Object.freeze({
  reached: Object.freeze(["ada", "ben", "cleo", "dan", "eve"]),
  answers: Object.freeze({
    ada: Object.freeze({ c1: "o_stage1", c4: 3, p6: "A clearer sense of the risks" }),
    ben: Object.freeze({ c1: "o_stage2", c4: 4, p6: "People to read papers with" }),
    cleo: Object.freeze({ c1: "o_stage0", c4: 2, p6: "To find out if it is for me" }),
    dan: Object.freeze({ c1: "o_stage3", c4: 5, p6: "A way into research" }),
  }),
  followUps: Object.freeze({ ada: true, ben: true, cleo: false, dan: true }),
});

/** The survey at the end: everybody reached, Dan did not answer. */
export const AFTER = Object.freeze({
  reached: Object.freeze(["ada", "ben", "cleo", "dan", "eve"]),
  answers: Object.freeze({
    ada: Object.freeze({
      c1: "o_stage3",
      c4: 5,
      q1: 9,
      q2: Object.freeze({ l_sessions: 5, l_readings: 4, [FACILITATOR_LINE]: 5 }),
      q3: 4,
      a5: "None at all",
    }),
    ben: Object.freeze({
      c1: "o_stage2",
      c4: 6,
      q1: 7,
      q2: Object.freeze({ l_sessions: 4, l_readings: 3, [FACILITATOR_LINE]: 4 }),
      q3: 3,
      a5: "It took more evenings than I planned",
    }),
    cleo: Object.freeze({
      c1: "o_stage2",
      c4: 4,
      q1: 10,
      q2: Object.freeze({ l_sessions: 5, l_readings: 5, [FACILITATOR_LINE]: 5 }),
      q3: 5,
    }),
    eve: Object.freeze({
      c1: "o_stage1",
      c4: 3,
      q1: 6,
      q2: Object.freeze({ l_sessions: 3, l_readings: 2, [FACILITATOR_LINE]: 4 }),
      q3: 3,
      a5: "A little worried, in a useful way",
    }),
  }),
});

/** The follow-up at 6 months: the three who ticked the box, two of whom have answered. */
export const FOLLOW_UP = Object.freeze({
  reached: Object.freeze(["ada", "ben", "dan"]),
  answers: Object.freeze({
    ada: Object.freeze({ f1: "o_studying", c1: "o_stage4", f7: "I applied to a summer research programme" }),
    dan: Object.freeze({ f1: "o_employed", c1: "o_stage3" }),
  }),
});

/**
 * The check-ins, by group and week: who each reached (everybody the register
 * marks there, which in weeks 1 to 3 is everybody) and what each who answered
 * said. `better` is the optional second written question.
 */
export const CHECK_INS = Object.freeze([
  Object.freeze({
    group: "A",
    weekNumber: 1,
    reached: Object.freeze(["ada", "ben", "dan"]),
    answers: Object.freeze({
      ada: Object.freeze({ useful: 5, confident: 4, most: "Arguing about the reading", unclear: "o_ci_nothing", better: "More time for questions" }),
      ben: Object.freeze({ useful: 4, confident: 3, most: "The worked example", unclear: "o_ci_else" }),
      dan: Object.freeze({ useful: 3, confident: 3, most: "Hearing the other side", unclear: "o_ci_else" }),
    }),
  }),
  Object.freeze({
    group: "B",
    weekNumber: 1,
    reached: Object.freeze(["cleo", "eve"]),
    answers: Object.freeze({
      cleo: Object.freeze({ useful: 4, confident: 2, most: "The short talk at the start", unclear: "o_ci_nothing" }),
      eve: Object.freeze({ useful: 5, confident: 4, most: "Splitting into pairs", unclear: "o_ci_nothing" }),
    }),
  }),
  Object.freeze({
    group: "A",
    weekNumber: 2,
    reached: Object.freeze(["ada", "ben", "dan"]),
    answers: Object.freeze({
      ada: Object.freeze({ useful: 4, confident: 4, most: "The paper on oversight", unclear: "o_ci_nothing" }),
      ben: Object.freeze({ useful: 3, confident: 2, most: "Nothing stood out", unclear: "o_ci_else" }),
    }),
  }),
  Object.freeze({
    group: "B",
    weekNumber: 2,
    reached: Object.freeze(["cleo", "eve"]),
    answers: Object.freeze({
      cleo: Object.freeze({ useful: 5, confident: 3, most: "The group exercise", unclear: "o_ci_nothing" }),
    }),
  }),
  Object.freeze({
    group: "A",
    weekNumber: 3,
    reached: Object.freeze(["ada", "ben", "dan"]),
    answers: Object.freeze({
      ada: Object.freeze({ useful: 4, confident: 4, most: "Going through the objections", unclear: "o_ci_nothing" }),
    }),
  }),
  Object.freeze({
    group: "B",
    weekNumber: 3,
    reached: Object.freeze(["cleo", "eve"]),
    answers: Object.freeze({
      eve: Object.freeze({ useful: 3, confident: 3, most: "The debate", unclear: "o_ci_else" }),
    }),
  }),
]);

/** The weeks the check-ins ran in; every later week was fixed with none. */
export const CHECK_IN_WEEKS = Object.freeze([1, 2, 3]);

/** Every step the spec must complete, in order. */
export const PROGRAMME_SURVEYS_STEPS = [
  "the admin names the run on the programme's Settings tab",
  "the lead opens the Surveys tab from the programme's head, and its Overview counts each view without a name",
  "the Before view lists the before survey, and its link opens its results",
  "the Check-ins view shows each week as its floors allow, every group together, and each group's check-in for an admin",
  "the End view says what changed, how it went, the facilitator line and what people wrote, and its links lead on",
  "the Follow-ups view lists the follow-up at 6 months, and its link opens its results",
  "the Facilitators' reports view says no facilitator has sent one",
];

/** Nothing on this journey is reCAPTCHA-gated: sign-in is a password and no route takes a token. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

// ---------------------------------------------------------------------------
// Restated from the TypeScript
// ---------------------------------------------------------------------------

/** `surveyNameFor(name, stage)` in src/lib/surveys/words.ts. */
export function surveyNameOf(programmeName, stage) {
  if (stage === "before") return beforeSurveyName(programmeName);
  return `${programmeName}: ${stage === "after" ? "after" : "six months on"}`;
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

/** The day of the run's last session: the later of its groups' sixth. */
function lastSessionKeyOf(state) {
  return state.groups.map((group) => sessionOf(group, WEEK_COUNT).dateKey).sort().at(-1);
}

/** Two years after the run's last session, as `namesOffDayFor` dates it. */
function namesOffOnOf(state) {
  const [year, month, day] = lastSessionKeyOf(state).split("-");
  return `${Number(year) + 2}-${month}-${day}`;
}

/** Each stage's survey as the fixture dates it: sent, closing and answered. */
export function surveyDatesOf(state, now = new Date(state.createdAt)) {
  const today = londonDateKey(now);
  const lastKey = lastSessionKeyOf(state);
  return {
    before: {
      sentAt: londonWallClockToInstant(shiftDateKey(state.startDate, -1), "10:00"),
      closesAt: londonWallClockToInstant(shiftDateKey(state.startDate, 6), "23:59"),
      answeredAt: londonWallClockToInstant(state.startDate, "12:00"),
    },
    after: {
      sentAt: londonWallClockToInstant(shiftDateKey(lastKey, -2), "10:00"),
      closesAt: londonWallClockToInstant(shiftDateKey(lastKey, 7), "23:59"),
      answeredAt: londonWallClockToInstant(shiftDateKey(lastKey, 1), "12:00"),
    },
    followUp: {
      sentAt: londonWallClockToInstant(shiftDateKey(today, -3), "10:00"),
      closesAt: londonWallClockToInstant(shiftDateKey(today, 11), "23:59"),
      answeredAt: londonWallClockToInstant(shiftDateKey(today, -2), "12:00"),
    },
  };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** One survey sent once to `reached`, with a row for each person and an answer for each who answered. */
async function seedSurvey(state, { id, record, reached, answered, sentAt, answeredAt, consents = {}, delivery = "sent", afterFirstSession }) {
  const people = new Map(state.people.map((person) => [person.key, person]));
  const press = `e2e-press-${id.slice(0, 12)}`;
  await fixtureDoc("surveys", id).set({
    privacy: "confidential",
    programmeName: state.programmeName,
    programmeKind: "fellowship",
    runId: state.runId,
    strand: null,
    closedAt: null,
    namesOffOn: namesOffOnOf(state),
    namesOffAt: null,
    reached: 0,
    tests: { survey: null, reminder: null },
    testToken: null,
    createdByUid: state.adminUid,
    firstSentAt: sentAt,
    presses: [{ id: press, kind: "first", at: sentAt, count: reached.length, byUid: state.adminUid }],
    createdAt: new Date(sentAt.getTime() - 60 * 60_000),
    updatedAt: sentAt,
    ...record,
  });
  for (const key of reached) {
    const person = people.get(key);
    const said = answered[key] ?? null;
    const consent = key in consents ? { followUps: consents[key] } : {};
    await fixtureDoc("surveyPeople", personRowId(id, person.uid)).set({
      surveyId: id,
      roundId: state.formId,
      respondent: { kind: "account", uid: person.uid },
      token: mintToken(),
      pressId: press,
      sentAt,
      delivery,
      remindedAt: null,
      reminders: 0,
      answered: said !== null,
      consents: consent,
      consentsAt: key in consents ? answeredAt : null,
    });
    if (!said) continue;
    await fixtureDoc("surveyAnswers", answerRowId(id, person.uid)).set({
      surveyId: id,
      roundId: state.formId,
      respondent: { kind: "account", uid: person.uid },
      answers: said,
      sentAt: answeredAt,
      via: "link",
      afterFirstSession,
    });
  }
}

/** A person's answers as stored, from the plan's words for them. */
const stored = {
  choice: (optionId) => ({ type: "choice", optionId }),
  scale: (value) => ({ type: "scale", value }),
  // A check-in's two ratings are a worksheet's rating question, not the questionnaire's scale.
  rating: (value) => ({ type: "rating", value }),
  lines: (values) => ({ type: "lines", values: { ...values } }),
  text: (words) => ({ type: "text", text: words }),
};

function mapAnswers(plan, toStored) {
  return Object.fromEntries(Object.entries(plan).map(([key, said]) => [key, toStored(said)]));
}

async function seedSurveys(state) {
  const ids = state.programmeSurveys;
  const dates = surveyDatesOf(state);
  const programme = { kind: "programme", roundId: state.formId, programmeId: state.programmeId };
  const { c1: C1, c4: C4, p6: P6, a5: A5, q1: Q1, q2: Q2, q3: Q3, f1: F1, f7: F7 } = QUESTIONS;

  await seedSurvey(state, {
    id: ids.before,
    record: {
      kind: "before",
      roundId: state.formId,
      name: surveyNameOf(state.programmeName, "before"),
      title: "Before you start",
      intro: "Week 1 is open. Before you get going, tell us where you’re starting from. It’s 3 questions and takes about 2 minutes.\n\nWe’ll ask the same at the end.",
      items: [c1(), c4(), text(P6, false), p7()],
      minutes: 2,
      audience: programme,
      pairOf: null,
      checkIn: null,
      closesAt: dates.before.closesAt,
    },
    reached: BEFORE.reached,
    answered: mapAnswers(BEFORE.answers, (said) => ({
      [C1.id]: stored.choice(said.c1),
      [C4.id]: stored.scale(said.c4),
      [P6.id]: stored.text(said.p6),
    })),
    consents: BEFORE.followUps,
    sentAt: dates.before.sentAt,
    answeredAt: dates.before.answeredAt,
    afterFirstSession: false,
  });

  await seedSurvey(state, {
    id: ids.after,
    record: {
      kind: "after",
      roundId: state.formId,
      name: surveyNameOf(state.programmeName, "after"),
      title: "At the end",
      intro: "The same questions as week 1, then some about how it went and what’s next. It’s 6 questions and takes about 4 minutes.",
      items: [c1(), c4(), text(A5, true), q1(), q2(), q3()],
      minutes: 4,
      audience: programme,
      pairOf: ids.before,
      checkIn: null,
      closesAt: dates.after.closesAt,
    },
    reached: AFTER.reached,
    answered: mapAnswers(AFTER.answers, (said) => ({
      [C1.id]: stored.choice(said.c1),
      [C4.id]: stored.scale(said.c4),
      [Q1.id]: stored.scale(said.q1),
      [Q2.id]: stored.lines(said.q2),
      [Q3.id]: stored.scale(said.q3),
      ...(said.a5 ? { [A5.id]: stored.text(said.a5) } : {}),
    })),
    sentAt: dates.after.sentAt,
    answeredAt: dates.after.answeredAt,
    afterFirstSession: true,
  });

  await seedSurvey(state, {
    id: ids.followUp,
    record: {
      kind: "followUp6",
      roundId: state.formId,
      name: surveyNameOf(state.programmeName, "followUp6"),
      title: "Six months on",
      intro: "It’s been six months. Tell us what you’re doing now. It’s 3 questions and takes about 2 minutes.",
      items: [f1(), c1(), text(F7, true)],
      minutes: 2,
      audience: { kind: "followUps", roundId: state.formId, programmeId: state.programmeId, consentFrom: ids.before },
      pairOf: ids.after,
      checkIn: null,
      closesAt: dates.followUp.closesAt,
    },
    reached: FOLLOW_UP.reached,
    answered: mapAnswers(FOLLOW_UP.answers, (said) => ({
      [F1.id]: stored.choice(said.f1),
      [C1.id]: stored.choice(said.c1),
      ...(said.f7 ? { [F7.id]: stored.text(said.f7) } : {}),
    })),
    sentAt: dates.followUp.sentAt,
    answeredAt: dates.followUp.answeredAt,
    afterFirstSession: true,
  });

  // The check-ins: one per group per session, as the register's opening writes them.
  for (const plan of CHECK_INS) {
    const group = state.groups.find((each) => each.key === plan.group);
    const session = sessionOf(group, plan.weekNumber);
    const sessionKey = weekDocId(plan.weekNumber);
    const id = checkInSurveyId(state.runId, group.id, sessionKey);
    const openedAt = new Date(session.endsAt.getTime() - 10 * 60_000);
    await seedSurvey(state, {
      id,
      record: {
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
        pairOf: null,
        checkIn: { groupName: group.name, startsAt: session.startsAt, endsAt: session.endsAt },
        closesAt: checkInClosesAt(session),
      },
      reached: plan.reached,
      answered: mapAnswers(plan.answers, (said) => ({
        [CHECK_IN_IDS.useful]: stored.rating(said.useful),
        [CHECK_IN_IDS.most]: stored.text(said.most),
        ...(said.better ? { [CHECK_IN_IDS.better]: stored.text(said.better) } : {}),
        [CHECK_IN_IDS.unclear]: { type: "choices", optionIds: [said.unclear] },
        [CHECK_IN_IDS.confident]: stored.rating(said.confident),
      })),
      sentAt: openedAt,
      answeredAt: new Date(openedAt.getTime() + 5 * 60_000),
      // A check-in is opened at its session, never emailed.
      delivery: null,
      afterFirstSession: true,
    });
  }

  // Each week as the scheduler fixed it, the first tick after its last check-in closed.
  for (let weekNumber = 1; weekNumber <= WEEK_COUNT; weekNumber += 1) {
    const surveyIds = CHECK_INS.filter((plan) => plan.weekNumber === weekNumber).map((plan) =>
      checkInSurveyId(state.runId, state.groups.find((group) => group.key === plan.group).id, weekDocId(weekNumber)),
    );
    const whole = Math.max(...state.groups.map((group) => checkInClosesAt(sessionOf(group, weekNumber)).getTime()));
    await fixtureDoc("checkInWeeks", checkInWeekId(state.runId, weekNumber)).set({
      runId: state.runId,
      weekNumber,
      surveyIds,
      frozenAt: new Date(whole + 15 * 60_000),
    });
  }
}

/**
 * The term six months on, then the survey records on top of it. The ids of
 * every survey are on the ledger before the first of them is written.
 */
async function seed({ runId, suppress, onState }) {
  const state = await seedTerm({ runId, suppress, onState, point: POINT });
  state.programmeSurveys = {
    before: `e2e-before-${runId}`,
    after: `e2e-after-${runId}`,
    followUp: `e2e-followup6-${runId}`,
  };
  // The check-ins reach only whom the registers mark there.
  for (const plan of CHECK_INS) {
    for (const key of plan.reached) {
      const mark = SIX_MONTHS_ON.marks[plan.group]?.[plan.weekNumber]?.[key];
      if (!mark || mark === "absent" || mark === "excused") {
        throw new Error(`The check-in plan reaches ${key} in week ${plan.weekNumber}, whom the register does not mark there.`);
      }
    }
  }
  await seedSurveys(state);
  log(
    `Seeded a before survey, a survey at the end, a follow-up at 6 months and ${CHECK_INS.length} check-ins ` +
      `with ${WEEK_COUNT} fixed weeks on ${state.runId}, on ${londonDateKey(new Date())}.`,
  );
  return state;
}

// ---------------------------------------------------------------------------
// Counting and teardown
// ---------------------------------------------------------------------------

/** The weeks of the run this fixture fixed, or the scheduler could have. */
async function checkInWeeksLeft(state) {
  let n = 0;
  for (let week = 1; week <= WEEK_COUNT; week += 1) {
    if ((await fixtureDoc("checkInWeeks", checkInWeekId(state.runId, week)).get()).exists) n += 1;
  }
  return n;
}

async function countRows(state) {
  const counts = await countTerm(state);
  const checkInWeeks = state.runId ? await checkInWeeksLeft(state) : 0;
  return { ...counts, checkInWeeks, total: counts.total + checkInWeeks };
}

/** The fixed weeks first, by their constructed ids; then the term, which removes every survey with every row under it. */
async function teardown(state) {
  if (state.runId) {
    for (let week = 1; week <= WEEK_COUNT; week += 1) {
      await fixtureDoc("checkInWeeks", checkInWeekId(state.runId, week)).delete();
    }
  }
  const counts = await teardownTerm(state);
  const checkInWeeks = state.runId ? await checkInWeeksLeft(state) : 0;
  return { ...counts, checkInWeeks, total: counts.total + checkInWeeks };
}

export const SPEC = {
  name: "course-hub-programme-surveys",
  specFile: "tests/e2e/course-hub-programme-surveys.spec.mjs",
  steps: PROGRAMME_SURVEYS_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The Settings tab and the Surveys tab are an admin's here: the programme's
  // lead must be SU-recognised committee, which the harness never makes, so
  // the admin reads the tab as its lead. The account is one the harness is
  // given; it can never make one.
  needs: { admin: true },
  /**
   * What a green run drives, as src/app keys. The pages its links lead to
   * that other specs drive (Ratings, the anonymous form's answers, and the
   * admins' own pages for a check-in) are checked by their addresses here and
   * not opened, so they are not listed.
   */
  covers: {
    routes: ["/api/auth/session", "/api/admissions/forms/[roundId]/programmes/[programmeId]/run"],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/before",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/check-ins",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/end",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/follow-ups",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/[surveyId]",
    ],
  },
  /**
   * VERIFIED on 2026-11-02 at 46c0fd75 (on dev's 3992a724): twice against the
   * harness's loopback server on a laptop, all seven steps each time. 118
   * rows existed before teardown (the form and its question set, 5
   * applications and 5 decisions, the course, its run with 6 weeks, 2 groups,
   * 5 enrolments, 5 cohort subscriptions, 12 registers, 1 update, 9 surveys
   * (the before survey, the survey at the end, the follow-up and 6 check-ins)
   * with 28 people and 20 answers, 6 fixed weeks of check-ins, and 5 accounts
   * with their sign-ins), and the manifest read zero after each.
   */
  status: "verified",
  seed,
  countRows,
  teardown,
};
