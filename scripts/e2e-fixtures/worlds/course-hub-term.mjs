/**
 * A TERM JUST AFTER DECISION DAY, as fixture records, for the course hub's
 * browser specs.
 *
 * A helper module, not a spec: it exports no `SPEC`, and the spec modules
 * beside `core.mjs` build theirs from it (`course-hub-groups-go-out.mjs` is the
 * first). It lives in a subdirectory because the runner and the coverage map
 * read every `.mjs` beside `core.mjs` as a spec; `tests/funnel-harness-guards.test.mjs`
 * holds a helper to exporting no `SPEC`, to being imported by a spec module,
 * and to the same fence as everything else in the harness.
 *
 * ## What the term is, at its first point ("decisions-sent")
 *
 *  - AN APPLICATION FORM whose decisions have been sent, with one fellowship
 *    programme tied to the fixture's course page. The programme names NO run
 *    yet and has NO lead: naming the run and anybody's authority over it are
 *    the admin's to make on the real pages, never the fixture's.
 *  - THREE PEOPLE the programme accepted, each told (their application carries
 *    the published outcome), each having said they are coming, each having
 *    painted the week they are free: one can make Group A only, one either
 *    group, one Group B only.
 *  - ONE MORE ACCOUNT with no application at all, for the admin to approve and
 *    appoint as a facilitator.
 *  - THE COURSE SIDE: a published course, a DRAFT run of it taking people by
 *    admissions, starting a few days after the seed, and two groups with a
 *    weekly session each. Group A also has a meeting link, so a spec can prove
 *    that no email ever carries one.
 *
 * Every account is the fence's own: role `pending`, made by `createFixtureUser`.
 * The admin approves the ones a journey signs in as, on the Approvals page.
 *
 * ## Later points
 *
 * A spec asks for the term at a point (`TERM_POINTS`). Only the first exists:
 * the later ones a spec will want (placed and published, three weeks in with
 * registers marked, after the last session) are added here by the spec that
 * first needs one, as more records written on top of this one, and their
 * teardown is this teardown, because every row they could add is keyed on the
 * same form and run.
 *
 * ## No term facts
 *
 * Every date is worked out from the moment the seed runs, in London: the run
 * starts `START_AFTER_DAYS` days later and each group meets on a weekday that
 * follows from that start. Nothing names a calendar date. The words a spec
 * checks dates and times against are restated below, from the files named
 * beside each, because this is plain Node and those are TypeScript.
 *
 * ## Mail
 *
 * Seeding writes a suppression row for every account first unless the runner
 * says this run's mail is caught (`suppress: false`). A spec on this term that
 * reads its own mail declares `requiresCaughtMail` and is skipped anywhere
 * else.
 */
import {
  assertFixtureTarget,
  cohortChannel,
  countAccounts,
  createFixtureUser,
  deleteQuery,
  fixtureDoc,
  fixtureId,
  fixtureQuery,
  fixtureSubcollection,
  subscriptionId,
} from "../core.mjs";
import {
  deleteHarnessUser,
  deleteHarnessUserDoc,
  isHarnessAccount,
} from "../../e2e/lib/admin.mjs";

const log = (msg) => console.log(`[term-seed] ${msg}`);

/** The points in the term a spec can ask for, in term order. */
export const TERM_POINTS = Object.freeze(["decisions-sent"]);

/** The form's one programme. Fixed: a programme id is unique on its own form. */
export const PROGRAMME_ID = "e2e-fellowship";

/** The form's one question set and its one question. */
export const QUESTION_SET_ID = "fellowships";
export const QUESTION_ID = "why";

/**
 * A question set's own kind, which is NOT an account's role. Written through a
 * constant so the privilege fence's `role:` pattern never has to be widened
 * for it (see tests/funnel-harness-guards.test.mjs).
 */
const GENERAL_SET = "general";

/** How many days after the seed the run starts: its first session is upcoming. */
export const START_AFTER_DAYS = 3;

/** Taught weeks in the run's plan. */
export const WEEK_COUNT = 6;

