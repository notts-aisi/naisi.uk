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
 * A spec asks for the term at a point (`TERM_POINTS`). The later ones a spec
 * will want (placed and published, after the last session) are added here by
 * the spec that first needs one, as more records written on top of this one,
 * and their teardown is this teardown, because every row they could add is
 * keyed on the same form, run and groups.
 *
 * ## The second point ("week-three")
 *
 * The same term, read three weeks after its run began: the clock is moved,
 * not the records. Everything decision day wrote is the first point's,
 * written as of the moment the first point describes (`anchor`, three days
 * before the run's first day), and on top of it what the weeks since would
 * have written:
 *
 *  - Publish has told everybody: each person's place in a group, stamped as
 *    told, and each on the run's cohort list, as Publish leaves them. Ada and
 *    Ben are in Group A, Cleo in Group B. The run is running.
 *  - The run's first three weeks are published, and the fourth is not.
 *  - The registers of the first three weeks (`WEEK_THREE.marks`): every one
 *    finished but Group B's week 3, which was saved and not finished, the day
 *    before the seed. Each person's attendance tally is the one the finishing
 *    press works out from them (`recomputeRollup`, restated).
 *  - One update from week 1, to everyone, posted without an email.
 *
 * What stays the admin's, on the real pages, as at the first point: approving
 * accounts, naming the run on the programme's Settings tab (and handing its
 * people over there, which writes the run's own list), and appointing Fern to
 * Group B. A route run now writes now's facts, which is why the places are
 * seeded rather than placed: the board stamps the week a person joins from
 * today, and a person who joined in week 3 has no week 1 or 2 on a register.
 *
 * Nothing a seeded record names as its author is an account: registers name
 * `REGISTER_RECORD_UID` as whoever marked and finished them, and the week 1
 * update `UPDATE_RECORD_UID` as its writer, so the pages name it for the
 * society, as they name an update whose writer's account is gone.
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
  enrolmentId,
  fixtureDoc,
  fixtureId,
  fixtureQuery,
  fixtureSubcollection,
  registerReminderMarkerDoc,
  subscriptionId,
} from "../core.mjs";
import {
  adminAuth,
  deleteHarnessUser,
  deleteHarnessUserDoc,
  isHarnessAccount,
} from "../../e2e/lib/admin.mjs";
import { loadSecrets } from "../../e2e/lib/env.mjs";

const log = (msg) => console.log(`[term-seed] ${msg}`);

/** The points in the term a spec can ask for, in term order. */
export const TERM_POINTS = Object.freeze(["decisions-sent", "week-three"]);

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

/**
 * THE TERM THREE WEEKS IN. Its run began `daysIn` days before the seed, so
 * the seed's day is in week 3 (days 14 to 20 of the plan), both groups'
 * week 3 sessions are over (Group A two days before, Group B the day before)
 * and their week 4 sessions are still to come. 17 rather than 15 or 16 so
 * that a run crossing midnight is still in week 3 with nothing today or
 * tomorrow, and so that Group B's unfinished register is a day old: past the
 * end of its session whatever the hour, and short of the hours the reminder
 * and the task wait by default.
 *
 * `places` are where Publish put each person; `marks` every register, by
 * group and week; `unfinished` the one register saved and not finished;
 * `facilitated` the group the admin appoints Fern to; `published` how many
 * weeks an editor has published.
 */
export const WEEK_THREE = Object.freeze({
  daysIn: 17,
  places: Object.freeze({ ada: "A", ben: "A", cleo: "B" }),
  marks: Object.freeze({
    A: Object.freeze({
      1: Object.freeze({ ada: "present", ben: "present" }),
      2: Object.freeze({ ada: "late", ben: "absent" }),
      3: Object.freeze({ ada: "present", ben: "absent" }),
    }),
    B: Object.freeze({
      1: Object.freeze({ cleo: "present" }),
      2: Object.freeze({ cleo: "left-early" }),
      3: Object.freeze({ cleo: "present" }),
    }),
  }),
  unfinished: Object.freeze({ group: "B", weekNumber: 3 }),
  facilitated: "B",
  published: 3,
});

/** The update the run's first week carries, to everyone, posted without an email. */
export const EARLIER_UPDATE = Object.freeze({
  title: "Welcome to the course",
  message: "The week 1 reading is on this page.\n\nBring one question from it to your first session.",
});

/**
 * Who a seeded register names as marking and finishing it, and who the seeded
 * update names as its writer: ids no account has. Each is a record shown
 * nowhere as an authority, so neither borrows a real person's account.
 */
export const REGISTER_RECORD_UID = "e2e-register-record";
export const UPDATE_RECORD_UID = "e2e-update-record";

/**
 * `courseEnrolments.role` for a person placed in a group. A named constant, not
 * a quoted literal at the use site: the privilege fence refuses a role literal
 * other than the governance role "pending" (see register-push's `LEARNER`).
 */
const LEARNER = "learner";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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

/** `weekDocId` from src/lib/firestore/courses.ts; also the session key of a week's one session. */
export function weekDocId(weekNumber) {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

const WALL_CLOCK_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** An instant's London wall clock, as if it were UTC: `londonWallAsUtcMs` in src/lib/courses/weekPlan.ts. */
function londonWallAsUtcMs(instant) {
  const parts = WALL_CLOCK_PARTS.formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/**
 * The instant London's wall clock reads `hhmm` on `dateKey`, across a clock
 * change: `londonWallClockToInstant` in src/lib/courses/weekPlan.ts, restated
 * (two probes). The second point's sessions straddle the end of summer time.
 */
export function londonWallClockToInstant(dateKey, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  const target = Date.parse(`${dateKey}T00:00:00Z`) + hour * 3_600_000 + minute * 60_000;
  const candidate = target - (londonWallAsUtcMs(new Date(target)) - target);
  const wall = londonWallAsUtcMs(new Date(candidate));
  return wall === target ? new Date(candidate) : new Date(target - (wall - candidate));
}

const LONDON_DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Sun 22 Nov", an instant read in London: `londonDayLabel` in src/lib/courses/londonLabels.ts. */
export function londonDayLabel(at) {
  const parts = LONDON_DAY.formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

const LONDON_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "6pm", "7:58pm": `londonClockLabel` in src/lib/courses/londonLabels.ts. */
export function londonClockLabel(at) {
  const parts = LONDON_CLOCK.formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour >= 12 ? "pm" : "am";
  return minute === "00" ? `${twelve}${suffix}` : `${twelve}:${minute}${suffix}`;
}

/** "Sun 22 Nov at 6pm": `londonDayAndClock` in src/lib/courses/londonLabels.ts. */
export function londonDayAndClock(at) {
  return `${londonDayLabel(at)} at ${londonClockLabel(at)}`;
}

/** "29 Oct", a civil date: `dayMonthLabel` in src/lib/courses/programmeAttendance.ts. */
export function dayMonthLabel(key) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

/** "Thu 12 to Wed 18 Nov", or across a month: `weekSpanLabel` in src/lib/courses/programmeOverview.ts. */
export function weekSpanLabel(startKey) {
  const parts = (key) => {
    const found = LONDON_DAY.formatToParts(new Date(`${key}T12:00:00Z`));
    const get = (type) => found.find((p) => p.type === type)?.value ?? "";
    return { weekday: get("weekday"), day: get("day"), month: get("month") };
  };
  const start = parts(startKey);
  const end = parts(shiftDateKey(startKey, 6));
  return start.month === end.month
    ? `${start.weekday} ${start.day} to ${end.weekday} ${end.day} ${end.month}`
    : `${start.weekday} ${start.day} ${start.month} to ${end.weekday} ${end.day} ${end.month}`;
}

/** "Thursdays 6pm": `slotLine` in src/lib/courses/programmeAttendance.ts. */
export function slotLine(group) {
  return `${WEEKDAYS[group.weekday]}s ${clockWords(group.startTimeLocal)}`;
}

/** "Rahul and Sofia", "A, B and D": `namesInWords` in src/lib/courses/facilitatingEmail.ts. */
export function namesInWords(names) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Groups A and B", "Group B": `groupsInWords` in src/lib/courses/programmeAttendance.ts, for groups named "Group" and a letter. */
export function groupsInWords(names) {
  const tags = [...names].sort().map((name) => /^group\s+(\S{1,3})$/i.exec(name.trim())?.[1]?.toUpperCase() ?? name);
  return `${tags.length === 1 ? "Group" : "Groups"} ${namesInWords(tags)}`;
}

/**
 * The one order every tab of a programme lists its groups in, as People in
 * groups draws its columns: Monday first, then the start time, then the name.
 * `compareGroupsByMeeting` in src/lib/firestore/courseGroups.ts, restated.
 */
export function compareGroupsByMeeting(a, b) {
  const day = ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7);
  return day || a.startTimeLocal.localeCompare(b.startTimeLocal) || a.name.localeCompare(b.name);
}

/** One group's session in one taught week: its civil date and its instants, in London. */
export function sessionOf(group, weekNumber) {
  const dateKey = shiftDateKey(group.firstDateKey, 7 * (weekNumber - 1));
  const startsAt = londonWallClockToInstant(dateKey, group.startTimeLocal);
  return { weekNumber, dateKey, startsAt, endsAt: new Date(startsAt.getTime() + group.durationMinutes * 60_000) };
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
// The second point's records: what the weeks after decision day wrote
// ---------------------------------------------------------------------------

/** One taught week, as an editor publishes it (the shape register-push seeds). */
function publishedWeekDoc({ state, weekNumber, at }) {
  return {
    e2eTermRunId: state.termRunId,
    weekNumber,
    title: `E2E week ${weekNumber} reading`,
    summary: "Seeded so a term three weeks in has the weeks an editor would have published.",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    estimatedMinutes: null,
    published: true,
    updatedAt: at,
    updatedByUid: null,
  };
}

/**
 * Each person's register marks in their group's weeks, oldest first, as the
 * finishing press reads them: `{ weekNumber, held, finished, status }`.
 */
function registerFactsFor(state, person) {
  const marks = WEEK_THREE.marks[person.groupKey] ?? {};
  return Object.keys(marks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((weekNumber) => ({
      sessionKey: weekDocId(weekNumber),
      weekNumber,
      held: true,
      finished: !(WEEK_THREE.unfinished.group === person.groupKey && WEEK_THREE.unfinished.weekNumber === weekNumber),
      status: marks[weekNumber][person.key] ?? null,
    }));
}

/**
 * A person's attendance tally from their group's finished registers:
 * `recomputeRollup` in src/lib/courses/attendanceRollup.ts, restated. Only a
 * finished, held register from the week they joined counts; an unmarked
 * person on one counts as absent.
 */
function rollupFor(state, person, at) {
  const rollup = {
    sessionsHeld: 0,
    attendedInFull: 0,
    late: 0,
    leftEarly: 0,
    absent: 0,
    excused: 0,
    lastPushedSessionKey: null,
    lastComputedAt: at,
  };
  for (const fact of registerFactsFor(state, person)) {
    if (!fact.finished || !fact.held) continue;
    rollup.sessionsHeld += 1;
    if (fact.status === "present") rollup.attendedInFull += 1;
    else if (fact.status === "late") rollup.late += 1;
    else if (fact.status === "left-early") rollup.leftEarly += 1;
    else if (fact.status === "excused") rollup.excused += 1;
    else rollup.absent += 1;
    rollup.lastPushedSessionKey = fact.sessionKey;
  }
  return rollup;
}

/**
 * One person's place, as the board created it, Publish stamped it told and
 * the finishing presses left its tally: the fields of the allocate route, the
 * two Publish adds, and the tally.
 */
function placementDoc({ state, person, group, at }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    courseId: state.courseId,
    uid: person.uid,
    groupId: group.id,
    status: "active",
    role: LEARNER,
    applicationId: `${state.runId}__${person.uid}`,
    // Week 1: they were placed before the run began.
    joinedWeekNumber: 1,
    allocatedEmailAt: at.published,
    allocatedEmailDelivery: "sent",
    attendance: rollupFor(state, person, at.lastFinished),
    createdAt: at.placed,
    updatedAt: at.lastFinished,
  };
}

/** The cohort list's row for one person, as Publish's `subscribe()` writes it. */
function cohortRowDoc({ state, person, at }) {
  return {
    e2eTermRunId: state.termRunId,
    email: person.email.toLowerCase(),
    channel: state.channel,
    audience: "user",
    audienceId: person.uid,
    confirmed: true,
    confirmedAt: at.published,
    subscribed: true,
    subscribedAt: at.published,
    source: "course-allocation",
    name: person.first,
    createdAt: at.published,
  };
}

/**
 * One register, as the marking route saves it and, once finished, the
 * finishing press stamps it. Marked and finished by nobody's account
 * (`REGISTER_RECORD_UID`).
 */
function registerDoc({ state, group, weekNumber, marks, finished }) {
  const session = sessionOf(group, weekNumber);
  const records = {};
  for (const person of state.people) {
    if (marks[person.key]) records[person.uid] = marks[person.key];
  }
  const finishedAt = new Date(session.endsAt.getTime() + 30 * 60_000);
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    groupId: group.id,
    weekNumber,
    occurrence: 1,
    sessionKey: weekDocId(weekNumber),
    records,
    held: true,
    sessionAt: session.startsAt,
    pushedAt: finished ? finishedAt : null,
    pushedByUid: finished ? REGISTER_RECORD_UID : "",
    notes: "",
    participantNotes: {},
    markedByUid: REGISTER_RECORD_UID,
    updatedAt: finished ? finishedAt : session.endsAt,
  };
}

/** The update from week 1: to everyone, posted without an email, by nobody's account. */
function earlierUpdateDoc({ state, postedAt }) {
  return {
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    to: "everyone",
    groupId: null,
    title: EARLIER_UPDATE.title,
    message: EARLIER_UPDATE.message,
    authorUid: UPDATE_RECORD_UID,
    postedAt,
    email: null,
  };
}

/**
 * The uid behind the admin address the harness is given. READ ONLY, and kept
 * in the ledger's private half (`adminUid` is a private key): the updates
 * route's send counters are keyed on the presser's uid and carry nothing else
 * a teardown could find them by. Nothing here writes to the account.
 */
async function adminUidFromSecrets() {
  const { adminEmail } = loadSecrets();
  if (!adminEmail) {
    throw new Error(
      "The course hub term three weeks in needs the admin account the harness is given: " +
        "E2E_ADMIN_EMAIL is not set. This harness cannot create an admin, by design.",
    );
  }
  return (await adminAuth().getUserByEmail(adminEmail)).uid;
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
  const weekThree = point === "week-three";
  // The moment decision day's records describe: the seed itself at the first
  // point, and at the second the same moment of a term whose run began
  // `WEEK_THREE.daysIn` days ago, so every record of the first point is
  // written as it was then.
  const anchor = weekThree ? new Date(now.getTime() - (WEEK_THREE.daysIn + START_AFTER_DAYS) * DAY_MS) : now;
  const startDate = weekThree ? shiftDateKey(todayKey, -WEEK_THREE.daysIn) : shiftDateKey(todayKey, START_AFTER_DAYS);
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
    academicYear: academicYearOf(weekThree ? startDate : todayKey),
    startDate,
    weekCount: WEEK_COUNT,
    channel: cohortChannel(runIdValue),
    groups,
    /** Filled below, one per account made, in `PEOPLE_PLAN` order. */
    people: [],
    facilitator: null,
    suppressed: [],
    ...(weekThree
      ? {
          /** The second point's own facts, as instants and ids. */
          weekThree: {
            publishedAt: londonWallClockToInstant(shiftDateKey(startDate, -2), "10:00").toISOString(),
            earlierUpdateId: fixtureId("e2e-term-update", termRunId),
            earlierUpdatePostedAt: londonWallClockToInstant(startDate, "09:00").toISOString(),
          },
          /** The admin's uid: a private key, kept out of the ledger. Resolved below. */
          adminUid: null,
        }
      : {}),
  };

  // Published BEFORE the first write and filled in place from here on.
  onState?.(state);
  if (weekThree) state.adminUid = await adminUidFromSecrets();

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
      state.people.push({
        ...person,
        canMake: [...plan.canMake],
        ...(weekThree ? { groupKey: WEEK_THREE.places[plan.key] } : {}),
      });
    }
  }

  // Decision day's records, as of `anchor`: the seed's own moment at the
  // first point, so its records are what they always were.
  const at = weekThree ? weekThreeInstants(state) : null;
  await fixtureDoc("courses", state.courseId).set(courseDoc({ state, now: anchor }));
  const run = runDoc({ state, now: anchor });
  await fixtureDoc("courseRuns", state.runId).set(
    weekThree
      ? // Moved on from draft before the start, and published: its people were told their groups.
        { ...run, status: "running", allocationPublishedAt: at.published, updatedAt: at.published }
      : run,
  );
  for (const group of state.groups) {
    const record = groupDoc({ state, group, now: anchor });
    await fixtureDoc("courseGroups", group.id).set(
      weekThree
        ? { ...record, memberCount: state.people.filter((person) => person.groupKey === group.key).length }
        : record,
    );
  }

  await fixtureDoc("admissionRounds", state.formId).set(formDoc({ state, now: anchor }));
  await fixtureSubcollection("admissionRounds", state.formId, "questionSets")
    .doc(QUESTION_SET_ID)
    .set(questionSetDoc({ state, now: anchor }));
  for (const person of state.people) {
    const week = weekFor(person.canMake, state.groups);
    await fixtureDoc("admissionApplications", `${state.formId}__${person.uid}`).set(
      applicationDoc({ state, person: { ...person, week }, now: anchor }),
    );
    await fixtureDoc("admissionDecisions", `${state.formId}__${person.uid}`).set(
      decisionDoc({ state, person, now: anchor }),
    );
  }

  if (weekThree) await seedWeekThree(state, at);

  log(
    `Seeded form ${state.formId} (decisions sent, ${state.people.length} accepted and coming), ` +
      `course ${state.courseId}, ${weekThree ? "running" : "draft"} run ${state.runId} starting ${startDate}, ` +
      `${state.groups.length} groups, and ${plans.length} waiting accounts` +
      (weekThree ? `; three weeks in: places told, ${WEEK_THREE.published} weeks published, registers, one update.` : "."),
  );
  return state;
}