/**
 * Every group's session length: a new group's default, `NEW_GROUP_SESSION_MINUTES`
 * in src/lib/courses/sessionLength.ts, restated.
 */
export const SESSION_MINUTES = 90;

/** Places in each group. More than anybody will put in one. */
export const GROUP_CAPACITY = 6;

/**
 * The two groups. Each meets `dayAfterStart` days after the run's first day,
 * so its weekday follows from the start and its first session is in week 1's
 * slot. Group A also has a meeting link: on the site for its own people and
 * its facilitators, never in an email.
 */
export const GROUP_PLAN = Object.freeze([
  Object.freeze({ key: "A", name: "Group A", dayAfterStart: 1, startTimeLocal: "18:00", room: "Room E1", online: true }),
  Object.freeze({ key: "B", name: "Group B", dayAfterStart: 2, startTimeLocal: "13:00", room: "Room E2", online: false }),
]);

/**
 * The people the programme accepted, and which groups the week they painted
 * fits. Their order is the order their accounts are made in.
 */
export const PEOPLE_PLAN = Object.freeze([
  Object.freeze({ key: "ada", first: "Ada", canMake: Object.freeze(["A"]) }),
  Object.freeze({ key: "ben", first: "Ben", canMake: Object.freeze(["A", "B"]) }),
  Object.freeze({ key: "cleo", first: "Cleo", canMake: Object.freeze(["B"]) }),
]);

/** The account with no application, for the admin to appoint as a facilitator. */
export const FACILITATOR_PLAN = Object.freeze({ key: "fern", first: "Fern" });

/**
 * Who a decision document says made each decision. A decision is read only
 * when it names somebody (`asProgrammeDecision` in
 * src/lib/applications/normalise.ts drops one that does not), and the name is
 * a record shown on the review screens, never an authority anything grants.
 * So it names an id no account has, rather than borrowing a real person's.
 */
export const DECISION_RECORD_UID = "e2e-decision-record";

/** The form's availability grid: 09:00 to 21:00 in quarter hours, as the sample term uses. */
export const GRID = Object.freeze({ version: 1, startMinute: 540, endMinute: 1260, slotMinutes: 15 });

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Civil dates and the words a spec checks them against, restated
// ---------------------------------------------------------------------------

/** Civil date key "YYYY-MM-DD" in Europe/London. */
export function londonDateKey(at) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** `addDaysToKey` from src/lib/courses/weekPlan.ts: civil-date arithmetic at UTC midnight. */
export function shiftDateKey(key, days) {
  const at = new Date(`${key}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The weekday of a civil date key, `Date.getDay()` numbering (0 is Sunday). */
export function weekdayOf(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** `currentAcademicYear` from src/lib/firestore/users.ts: "2026/27" from August. */
function academicYearOf(key) {
  const [year, month] = key.split("-").map(Number);
  const start = month >= 8 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "Wed 28 Oct": `formatRunStartShort` in src/lib/courses/window.ts and `londonDayLabel`. */
export function dayLabel(key) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${key}T12:00:00Z`));
}

/** "6pm", "1:30pm": `clockWords` in src/lib/courses/facilitatingEmail.ts. */
export function clockWords(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minute).padStart(2, "0")}${suffix}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wednesdays at 6pm": `weeklySlotWords` in src/lib/courses/facilitatingEmail.ts. */
export function weeklySlotWords(group) {
  return `${WEEKDAYS[group.weekday]}s at ${clockWords(group.startTimeLocal)}`;
}

/** "Wed 6pm": `whenShort` in src/features/applications/times/timesWords.ts. */
export function whenShort(group) {
  return `${WEEKDAYS_SHORT[group.weekday]} ${clockWords(group.startTimeLocal)}`;
}