/** The instants the second point's records are dated by, from the seed's clock. */
function weekThreeInstants(state) {
  const published = new Date(state.weekThree.publishedAt);
  const finished = [];
  for (const group of state.groups) {
    for (const week of Object.keys(WEEK_THREE.marks[group.key] ?? {})) {
      const weekNumber = Number(week);
      if (WEEK_THREE.unfinished.group === group.key && WEEK_THREE.unfinished.weekNumber === weekNumber) continue;
      finished.push(sessionOf(group, weekNumber).endsAt.getTime() + 30 * 60_000);
    }
  }
  return {
    published,
    // The board placed them an hour before Publish told them.
    placed: new Date(published.getTime() - HOUR_MS),
    // An editor published the weeks the day before.
    weeksPublished: new Date(published.getTime() - DAY_MS),
    // The latest finishing press, which last worked out everybody's tally.
    lastFinished: new Date(Math.max(...finished)),
    earlierUpdate: new Date(state.weekThree.earlierUpdatePostedAt),
  };
}

/**
 * What the weeks after decision day wrote, on top of decision day's records:
 * the published weeks, each person's told place and cohort row, every
 * register, and the update from week 1. See the module header.
 */
async function seedWeekThree(state, at) {
  for (let weekNumber = 1; weekNumber <= WEEK_THREE.published; weekNumber += 1) {
    await fixtureSubcollection("courseRuns", state.runId, "weeks")
      .doc(weekDocId(weekNumber))
      .set(publishedWeekDoc({ state, weekNumber, at: at.weeksPublished }));
  }
  for (const person of state.people) {
    const group = state.groups.find((each) => each.key === person.groupKey);
    await fixtureDoc("courseEnrolments", enrolmentId(state.runId, person.uid)).set(
      placementDoc({ state, person, group, at }),
    );
    await fixtureDoc("subscriptions", subscriptionId(person.email, state.channel)).set(
      cohortRowDoc({ state, person, at }),
    );
  }
  for (const group of state.groups) {
    for (const [week, marks] of Object.entries(WEEK_THREE.marks[group.key] ?? {})) {
      const weekNumber = Number(week);
      const finished = !(WEEK_THREE.unfinished.group === group.key && WEEK_THREE.unfinished.weekNumber === weekNumber);
      // `attendanceDocId` in src/lib/firestore/courseAttendance.ts, restated.
      await fixtureDoc("courseAttendance", `${state.runId}__${group.id}__${weekDocId(weekNumber)}`).set(
        registerDoc({ state, group, weekNumber, marks, finished }),
      );
    }
  }
  await fixtureDoc("courseUpdates", state.weekThree.earlierUpdateId).set(
    earlierUpdateDoc({ state, postedAt: at.earlierUpdate }),
  );
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
 * The send log, keyed three ways and counted once: every row to one of the
 * term's own addresses, every row about the term's course run, and every row
 * about one of its groups, whoever they went to. The second and third keys
 * are what find a test, which goes to the admin who pressed it, an address
 * this ledger never holds: Publish's test is about the run, and the test of
 * an update to one group is about that group.
 */
async function sendRowsOf(state) {
  const rows = new Map();
  for (const account of accountsOf(state)) {
    const snap = await fixtureQuery("emailSends").where("to", "==", account.email).get();
    for (const doc of snap.docs) rows.set(doc.id, doc.ref);
  }
  const about = await fixtureQuery("emailSends").where("referenceId", "==", state.runId).get();
  for (const doc of about.docs) rows.set(doc.id, doc.ref);
  for (const group of state.groups ?? []) {
    const aboutGroup = await fixtureQuery("emailSends").where("referenceId", "==", group.id).get();
    for (const doc of aboutGroup.docs) rows.set(doc.id, doc.ref);
  }
  return rows;
}

/**
 * The updates route's send counters on this term's run, by the ids that route
 * builds (`reserveSendSlot` and `reserveNoticeSlots` keep them in
 * `courseNudges` as `emailrate__<key>`, with no run on the row to query by):
 * each audience's daily counter, and, while the ledger holds the admin's uid,
 * the presser's own hourly ones, the test's and the post's.
 */
function sendCounterIdsOf(state) {
  const audiences = [
    ...(state.groups ?? []).map((group) => `group__${group.id}`),
    `everyone__${state.runId}`,
    `facilitators__${state.runId}`,
  ];
  const ids = audiences.map((key) => `emailrate__updateday__${key}`);
  if (state.adminUid) {
    ids.push(`emailrate__updatetest__${state.runId}__${state.adminUid}`);
    ids.push(`emailrate__updatepost__${state.runId}__${state.adminUid}`);
    for (const key of audiences) ids.push(`emailrate__update__${key}__${state.adminUid}`);
  }
  return ids;
}

/**
 * The register reminder's markers the term's facilitator could hold: one per
 * group and taught week, each addressed through its one door. A lead's Remind
 * claims one before it emails and keeps it; nothing else here writes one.
 */
function reminderMarkersOf(state) {
  if (!state.facilitator) return [];
  const refs = [];
  for (const group of state.groups ?? []) {
    for (let weekNumber = 1; weekNumber <= (state.weekCount ?? WEEK_COUNT); weekNumber += 1) {
      refs.push(
        registerReminderMarkerDoc({ groupId: group.id, sessionKey: weekDocId(weekNumber), uid: state.facilitator.uid }),
      );
    }
  }
  return refs;
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
 *
 * And at the second point, on top of its seeded registers, places, cohort rows,
 * weeks and update:
 *  - the Overview and the Attendance tab: they only read;
 *  - Remind: the reminder's marker in `schedulerMarkers` (`reminderMarkersOf`)
 *    and its send row to the facilitator;
 *  - Download CSV: one `dataExports` row, its scope the run;
 *  - an update, and its test: a `courseUpdates` row, the send rows (about the
 *    group, for an update to one group), and the route's send counters
 *    (`sendCounterIdsOf`).
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
  counts.courseAttendance = (await fixtureQuery("courseAttendance").where("runId", "==", runId).get()).size;
  counts.courseUpdates = (await fixtureQuery("courseUpdates").where("runId", "==", runId).get()).size;
  counts.dataExports = (await fixtureQuery("dataExports").where("scope.runId", "==", runId).get()).size;
  let counters = 0;
  for (const id of sendCounterIdsOf(state)) {
    if ((await fixtureDoc("courseNudges", id).get()).exists) counters += 1;
  }
  counts.sendCounters = counters;
  let markers = 0;
  for (const ref of reminderMarkersOf(state)) {
    if ((await ref.get()).exists) markers += 1;
  }
  counts.reminderMarkers = markers;

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
  // The second point's: registers and updates (seeded and posted alike), the
  // download log's row, the updates route's counters, Remind's markers.
  await deleteQuery(fixtureQuery("courseAttendance").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("courseUpdates").where("runId", "==", runId));
  await deleteQuery(fixtureQuery("dataExports").where("scope.runId", "==", runId));
  for (const id of sendCounterIdsOf(state)) await fixtureDoc("courseNudges", id).delete();
  for (const ref of reminderMarkersOf(state)) await ref.delete();

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