/** The wall clock `minutes` after "HH:MM": `wallClockAfter` in src/lib/courses/londonLabels.ts. */
function clockAfter(hhmm, minutes) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const total = (hour * 60 + minute + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "Wed 28 Oct, 6pm to 7:30pm": `sessionWhenLabel` in src/lib/courses/londonLabels.ts. */
export function sessionWhenLabel(group, dateKey) {
  const end = clockAfter(group.startTimeLocal, group.durationMinutes);
  return `${dayLabel(dateKey)}, ${clockWords(group.startTimeLocal)} to ${clockWords(end)}`;
}

/** "Wed 28 Oct, 6pm": `firstSessionWhen` in src/lib/courses/allocationPublish.ts. */
export function firstSessionWhen(group) {
  return `${dayLabel(group.firstDateKey)}, ${clockWords(group.startTimeLocal)}`;
}

/** `weekDocId` from src/lib/firestore/courses.ts. */
function weekDocId(weekNumber) {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// A painted week
// ---------------------------------------------------------------------------

/**
 * A painted week on the form's grid, as an application stores it: one string
 * of 12 hex characters a day (48 quarter hours), Sunday first. `windows` is a
 * list of `[weekday, fromMinute, toMinute]`. The handover suites' `week()` in
 * tests/lib/handoverWorld.mjs, restated.
 */
function paintWeek(windows) {
  const days = [];
  const slotsPerDay = (GRID.endMinute - GRID.startMinute) / GRID.slotMinutes;
  for (let day = 0; day < 7; day += 1) {
    const slots = new Array(slotsPerDay).fill(false);
    for (const [weekday, from, to] of windows) {
      if (weekday !== day) continue;
      for (let minute = from; minute < to; minute += GRID.slotMinutes) {
        const slot = (minute - GRID.startMinute) / GRID.slotMinutes;
        if (slot >= 0 && slot < slotsPerDay) slots[slot] = true;
      }
    }
    let hex = "";
    for (let c = 0; c < slotsPerDay / 4; c += 1) {
      let nibble = 0;
      for (let b = 0; b < 4; b += 1) if (slots[c * 4 + b]) nibble |= 8 >> b;
      hex += nibble.toString(16);
    }
    days.push(hex);
  }
  return { ...GRID, days };
}

function minutesOf(hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

/** Free from half an hour before each group's session until half an hour after it. */
function weekFor(canMake, groups) {
  return paintWeek(
    canMake.map((key) => {
      const group = groups.find((g) => g.key === key);
      const start = minutesOf(group.startTimeLocal);
      return [group.weekday, start - 30, start + group.durationMinutes + 30];
    }),
  );
}

// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------

function formDoc({ state, now }) {
  const sentAt = new Date(now.getTime() - 2 * DAY_MS);
  return {
    e2eTermRunId: state.termRunId,
    formVersion: 2,
    kind: "enrolment",
    label: state.formLabel,
    slug: state.formId,
    blurb:
      "A throwaway application form made by a course hub end-to-end run. If you are " +
      "reading this on a live surface, a run stopped before its teardown.",
    academicYear: state.academicYear,
    status: "deciding",
    opensAt: new Date(now.getTime() - 21 * DAY_MS),
    closesAt: new Date(now.getTime() - 7 * DAY_MS),
    decisionsByDate: londonDateKey(sentAt),
    invitationReplyBy: londonDateKey(new Date(now.getTime() + 3 * DAY_MS)),
    stageIds: [],
    programmePreference: {
      enabled: false,
      streams: [],
      fellowships: [],
      maxRankedFellowships: 2,
      offerFellowshipFallback: false,
    },
    availabilityGrid: { ...GRID },
    accessRequirementsPrompt: "",
    criteria: [],
    scoreScale: { min: 1, max: 5 },
    reviewersPerApplication: 1,
    // Nobody reviews or decides on this form, and nobody leads its programme:
    // the fence forbids naming either, and the hand-over and the board are an
    // admin's to drive.
    reviewerUids: [],
    finalDeciderUid: null,
    blind: { hideNames: false, hideMembership: true },
    evidenceRunIds: [],
    reminderOffsets: [],
    outcomeRunIds: [],
    applicationCounts: {
      draft: 0,
      submitted: 0,
      accepted: state.people.length,
      invited: 0,
      "no-offer": 0,
      declined: 0,
      withdrawn: 0,
    },
    archived: false,
    clonedFromRoundId: null,
    authorUid: "",
    programmeIds: [PROGRAMME_ID],
    programmes: {
      [PROGRAMME_ID]: {
        kind: "fellowship",
        name: state.programmeName,
        shortName: state.programmeName,
        pitch: "A programme that exists so an automated run has somebody to place.",
        facts: `${WEEK_COUNT} WEEKS`,
        starts: "",
        places: 8,
        groupCount: state.groups.length,
        groupSize: `Up to ${GROUP_CAPACITY}`,
        leadUid: null,
        reviewerUids: [],
        useScores: false,
        closed: false,
        // Tied to the course page; the run is the admin's to name on the
        // programme's Settings tab.
        courseId: state.courseId,
        runId: null,
        emailWording: {},
      },
    },
    questionSetIds: [QUESTION_SET_ID],
    asksFacilitating: false,
    revealOtherReviews: false,
    noOfferWording: null,
    decisionEmailTest: null,
    decisionsSentAt: sentAt,
    decisionsSentByUid: null,
    createdAt: new Date(now.getTime() - 28 * DAY_MS),
    updatedAt: sentAt,
  };
}

function questionSetDoc({ state, now }) {
  return {
    e2eTermRunId: state.termRunId,
    roundId: state.formId,
    role: GENERAL_SET,
    scope: { type: "kind", kind: "fellowship" },
    label: "Fellowships",
    applicantLine: "",
    intro: "",
    questions: [
      {
        id: QUESTION_ID,
        text: "Why do you want to take part this term?",
        help: "",
        type: "long",
        options: [],
        optionsFromRanking: false,
        wordLimit: 100,
        required: true,
        scored: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function contentFor(person) {
  return {
    aboutYou: {
      preferredName: person.first,
      universityEmail: "",
      universityEmailVerified: false,
      status: "undergraduate",
      statusOther: "",
      subject: "BSc Fixture Studies",
      expectedGraduation: "",
      motivation: "I want to find out which arguments hold up.",
      interests: "",
    },
    rankedProgrammeIds: [PROGRAMME_ID],
    wantsToFacilitate: null,
    answers: { [QUESTION_SET_ID]: { [QUESTION_ID]: "To read and argue with people who disagree with me." } },
    availability: person.week,
    suMembership: "not-yet",
  };
}

/** One sent application, as decision day and a reply of "I'm coming" left it. */
function applicationDoc({ state, person, now }) {
  const appliedAt = new Date(now.getTime() - 14 * DAY_MS);
  const sentAt = new Date(now.getTime() - 2 * DAY_MS);
  const content = contentFor(person);
  return {
    e2eTermRunId: state.termRunId,
    formVersion: 2,
    roundId: state.formId,
    uid: person.uid,
    email: person.email,
    displayName: person.displayName,
    draft: content,
    sent: content,
    sentChangedAt: null,
    sentHistory: [],
    sentHistoryDropped: 0,
    status: "accepted",
    submittedAt: appliedAt,
    sentAt: appliedAt,
    withdrawnAt: null,
    result: {
      kind: "accepted",
      programmeId: PROGRAMME_ID,
      publishedAt: sentAt,
      email: "sent",
      emailedAt: sentAt,
      emailClaimedAt: sentAt,
    },
    invitation: null,
    attendance: { answer: "coming", answeredAt: new Date(now.getTime() - DAY_MS) },
    releaseReason: null,
    createdAt: appliedAt,
    updatedAt: sentAt,
  };
}

/** What the programme decided about one person: accepted, recorded by nobody's account. */
function decisionDoc({ state, person, now }) {
  const decidedAt = new Date(now.getTime() - 3 * DAY_MS);
  return {
    e2eTermRunId: state.termRunId,
    roundId: state.formId,
    uid: person.uid,
    programmes: {
      [PROGRAMME_ID]: {
        decision: "accept",
        poolReason: null,
        couldSuitProgrammeId: null,
        decidedByUid: DECISION_RECORD_UID,
        decidedAt,
      },
    },
    pooledOutcome: null,
    exception: null,
    updatedAt: decidedAt,
  };
}

function courseDoc({ state, now }) {
  return {
    e2eTermRunId: state.termRunId,
    title: state.courseTitle,
    tagline: "Throwaway fixture for a course hub end-to-end run.",
    summaryBlocks: [
      {
        id: "b1",
        type: "richText",
        html: "<p>This course exists only while an automated course hub run is in flight.</p>",
      },
    ],
    track: "governance",
    level: "No prior experience needed",
    estimatedWeeklyHours: 2,
    status: "published",
    showcaseRunId: null,
    authorUid: "",
    collaboratorUids: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The run: a DRAFT that takes people by admissions, as the course editor
 * leaves one. Moving it on from draft is the admin's, on the run editor.
 * `cohort`, `templateId` and `templateLabel` are absent rather than null,
 * as the authoring routes store them. Its application counters start at
 * nothing; the hand-over moves `accepted`.
 */
function runDoc({ state, now }) {
  return {
    e2eTermRunId: state.termRunId,
    courseId: state.courseId,
    courseTitle: state.courseTitle,
    label: state.runLabel,
    academicYear: state.academicYear,
    status: "draft",
    enrolMode: "admissions",
    streams: [],
    enrolledCount: 0,
    startDate: state.startDate,
    // `weekId` must match the week's number: leaving draft is refused while a
    // plan addresses a week two ways.
    weekPlan: Array.from({ length: WEEK_COUNT }, (_, i) => ({
      kind: "week",
      weekNumber: i + 1,
      weekId: weekDocId(i + 1),
    })),
    startHereBlocks: [],
    applicationForm: [],
    applicationsOpenAt: null,
    applicationsCloseAt: null,
    applicationCap: null,
    admissionsReviewerUids: [],
    runFacilitatorUids: [],
    trackLeadUids: [],
    applicationCounts: { pending: 0, accepted: 0, withdrawn: 0 },
    groupCount: state.groups.length,
    channel: state.channel,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** One group: its weekly session, a room, and nobody facilitating it yet. */
function groupDoc({ state, group, now }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    courseId: state.courseId,
    name: group.name,
    facilitatorUids: [],
    facilitatorAppointments: {},
    streamId: null,
    capacity: GROUP_CAPACITY,
    memberCount: 0,
    session: {
      weekday: group.weekday,
      startTimeLocal: group.startTimeLocal,
      durationMinutes: group.durationMinutes,
      location: group.room,
      meetingUrl: group.meetingUrl,
      notes: "",
    },
    sessionOverrides: {},
    sessionModes: {},
    paceStartDate: null,
    paceWeekPlan: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Seeds the term at `point` and returns the state a spec drives it from.
 *
 * Every id is worked out and published (`onState`) BEFORE the first write, so
 * a seed that stops part way leaves a ledger naming everything it could have
 * made, and teardown removes each by the id it was given.
 */
export async function seedTerm({ runId: termRunId, suppress = true, onState, point = TERM_POINTS[0] } = {}) {
  if (!TERM_POINTS.includes(point)) {
    throw new Error(`No term point ${JSON.stringify(point)}. The points are ${TERM_POINTS.join(", ")}.`);
  }
  const target = assertFixtureTarget();
  const now = new Date();
  const todayKey = londonDateKey(now);
  const startDate = shiftDateKey(todayKey, START_AFTER_DAYS);
  const startWeekday = weekdayOf(startDate);
  const runIdValue = fixtureId("e2e-term-run", termRunId);

  const groups = GROUP_PLAN.map((plan) => {
    const firstDateKey = shiftDateKey(startDate, plan.dayAfterStart);
    return {
      key: plan.key,
      id: fixtureId(`e2e-term-group-${plan.key.toLowerCase()}`, termRunId),
      name: plan.name,
      weekday: (startWeekday + plan.dayAfterStart) % 7,
      startTimeLocal: plan.startTimeLocal,
      durationMinutes: SESSION_MINUTES,
      room: plan.room,
      // A reserved domain: nothing answers there.
      meetingUrl: plan.online ? `https://meet.example.com/e2e-${termRunId}` : null,
      firstDateKey,
      lastDateKey: shiftDateKey(firstDateKey, 7 * (WEEK_COUNT - 1)),
    };
  });

  const state = {
    termRunId,
    point,
    projectId: target.projectId,
    createdAt: now.toISOString(),
    /** The runner's answer, recorded so a spec branches on the same fact. */
    suppress,
    formId: fixtureId("e2e-term-form", termRunId),
    formLabel: `E2E term form ${termRunId}`,
    programmeId: PROGRAMME_ID,
    programmeName: `E2E fellowship ${termRunId}`,
    questionSetId: QUESTION_SET_ID,
    courseId: fixtureId("e2e-term-course", termRunId),
    courseTitle: `E2E term course ${termRunId}`,
    runId: runIdValue,
    runLabel: `E2E term ${termRunId}`,
    academicYear: academicYearOf(todayKey),
    startDate,
    weekCount: WEEK_COUNT,
    channel: cohortChannel(runIdValue),
    groups,
    /** Filled below, one per account made, in `PEOPLE_PLAN` order. */
    people: [],
    facilitator: null,
    suppressed: [],
  };

  // Published BEFORE the first write and filled in place from here on.
  onState?.(state);

  log(`Seeding the term (${point}) for run ${termRunId} into ${target.projectId}.`);

  // Accounts first: everything else can be torn down without them, and an
  // account with nothing to belong to is the harmless failure.
  const plans = [...PEOPLE_PLAN, FACILITATOR_PLAN];
  for (const [index, plan] of plans.entries()) {
    const names = { preferred: plan.first, display: `${plan.first} Fixture ${termRunId}` };
    const account = await createFixtureUser({ runId: termRunId, index, suppress, names });
    if (account.suppressionId) state.suppressed.push(account.suppressionId);
    const person = {
      key: plan.key,
      uid: account.uid,
      email: account.email,
      password: account.password,
      first: names.preferred,
      displayName: names.display,
    };
    if (plan === FACILITATOR_PLAN) {
      state.facilitator = person;
    } else {
      state.people.push({ ...person, canMake: [...plan.canMake] });
    }
  }

  await fixtureDoc("courses", state.courseId).set(courseDoc({ state, now }));
  await fixtureDoc("courseRuns", state.runId).set(runDoc({ state, now }));
  for (const group of state.groups) {
    await fixtureDoc("courseGroups", group.id).set(groupDoc({ state, group, now }));
  }

  await fixtureDoc("admissionRounds", state.formId).set(formDoc({ state, now }));
  await fixtureSubcollection("admissionRounds", state.formId, "questionSets")
    .doc(QUESTION_SET_ID)
    .set(questionSetDoc({ state, now }));
  for (const person of state.people) {
    const week = weekFor(person.canMake, state.groups);
    await fixtureDoc("admissionApplications", `${state.formId}__${person.uid}`).set(
      applicationDoc({ state, person: { ...person, week }, now }),
    );
    await fixtureDoc("admissionDecisions", `${state.formId}__${person.uid}`).set(
      decisionDoc({ state, person, now }),
    );
  }

  log(
    `Seeded form ${state.formId} (decisions sent, ${state.people.length} accepted and coming), ` +
      `course ${state.courseId}, draft run ${state.runId} starting ${startDate}, ` +
      `${state.groups.length} groups, and ${plans.length} waiting accounts.`,
  );
  return state;
}

// ---------------------------------------------------------------------------
// Counting: the manifest that must read zero
// ---------------------------------------------------------------------------

/** Every account the term made, the ones the seed never reached left out. */
export function accountsOf(state) {
  return [...(state.people ?? []), state.facilitator].filter(Boolean);
}

/** Every cohort subscription id this term's people could be given, constructed. */
function subscriptionIdsOf(state) {
  return accountsOf(state).map((account) => subscriptionId(account.email, state.channel));
}

/**
 * The send log, keyed two ways and counted once: every row to one of the
 * term's own addresses, and every row about the term's course run whoever it
 * went to. The second key is what finds a test of Publish's emails, which goes
 * to the admin who pressed it, an address this ledger never holds.
 */
async function sendRowsOf(state) {
  const rows = new Map();
  for (const account of accountsOf(state)) {
    const snap = await fixtureQuery("emailSends").where("to", "==", account.email).get();
    for (const doc of snap.docs) rows.set(doc.id, doc.ref);
  }
  const about = await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get();
  for (const doc of about.docs) rows.set(doc.id, doc.ref);
  return rows;
}

/**
 * Every row this term owns, seeded or written by a route a spec drives on it,
 * counted by a key the term controls. Teardown is believed only when this
 * reads zero across the board.
 *
 * The routes and what they write, read off each route and its helpers:
 *  - naming the run (programme run route): the form document itself;
 *  - moving it on from draft (run status route): the run document itself;
 *  - the hand-over: `courseApplications` rows, one `courseAudit` row, the run's counter;
 *  - placing (allocate route): `courseEnrolments`, the groups' counters;
 *  - appointing a facilitator: the group, a facilitator `courseEnrolments` row;
 *  - "Send a test to me": a `courseNudges` record of the test, `emailSends` rows;
 *  - Publish: `courseNudges` (its press lock, one marker per facilitator told),
 *    cohort `subscriptions` and their `subscriptionEvents`, the enrolments'
 *    told stamps, `emailSends` rows;
 *  - a member opening their programme page: possibly a mirrored `tasks` card
 *    (none before the run starts) and nothing in `courseProgress`;
 *  - approving an account: the `users` document, and the approval email's send row.
 */
export async function countTerm(state) {
  const counts = {};
  const { formId, runId } = state;

  for (const [name, collection, id] of [
    ["admissionRounds", "admissionRounds", formId],
    ["courses", "courses", state.courseId],
    ["courseRuns", "courseRuns", runId],
  ]) {
    counts[name] = (await fixtureDoc(collection, id).get()).exists ? 1 : 0;
  }
  counts.questionSets = (await fixtureSubcollection("admissionRounds", formId, "questionSets").get()).size;
  counts.admissionApplications = (
    await fixtureQuery("admissionApplications").where("roundId", "==", formId).get()
  ).size;
  counts.admissionDecisions = (
    await fixtureQuery("admissionDecisions").where("roundId", "==", formId).get()
  ).size;

  // Each collection named where it is asked, so the index guard can read
  // every query: all of them are one equality on `runId`.
  counts.courseGroups = (await fixtureQuery("courseGroups").where("runId", "==", runId).get()).size;
  counts.courseApplications = (
    await fixtureQuery("courseApplications").where("runId", "==", runId).get()
  ).size;
  counts.courseEnrolments = (
    await fixtureQuery("courseEnrolments").where("runId", "==", runId).get()
  ).size;
  counts.courseAudit = (await fixtureQuery("courseAudit").where("runId", "==", runId).get()).size;
  counts.courseNudges = (await fixtureQuery("courseNudges").where("runId", "==", runId).get()).size;
  counts.courseProgress = (await fixtureQuery("courseProgress").where("runId", "==", runId).get()).size;
  counts.weeks = (await fixtureSubcollection("courseRuns", runId, "weeks").get()).size;
  counts.tasks = (await fixtureQuery("tasks").where("sourceRef.cohortId", "==", runId).get()).size;
  counts.subscriptions = (
    await fixtureQuery("subscriptions").where("channel", "==", state.channel).get()
  ).size;
  let events = 0;
  for (const id of subscriptionIdsOf(state)) {
    events += (await fixtureQuery("subscriptionEvents").where("subscriptionId", "==", id).get()).size;
  }
  counts.subscriptionEvents = events;

  let suppressionRows = 0;
  for (const id of state.suppressed ?? []) {
    if ((await fixtureDoc("suppressedEmails", id).get()).exists) suppressionRows += 1;
  }
  counts.suppressedEmails = suppressionRows;
  counts.emailSends = (await sendRowsOf(state)).size;

  const accounts = await countAccounts(accountsOf(state).map((account) => account.uid));
  counts.users = accounts.users;
  counts.authAccounts = accounts.authAccounts;

  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  counts.termRunId = state.termRunId;
  return counts;
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

/**
 * Removes everything, in the order that keeps a half-finished teardown
 * recoverable: the rows the routes wrote first, then the fixture's own
 * records, the send log last of the rows, then the accounts.
 */
export async function teardownTerm(state) {
  assertFixtureTarget();
  log(`Tearing down the term for run ${state.termRunId}.`);
  const failures = [];
  const accounts = accountsOf(state);

  // The namespace check FIRST, before a single delete: several sweeps below
  // are keyed on an address out of this state file, and a tampered or stale
  // ledger naming a real person must be refused before any of them runs.
  for (const account of accounts) {
    if (!isHarnessAccount(account.email)) {
      throw new Error(
        `REFUSING to tear down ${account.email}: not a harness account. The state ` +
          "file names an address this fixture could not have created.",
      );
    }
  }
  const { formId, runId } = state;

  // Rows the routes wrote. Event lines before the subscription rows they describe.
  for (const id of subscriptionIdsOf(state)) {
    await deleteQuery(fixtureQuery("subscriptionEvents").where("subscriptionId", "==", id));
    await fixtureDoc("subscriptions", id).delete();
  }
  await deleteQuery(fixtureQuery("subscriptions").where("channel", "==", state.channel));
  await deleteQuery(fixtureQuery("courseNudges").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseAudit").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseEnrolments").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseApplications").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseProgress").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("tasks").where("sourceRef.cohortId", "==", runId));

  // The fixture's own records.
  await deleteQuery(fixtureQuery("admissionDecisions").where("roundId", "==", formId));
  await deleteQuery(fixtureQuery("admissionApplications").where("roundId", "==", formId));
  const sets = await fixtureSubcollection("admissionRounds", formId, "questionSets").get();
  for (const doc of sets.docs) await doc.ref.delete();
  await fixtureDoc("admissionRounds", formId).delete();
  await deleteQuery(fixtureQuery("courseGroups").where("runId", "==", runId));
  for (const group of state.groups ?? []) await fixtureDoc("courseGroups", group.id).delete();
  const weeks = await fixtureSubcollection("courseRuns", runId, "weeks").get();
  for (const doc of weeks.docs) await doc.ref.delete();
  await fixtureDoc("courseRuns", runId).delete();
  await fixtureDoc("courses", state.courseId).delete();

  for (const id of state.suppressed ?? []) {
    await fixtureDoc("suppressedEmails", id).delete();
  }

  // The send log LAST of the rows: a send is logged a moment after its
  // message leaves, so the later this runs the smaller the window for a row
  // to land behind it.
  for (const ref of (await sendRowsOf(state)).values()) await ref.delete();

  for (const account of accounts) {
    // The users document first: an Auth account whose document outlives it is
    // a ghost row in the admin members list. Both deletes resolve the account
    // BY UID and re-check the namespace on the address Auth returns. An
    // approved account's document says `member` by then, because the
    // Approvals page put it there; the delete never reads the role.
    try {
      await deleteHarnessUserDoc(account.uid);
      await deleteHarnessUser(account.uid);
    } catch (err) {
      failures.push(`${account.uid}: ${err.message}`);
      log(`Could not tear down ${account.uid}: ${err.message}`);
    }
  }

  const counts = await countTerm(state);
  if (failures.length > 0) {
    counts.teardownFailures = failures;
    counts.total += failures.length;
  }
  return counts;
}
