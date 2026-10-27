/**
 * STAGE ONE OF THE COURSE HUB: one term, from decision day to the week its
 * groups first meet, through every part built for it at once.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Stage one was built as six pieces, each with suites of its own run against
 * sample documents shaped the way that piece expects: the hand-over onto a
 * course run, the incubator's "It helps us plan.", the times picture on a
 * programme's Groups tab, a placement shown only once Publish has told its
 * owner, offering a freed place after decision day, and Publish with a test
 * first, its count and the facilitators' email. What none of them can see is
 * the seam between two of them: a count one screen takes from the form and
 * another from the run, a stamp one writes and another reads, an email that
 * promises what a page does not show.
 *
 * So this file runs ONE term through the real route handlers of all of them,
 * in the order the runbook (`docs/courses-ops.md`) gives, against one
 * database, and at each step asserts what the next piece will read:
 *
 *  1. Decision day, as `tests/applications-journey.test.mjs` tells it, made
 *     smaller: a form made from nothing, people apply, leads decide, an admin
 *     picks, tests the emails and sends. Two people are told "No offer this
 *     time", and two hold an incubator's places.
 *  2. The run is named on its programme while it is a draft, and moved on.
 *  3. The hand-over puts exactly the people who hold a place on its list.
 *  4. The times picture counts, for each group, the same people the board's
 *     cards say can make it.
 *  5. People are put in groups on the board. Nobody is told, so nobody and no
 *     facilitator sees a name.
 *  6. "Send a test to me", then Publish with the board's count. What each
 *     person placed and each facilitator reads, before and after. Then the
 *     incubator's run, which the plan for this term gives one group and
 *     publishes the same way, and what its people are told.
 *  7. A place given back after Publish, and the runbook's two steps after it.
 *  8. The freed place offered to a pooled applicant, accepted, handed over,
 *     placed and published, emailing that person and nobody else.
 *  9. The incubator's people read "It helps us plan.", and the fellowship's
 *     "It helps us plan groups.", on their own page and in their email.
 *
 * ## Why a suite of its own
 *
 * The application system's journey settles its term (chapter 7) before it
 * hands anybody over (chapter 8). A settled form offers no freed place, and
 * the runbook settles a term only once week 1 has ended, after everything
 * here. That term also has nobody holding an incubator's place. So stage one
 * is told here, in the runbook's order, on a term made for it.
 *
 * ## How it is laid out
 *
 * As in the application system's journey: `tellTheStory()` makes every
 * request once, in order, and writes down what came back (`seen`); the tests
 * read what was written down. A request that goes wrong is recorded like any
 * other and the story carries on, so one disagreement between two pieces is
 * one failing test and does not hide the ones after it.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route handler named below, the libraries behind them, the
 * access predicates, the rate limiter, the email templates and the pages'
 * loaders. Stubbed: `server-only`, `next/server`, `next/link`,
 * `next/navigation`, two stylesheets, the Admin SDK's sentinels and handle,
 * the session, the view-as guard, the two push mirrors, and `sendEmail`,
 * which writes down what it was handed. No message can leave this process.
 * The clock is the runner's, set by the story.
 *
 * The application system's code runs on `tests/lib/applicationsStore.mjs`,
 * and the course routes, which page their reads with a limit, on
 * `courseView` of the same documents (`tests/lib/courseRunStore.mjs`).
 */
import { isDeepStrictEqual } from "node:util";
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { courseView } from "./lib/courseRunStore.mjs";

// ---------------------------------------------------------------------------
// The world: one database, one mail door, one clock
// ---------------------------------------------------------------------------

/** The site's own address: the emails' buttons lead to pages on it. */
const APP_URL = "https://naisi.invalid";
process.env.NEXT_PUBLIC_APP_URL = APP_URL;
for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "EMAIL_AUDIENCE"]) {
  delete process.env[name];
}

const world = {
  db: null,
  courseDb: null,
  /** True for the length of one request to a course route. */
  course: false,
  user: null,
  /** Every message handed to the one mail door, in order. */
  mail: [],
  /** Every notification handed to either push mirror. */
  pushes: [],
};
globalThis.__stageOne = { world, h: createElement };
const W = "globalThis.__stageOne.world";

/** A stand-in for every stylesheet a rendered page imports. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) {\n" +
        "    this.body = body;\n" +
        "    this.status = (init && init.status) || 200;\n" +
        "    this.headers = (init && init.headers) || {};\n" +
        "  }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "  async json() { return this.body; }\n" +
        "}",
    ],
    [
      "firebase-admin/firestore",
      FIELD_VALUE_STUB.replace(
        "export class Timestamp {}",
        "export class Timestamp {" +
          " static now() { return new Date(); }" +
          " static fromDate(date) { return date; }" +
          " static fromMillis(ms) { return new Date(ms); }" +
          " }",
      ) + " export class FieldPath { constructor(...parts) { this.parts = parts; } }",
    ],
    ["@/lib/firebase/admin", `export function getAdminDb() { return ${W}.course ? ${W}.courseDb : ${W}.db; }`],
    ["@/lib/firebase/session", `export async function getCurrentUser() { return ${W}.user; }`],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() { return null; }\n" +
        "export async function getImpersonator() { return null; }\n" +
        "export function markerIsLive(marker, currentUid) { return marker !== null && marker.actorUid !== currentUid; }",
    ],
    [
      "@/lib/email/send",
      "export async function sendEmail(args) {\n" +
        `  ${W}.mail.push(args);\n` +
        "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
        "}",
    ],
    [
      "./send",
      "export async function sendEmail(args) {\n" +
        `  ${W}.mail.push(args);\n` +
        "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
        "}",
    ],
    [
      "@/lib/push/courseNotifications",
      `export async function mirrorCourseDecisionToPush(uid, note) { ${W}.pushes.push({ uid, ...note }); }`,
    ],
    [
      "@/lib/push/noticeNotifications",
      `export async function sendNoticePush(uid, note) { ${W}.pushes.push({ uid, ...note }); return false; }`,
    ],
    // The person's own page, rendered to HTML as they would read it.
    [
      "next/link",
      "export default ({ href, className, children }) => globalThis.__stageOne.h('a', { href, className }, children);",
    ],
    ["next/navigation", "export const useRouter = () => ({ refresh() {}, push() {}, replace() {} });"],
    ["@/features/applications/kit/kit.module.css", CLASS_NAMES],
    ["./status.module.css", CLASS_NAMES],
  ]),
});

const formRoute = (...parts) => loadTs(join("app", "api", "admissions", "forms", ...parts, "route.ts"));
const courseRoute = (...parts) => loadTs(join("app", "api", "courses", ...parts, "route.ts"));
const R = "[roundId]";
const PG = "[programmeId]";

const routes = {
  forms: await formRoute(),
  form: await formRoute(R),
  sets: await formRoute(R, "sets"),
  set: await formRoute(R, "sets", "[setId]"),
  programme: await formRoute(R, "programmes", PG),
  roles: await formRoute(R, "programmes", PG, "roles"),
  status: await formRoute(R, "status"),
  application: await formRoute(R, "application"),
  applicationSend: await formRoute(R, "application", "send"),
  reply: await formRoute(R, "application", "reply"),
  list: await formRoute(R, "programmes", PG, "applications"),
  review: await formRoute(R, "applications", "[uid]"),
  decision: await formRoute(R, "applications", "[uid]", "decision"),
  pool: await formRoute(R, "pool"),
  send: await formRoute(R, "send"),
  sendTest: await formRoute(R, "send", "test"),
  run: await formRoute(R, "programmes", PG, "run"),
  handOver: await formRoute(R, "programmes", PG, "run", "hand-over"),
  freedPlaces: await formRoute(R, "programmes", PG, "freed-places"),
  freedPlacesTest: await formRoute(R, "programmes", PG, "freed-places", "test"),
};
const courseRoutes = {
  runRoles: await courseRoute("runs", "[runId]", "roles"),
  runStatus: await courseRoute("runs", "[runId]", "status"),
  facilitators: await courseRoute("groups", "[groupId]", "facilitators"),
  board: await courseRoute("runs", "[runId]", "allocation"),
  allocate: await courseRoute("runs", "[runId]", "allocate"),
  publishTest: await courseRoute("runs", "[runId]", "allocation", "publish", "test"),
  publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
  remove: await courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove"),
  decide: await courseRoute("runs", "[runId]", "applications", "[uid]", "decide"),
  me: await courseRoute("me"),
  roster: await courseRoute("groups", "[groupId]", "roster"),
  register: await courseRoute("groups", "[groupId]", "attendance"),
};
/** What the pages read before they draw. */
const pages = {
  times: await loadTs(join("lib", "applications", "handover", "timesLoad.ts")),
  freedPlaces: await loadTs(join("lib", "applications", "freedPlaces", "load.ts")),
  status: await loadTs(join("lib", "applications", "status", "load.ts")),
  runAccess: await loadTs(join("features", "courses", "runAccess.ts")),
};
const { default: StatusPage } = await loadTs(join("features", "applications", "status", "StatusPage.tsx"));

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * The days of the term, in London. The clocks go back on Sun 25 Oct, so a
 * London 9am is 08:00 before it and 09:00 after.
 */
const WHEN = {
  building: "2026-10-05T09:00:00Z",
  applying: "2026-10-10T10:00:00Z",
  deciding: "2026-10-20T10:00:00Z",
  /** Fri 23 Oct, 9am. */
  decisionDay: "2026-10-23T08:00:00Z",
  replying: "2026-10-23T15:00:00Z",
  /** Sat 24 Oct: the run is named while a draft, and moved on. */
  naming: "2026-10-24T10:00:00Z",
  /** Mon 26 Oct. */
  handingOver: "2026-10-26T10:00:00Z",
  placing: "2026-10-26T14:00:00Z",
  /** Tue 27 Oct, 5:38pm: the test, then Publish. */
  publishing: "2026-10-27T17:38:00Z",
  /** Wed 28 Oct. */
  givingBack: "2026-10-28T09:00:00Z",
  tidying: "2026-10-28T10:00:00Z",
  offering: "2026-10-28T11:00:00Z",
  /** Thu 29 Oct: the run's first day. */
  accepting: "2026-10-29T09:00:00Z",
  placingAgain: "2026-10-29T12:00:00Z",
};
const at = (when) => mock.timers.setTime(new Date(WHEN[when]).getTime());
/** Later the same day: far enough on that the per-account request allowances have turned over. */
const later = (minutes = 11) => mock.timers.setTime(Date.now() + minutes * 60_000);

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

const PERMISSIONS = {
  draftNewsletter: false,
  approveNewsletter: false,
  draftEvent: false,
  approveEvent: false,
  draftCourse: false,
  approveCourse: false,
  manageMembership: false,
  circulateWorksheet: false,
};

/** [uid, name, role, SU-recognised]. Everybody's address is on a reserved domain. */
const CAST = [
  ["zach", "Zach Levin", "admin", false],
  // AGI Strategy's lead, and the incubator's.
  ["claudia", "Claudia Reyes", "committee", true],
  ["tess", "Tess Okoro", "committee", true],
  // The run's track lead, named on nothing on the form.
  ["yusuf", "Yusuf Demir", "committee", true],
  // Facilitators: Group A's, and Group B's two.
  ["amelia", "Amelia Hart", "member", false],
  ["rahul", "Rahul Mehta", "member", false],
  ["sofia", "Sofia Rossi", "member", false],
  // AGI Strategy's six places.
  ["amara", "Amara Okafor", "member", false],
  ["dev", "Dev Patel", "member", false],
  ["ella", "Ella Robinson", "member", false],
  ["joel", "Joel Adeyemi", "member", false],
  ["kofi", "Kofi Mensah", "member", false],
  ["priya", "Priya Nair", "member", false],
  // Pooled by AGI Strategy and told "No offer this time".
  ["hannah", "Hannah Brooks", "member", false],
  ["nell", "Nell Carter", "member", false],
  // The Research incubator's two places.
  ["omar", "Omar Haddad", "member", false],
  ["wen", "Wen Li", "member", false],
];
const NAME = Object.fromEntries(CAST.map(([uid, name]) => [uid, name]));
const address = (uid) => `${uid}@example.com`;

function userDoc([uid, name, role, suRecognised]) {
  return {
    uid,
    email: address(uid),
    displayName: name,
    role,
    suRecognised,
    permissions: PERMISSIONS,
    profile: {
      preferredName: name.split(" ")[0],
      universityEmail: "someone@nottingham.ac.uk",
      uniEmailVerifiedAt: new Date("2026-09-20T09:00:00Z"),
      status: "undergraduate",
      subject: "BA Philosophy",
      expectedGraduation: "2028-07",
      motivation: "I want to know which arguments hold up.",
      interests: "Governance",
    },
    createdAt: new Date("2026-09-20T09:00:00Z"),
    approvedAt: new Date("2026-09-21T09:00:00Z"),
    approvedBy: "zach",
  };
}

/** The session a request arrives with: the account as it is stored RIGHT NOW. */
function sessionOf(uid) {
  if (!uid) return null;
  const account = world.db.read(`users/${uid}`);
  if (!account) return null;
  return {
    uid,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    suRecognised: account.suRecognised === true,
    admissionsReviewer: account.admissionsReviewer === true,
    permissions: PERMISSIONS,
  };
}

// ---------------------------------------------------------------------------
// Making a request
// ---------------------------------------------------------------------------

let requests = 0;

/**
 * One request to a real handler, as `who` (a uid, or null for nobody signed
 * in). `course` hands the request the course routes' view of the store.
 * Answers `{ status, body }` and never throws: a handler that throws is
 * written down as a 599 with the error, so the story can carry on.
 */
async function call(who, handler, params, { body, query, course = false } = {}) {
  requests += 1;
  world.user = sessionOf(who);
  world.course = course;
  const init = {
    method: handler.name,
    headers: {
      "Content-Type": "application/json",
      // Each request from its own address, so only the per-account limits count.
      "x-forwarded-for": `10.${(requests >> 16) & 255}.${(requests >> 8) & 255}.${requests & 255}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const url = `${APP_URL}/api${query ? `?${new URLSearchParams(query)}` : ""}`;
  try {
    const response = await handler(new Request(url, init), { params: Promise.resolve(params) });
    return { status: response.status, body: structuredClone(response.body) };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    world.course = false;
  }
}
const courseCall = (who, handler, params, options = {}) => call(who, handler, params, { ...options, course: true });

/** Everything the story writes down. `steps` is every request it depended on, with the status it expected. */
const seen = { crashed: null, steps: [], logged: [] };

async function step(name, expected, who, handler, params, options) {
  const response = await call(who, handler, params, options);
  seen.steps.push({ name, expected, status: response.status, error: response.body?.error ?? null });
  return response;
}
const courseStep = (name, expected, who, handler, params, options = {}) =>
  step(name, expected, who, handler, params, { ...options, course: true });

// ---------------------------------------------------------------------------
// The term's programmes, course, run and groups
// ---------------------------------------------------------------------------

let ROUND = "";
/** Programme ids and question set ids, as the editor minted them. */
const P = { agi: "", inc: "" };
const SET = { fellowships: "", incubator: "", agi: "", incStream: "", facilitator: "" };
const Q = {};

const COURSE = "agi-strategy-fellowship__st1crs01";
const RUN = "agi-strategy-fellowship-autumn-2026__st1run01";
const GROUP = {
  /** Thursdays 6pm to 8pm, Room A13, Amelia. */
  A: "autumn-2026-group-a__st1grp0a",
  /** Tuesdays 6pm to 8pm, Room C20, Rahul and Sofia. */
  B: "autumn-2026-group-b__st1grp0b",
};
const FACILITATORS = { [GROUP.A]: ["amelia"], [GROUP.B]: ["rahul", "sofia"] };

/**
 * The Research incubator's course and run. The plan for this term gives each
 * incubator one group, with its lead as the facilitator, and has its run
 * published like a fellowship's.
 */
const INC_COURSE = "research-incubator__st1crs02";
const INC_RUN = "research-incubator-autumn-2026__st1run02";
const INC_GROUP = "autumn-2026-incubator__st1grp0i";

const MADE = new Date("2026-10-12T10:00:00Z");
const courseDoc = (title, tagline, track) => ({
  title,
  tagline,
  summaryBlocks: [],
  track,
  level: "Introductory",
  estimatedWeeklyHours: 4,
  status: "published",
  showcaseRunId: null,
  authorUid: "zach",
  collaboratorUids: [],
  createdAt: MADE,
  updatedAt: MADE,
});

/** Both courses, published, as the course editor leaves them. */
function courseSide() {
  return {
    [`courses/${COURSE}`]: courseDoc("AGI Strategy Fellowship", "Six weeks on how advanced AI could be governed.", "governance"),
    [`courses/${INC_COURSE}`]: courseDoc("Research Incubator", "A term-long project with a mentor.", "general"),
  };
}

/** A draft run as the course editor leaves one, with its weeks, week 1 published. */
function runDocs(runId, courseId, courseTitle, startDate, weeks, groupCount) {
  const docs = {
    [`courseRuns/${runId}`]: {
      courseId,
      courseTitle,
      label: "Autumn 2026",
      academicYear: "2026/27",
      status: "draft",
      startDate,
      weekPlan: Array.from({ length: weeks }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` })),
      applicationForm: [],
      applicationsOpenAt: null,
      applicationsCloseAt: null,
      applicationCap: null,
      admissionsReviewerUids: [],
      runFacilitatorUids: [],
      trackLeadUids: [],
      applicationCounts: { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 },
      groupCount,
      enrolMode: "admissions",
      streams: [],
      enrolledCount: 0,
      channel: `cohort:${runId}`,
      archived: false,
      authorUid: "zach",
      createdAt: MADE,
      updatedAt: MADE,
    },
  };
  for (let n = 1; n <= weeks; n += 1) {
    docs[`courseRuns/${runId}/weeks/w0${n}`] = {
      weekNumber: n,
      title: `Week ${n}`,
      summary: "",
      guideBlocks: [],
      materials: [],
      exercises: [],
      checklist: [],
      estimatedMinutes: null,
      published: n === 1,
      updatedAt: MADE,
      updatedByUid: "claudia",
    };
  }
  return docs;
}

/** A group as the course editor makes one, with nobody in it and nobody staffing it yet. */
const groupOn = (runId, courseId, name, weekday, startTimeLocal, location, capacity) => ({
  runId,
  courseId,
  name,
  facilitatorUids: [],
  capacity,
  memberCount: 0,
  session: { weekday, startTimeLocal, durationMinutes: 120, location, meetingUrl: null, notes: "" },
  sessionOverrides: {},
  archived: false,
  createdAt: MADE,
  updatedAt: MADE,
});

/** The incubator's draft run of seven weeks from Mon 2 Nov, and its one group: Mondays 5pm, Room B5. */
function incubatorRunSide() {
  return {
    ...runDocs(INC_RUN, INC_COURSE, "Research Incubator", "2026-11-02", 7, 1),
    [`courseGroups/${INC_GROUP}`]: groupOn(INC_RUN, INC_COURSE, "Group A", 1, "17:00", "Room B5", 4),
  };
}

/** AGI Strategy's draft run of six weeks from Thu 29 Oct, and its two groups of up to three. */
function runSide() {
  return {
    ...runDocs(RUN, COURSE, "AGI Strategy Fellowship", "2026-10-29", 6, 2),
    [`courseGroups/${GROUP.A}`]: groupOn(RUN, COURSE, "Group A", 4, "18:00", "Room A13", 3),
    [`courseGroups/${GROUP.B}`]: groupOn(RUN, COURSE, "Group B", 2, "18:00", "Room C20", 3),
  };
}

// ---------------------------------------------------------------------------
// What people paint, rank and are told
// ---------------------------------------------------------------------------

/** A painted week on the form's grid: `windows` is [weekday (0 Sunday), "HH:MM", "HH:MM"]. */
function paint(grid, windows) {
  const slots = (grid.endMinute - grid.startMinute) / grid.slotMinutes;
  const minute = (clock) => {
    const [h, m] = clock.split(":").map(Number);
    return h * 60 + m;
  };
  const days = [];
  for (let day = 0; day < 7; day += 1) {
    const on = new Array(Math.ceil(slots / 4) * 4).fill(false);
    for (const [weekday, from, to] of windows) {
      if (weekday !== day) continue;
      for (let slot = (minute(from) - grid.startMinute) / grid.slotMinutes; slot < (minute(to) - grid.startMinute) / grid.slotMinutes; slot += 1) {
        on[slot] = true;
      }
    }
    let hex = "";
    for (let c = 0; c < on.length / 4; c += 1) {
      let nibble = 0;
      for (let b = 0; b < 4; b += 1) if (on[c * 4 + b]) nibble |= 8 >> b;
      hex += nibble.toString(16);
    }
    days.push(hex);
  }
  return { ...grid, days };
}

const TUESDAY_EVENING = [2, "17:00", "20:30"];
const THURSDAY_EVENING = [4, "17:30", "21:00"];

/** Who applies, what they rank, and when they are free. */
const APPLIES = {
  amara: { ranked: ["agi"], week: [TUESDAY_EVENING] },
  dev: { ranked: ["agi"], week: [] },
  ella: { ranked: ["agi"], week: [[2, "17:00", "21:00"]] },
  joel: { ranked: ["agi"], week: [[5, "09:00", "21:00"]] },
  kofi: { ranked: ["agi"], week: [TUESDAY_EVENING, THURSDAY_EVENING] },
  priya: { ranked: ["agi"], week: [THURSDAY_EVENING] },
  hannah: { ranked: ["agi"], week: [TUESDAY_EVENING] },
  nell: { ranked: ["agi"], week: [THURSDAY_EVENING] },
  omar: { ranked: ["inc"], week: [[1, "17:00", "21:00"]] },
  wen: { ranked: ["inc"], week: [[3, "12:00", "16:00"]] },
};
const APPLICANTS = Object.keys(APPLIES);
/** AGI Strategy's six places, by name. */
const AGI_PLACES = ["amara", "dev", "ella", "joel", "kofi", "priya"];
const POOLED = ["hannah", "nell"];
const INCUBATOR_PLACES = ["omar", "wen"];

const params = () => ({ roundId: ROUND });
const of = (name) => ({ roundId: ROUND, programmeId: P[name] });
const enrolmentDoc = (uid) => world.db.read(`courseEnrolments/${RUN}__${uid}`);
const groupDoc = (groupId) => world.db.read(`courseGroups/${groupId}`);

/** What the mail door has been handed since `from`, in order. */
const mailSince = (from) => world.mail.slice(from);

/** Characters that take up no room on the page: a preview's padding, a button's hair spaces. */
const UNSEEN = /[\u00a0\u00ad\u034f\u200a-\u200f\u2060-\u2064\ufeff]/g;

/**
 * Text out of HTML, as somebody reads it: entities are read, and what takes
 * up no room is a space. In an email (`inline`), the tags that sit inside a
 * sentence (bold, a link) go without a gap; on a page every tag is a gap,
 * because a badge sits beside the next line with nothing between them.
 */
function textOf(html, { inline = true } = {}) {
  let text = html.replace(/<head[\s\S]*?<\/head>/i, "");
  if (inline) text = text.replace(/<\/?(?:strong|em|b|i|u|span|a)(?:\s[^>]*)?>/gi, "");
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(UNSEEN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One sent email as its reader gets it, and every address its links lead to. */
async function opened(mail) {
  const html = await render(mail.react);
  return {
    to: mail.to,
    subject: mail.subject,
    kind: mail.kind,
    replyTo: mail.replyTo ?? null,
    html,
    text: textOf(html),
    links: [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replace(/&amp;/g, "&")),
  };
}

/** What an email says from `start` (its greeting or heading) to the end of its footer. */
function readFrom(mail, start) {
  const at = mail.text.indexOf(start);
  assert.ok(at !== -1, `${mail.to}: "${mail.subject}" never says "${start}"`);
  return mail.text.slice(at);
}

// ---------------------------------------------------------------------------
// 1. Decision day
// ---------------------------------------------------------------------------

async function decisionDay() {
  at("building");
  for (const [path, data] of Object.entries(courseSide())) world.db.seed(path, data);
  const made = await step("make the form", 201, "zach", routes.forms.POST, {}, { body: { label: "Autumn 2026" } });
  ROUND = made.body?.id ?? "";
  for (const [name, addProgramme] of [
    ["agi", { name: "AGI Strategy Fellowship", shortName: "AGI Strategy", kind: "fellowship" }],
    ["inc", { name: "Research Incubator", shortName: "Research incubator", kind: "incubator" }],
  ]) {
    const added = await step(`add ${name}`, 200, "zach", routes.form.PATCH, params(), { body: { addProgramme } });
    P[name] = added.body?.addedProgrammeId ?? "";
  }
  const sets = await step("read the sets the editor made", 200, "zach", routes.sets.GET, params());
  for (const set of sets.body?.sets ?? []) {
    if (set.role === "general" && set.scope.kind === "fellowship") SET.fellowships = set.id;
    else if (set.role === "general") SET.incubator = set.id;
    else if (set.role === "facilitator") SET.facilitator = set.id;
    else if (set.scope.programmeId === P.agi) SET.agi = set.id;
    else if (set.scope.programmeId === P.inc) SET.incStream = set.id;
  }
  const long = (id, text) => ({ id, text, help: "", type: "long", wordLimit: 300, required: true, scored: false });
  for (const [setName, questions] of [
    ["fellowships", [long("why", "Why do you want to do a fellowship?")]],
    ["agi", [long("event", "Which event mattered most?")]],
    ["incubator", [long("idea", "What would you work on?")]],
    ["facilitator", [long("led", "Have you led a group before?")]],
  ]) {
    if (!SET[setName]) continue;
    const saved = await step(`write the ${setName} questions`, 200, "zach", routes.set.PATCH, { roundId: ROUND, setId: SET[setName] }, { body: { questions } });
    Q[setName] = Object.fromEntries(questions.map((question, index) => [question.id, saved.body?.set?.questions?.[index]?.id ?? ""]));
  }
  for (const [name, body] of [
    ["agi", { places: 6, starts: "w/c 26 Oct", facts: "6 WEEKS", useScores: false }],
    ["inc", { places: 2, starts: "w/c 2 Nov", facts: "10 WEEKS", useScores: false }],
  ]) {
    await step(`settings for ${name}`, 200, "zach", routes.programme.PATCH, of(name), { body });
  }
  await step("AGI Strategy's lead", 200, "zach", routes.roles.PUT, of("agi"), { body: { leadUid: "claudia", reviewerUids: [] } });
  await step("the incubator's lead", 200, "zach", routes.roles.PUT, of("inc"), { body: { leadUid: "tess", reviewerUids: [] } });
  await step("the lead ties AGI Strategy to its course", 200, "claudia", routes.programme.PATCH, of("agi"), { body: { courseId: COURSE } });
  await step("the lead ties the incubator to its course", 200, "tess", routes.programme.PATCH, of("inc"), { body: { courseId: INC_COURSE } });
  await step("set the dates", 200, "zach", routes.form.PATCH, params(), {
    body: {
      opens: { date: "2026-10-06", time: "09:00" },
      closes: { date: "2026-10-18", time: "23:59" },
      decisions: "2026-10-23",
      replyBy: "2026-10-27",
    },
  });
  await step("open the form", 200, "zach", routes.status.POST, params(), { body: { status: "open" } });

  // People apply.
  at("applying");
  for (const who of APPLICANTS) {
    later();
    const plan = APPLIES[who];
    const look = await call(who, routes.application.GET, params());
    const grid = look.body?.form?.availabilityGrid;
    const ranked = plan.ranked.map((name) => P[name]);
    const answers = {};
    if (plan.ranked.includes("agi")) {
      answers[SET.fellowships] = { [Q.fellowships.why]: "I want to understand it." };
      answers[SET.agi] = { [Q.agi.event]: "A new law came into force." };
    }
    if (plan.ranked.includes("inc")) answers[SET.incubator] = { [Q.incubator.idea]: "Measure it." };
    const draft = {
      aboutYou: look.body?.account,
      rankedProgrammeIds: ranked,
      wantsToFacilitate: false,
      answers,
      availability: paint(grid, plan.week),
      suMembership: "yes",
    };
    await step(`${who} saves`, 200, who, routes.application.PUT, params(), { body: { draft } });
    await step(`${who} sends`, 200, who, routes.applicationSend.POST, params(), { body: {} });
  }

  // The form closes, and the leads decide.
  at("deciding");
  await step("AGI Strategy's lead accepts six", 200, "claudia", routes.list.POST, of("agi"), {
    body: { decision: "accept", uids: AGI_PLACES },
  });
  for (const who of POOLED) {
    await step(`she pools ${who}`, 200, "claudia", routes.decision.PUT, { roundId: ROUND, uid: who }, {
      body: { programmeId: P.agi, decision: "pool", poolReason: "capacity" },
    });
  }
  await step("the incubator's lead accepts two", 200, "tess", routes.list.POST, of("inc"), {
    body: { decision: "accept", uids: INCUBATOR_PLACES },
  });
  for (const who of POOLED) {
    await step(`no offer for ${who}`, 200, "zach", routes.pool.PUT, params(), { body: { uid: who, outcome: { kind: "no-offer" } } });
  }

  // The test, then the send.
  at("decisionDay");
  await step("the decision-day test", 200, "zach", routes.sendTest.POST, params(), { body: { kind: "accepted" } });
  seen.mailBeforeTheSend = world.mail.length;
  const board = (await call("zach", routes.send.GET, params())).body?.board;
  const emails = board ? board.pending.emails + board.owed.people.length : -1;
  seen.decisionDayCount = emails;
  await step("the send", 200, "zach", routes.send.POST, params(), { body: { emails } });
  seen.decisionDayMail = await Promise.all(mailSince(seen.mailBeforeTheSend).map(opened));

  // Amara says she is coming. Nobody else replies.
  at("replying");
  await step("Amara is coming", 200, "amara", routes.reply.POST, params(), { body: { reply: "coming" } });
}

// ---------------------------------------------------------------------------
// What the story reads back, at each moment
// ---------------------------------------------------------------------------

const rowsOnTheRun = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith(`courseApplications/${RUN}__`))
    .map((path) => world.db.read(path))
    .map((row) => [row.uid, row.status])
    .sort();

/** The facilitators Publish has told, one marker per facilitator per group. */
const markers = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseNudges/facilitating__"))
    .map((path) => world.db.read(path))
    .map((marker) => [marker.groupId === GROUP.A ? "A" : marker.groupId === GROUP.B ? "B" : marker.groupId, marker.uid, marker.state])
    .sort();

const GROUP_NAME = { [GROUP.A]: "Group A", [GROUP.B]: "Group B", [INC_GROUP]: "the incubator's Group A" };

/** The board's `publish` summary: the number on its button, and the last test. */
const publishSummary = async (who = "zach", runId = RUN) =>
  (await courseCall(who, courseRoutes.board.GET, { runId })).body?.publish ?? null;

/** What a person's own application page says, and the page as it is drawn. */
async function ownPage(who) {
  const loaded = await pages.status.loadStatus(world.db, ROUND, who, new Date());
  const view = loaded?.view ?? null;
  const html = view ? renderToStaticMarkup(createElement(StatusPage, { roundId: ROUND, view, viewingAs: false })) : null;
  return { view, text: html ? textOf(html, { inline: false }) : null };
}

/**
 * THE TIMES PICTURE AND THE BOARD, at one moment: what the Groups tab counts
 * for each group, and how many of the board's cards say they can make it.
 */
async function timesAndBoard(label) {
  const loaded = await pages.times.loadTimesPicture(world.db, sessionOf("zach"), ROUND, P.agi, undefined);
  const picture = loaded.status === "ok" ? loaded.view.picture : null;
  const asLead = await pages.times.loadTimesPicture(world.db, sessionOf("claudia"), ROUND, P.agi, undefined);
  const board = await courseCall("zach", courseRoutes.board.GET, { runId: RUN });
  const people = board.body?.people ?? [];
  const groups = board.body?.groups ?? [];
  seen.times[label] = {
    blank: loaded.status === "ok" ? loaded.view.blank : loaded.status,
    asLead: asLead.status,
    // The same view in every field but who is looking, which keeps what only
    // an admin can do from the page (naming the run, the run editor) off hers.
    leadSeesTheAdminsPicture:
      loaded.status === "ok" &&
      asLead.status === "ok" &&
      asLead.view.viewer === "lead" &&
      isDeepStrictEqual({ ...asLead.view, viewer: "admin" }, loaded.view),
    picture: picture
      ? {
          holders: picture.holders,
          said: picture.said,
          minutes: picture.minutes,
          canMake: Object.fromEntries(picture.groups.map((group) => [group.name, group.canMake])),
          canMakeOne: picture.fit?.canMakeOne ?? null,
          fitsNone: (picture.fit?.none ?? []).map((person) => person.name),
          best: picture.best.map((cell) => [cell.weekday, cell.start, cell.count]),
        }
      : null,
    board: {
      status: board.status,
      groups: groups.map((group) => [group.name, group.sessionLabel, group.memberCount, group.facilitatorNames.join(" and ")]),
      cards: Object.fromEntries(
        people.map((row) => [
          row.uid,
          {
            availability: row.fromForm?.availability ?? null,
            canMake: (row.fromForm?.canMakeGroupIds ?? []).map((id) => GROUP_NAME[id] ?? id),
            holdsPlace: row.fromForm?.holdsPlace ?? null,
            group: row.groupId ? (GROUP_NAME[row.groupId] ?? row.groupId) : null,
            enrolment: row.enrolmentStatus,
            emailed: row.allocatedEmailAt !== null,
          },
        ]),
      ),
      canMake: Object.fromEntries(
        groups.map((group) => [group.name, people.filter((row) => (row.fromForm?.canMakeGroupIds ?? []).includes(group.id)).length]),
      ),
    },
  };
}

/**
 * WHAT EACH PERSON READS, at one moment: a member's programmes (the member
 * area's route) and the gate every page of their run asks; a facilitator's
 * group page (its roster and its register) and their programmes. Each
 * applicant's own application page is `ownPage`.
 */
async function reads(label) {
  const read = {};
  for (const who of [...AGI_PLACES, ...POOLED, ...INCUBATOR_PLACES]) {
    const me = await courseCall(who, courseRoutes.me.GET, {});
    world.user = sessionOf(who);
    world.course = true;
    let access;
    try {
      // The run of the programme they applied to: the gate its pages ask.
      access = await pages.runAccess.getRunAccess(INCUBATOR_PLACES.includes(who) ? INC_RUN : RUN);
    } finally {
      world.course = false;
    }
    read[who] = {
      programmes: (me.body?.runs ?? []).map((run) => [run.runId, run.membership, run.groupName, run.roles.join(" ")]),
      run: access ? { canLearn: access.canLearn, group: access.enrolment?.groupId ? (GROUP_NAME[access.enrolment.groupId] ?? access.enrolment.groupId) : null } : null,
    };
  }
  for (const [groupId, uids] of Object.entries(FACILITATORS)) {
    for (const who of uids) {
      const roster = await courseCall(who, courseRoutes.roster.GET, { groupId });
      const register = await courseCall(who, courseRoutes.register.GET, { groupId });
      const me = await courseCall(who, courseRoutes.me.GET, {});
      read[who] = {
        roster:
          roster.status === 200
            ? { members: roster.body.members.map((m) => m.displayName), notYetTold: roster.body.notYetTold }
            : { refused: roster.status },
        register:
          register.status === 200
            ? { members: register.body.members.map((m) => m.displayName), notYetTold: register.body.notYetTold }
            : { refused: register.status },
        programmes: (me.body?.runs ?? []).map((run) => [run.runId, run.membership, run.groupName, run.roles.join(" ")]),
      };
    }
  }
  seen.reads[label] = read;
}

/** AGI Strategy's own list of applications (the Applications tab), as its lead reads it. */
async function theList() {
  const list = await call("claudia", routes.list.GET, of("agi"));
  const board = list.body?.board;
  if (!board) return { refused: list.status };
  const row = (uid) => board.rows.find((r) => r.uid === uid) ?? null;
  return {
    counts: board.counts,
    placed: board.progress.placed,
    placesLeft: board.progress.placesLeft,
    hannah: row("hannah") && {
      standing: row("hannah").standing,
      byInvitation: row("hannah").byInvitation,
      freedPlace: row("hannah").freedPlace,
      withdrawn: row("hannah").withdrawn,
    },
  };
}

/** One application, opened under AGI Strategy by its lead: what it says of where the person stands there. */
async function theApplication(uid) {
  const opened = await call("claudia", routes.review.GET, { roundId: ROUND, uid }, { query: { programme: P.agi } });
  const decision = opened.body?.review?.decision;
  if (!decision) return { refused: opened.status };
  return {
    standing: decision.standing,
    byInvitation: decision.byInvitation,
    freedPlace: decision.freedPlace,
    kind: decision.kind,
    told: decision.told,
  };
}

/** The freed-places page, as `who` would be shown it. */
async function offerPage(who) {
  const loaded = await pages.freedPlaces.loadOfferBoard(world.db, sessionOf(who), ROUND, P.agi, new Date());
  if (!loaded.ok) return { refused: loaded.kind };
  const board = loaded.board;
  return {
    window: board.window,
    free: board.free,
    heading: board.heading,
    gaveBack: board.gaveBack,
    told: board.told,
    people: board.people.map((person) => ({
      uid: person.uid,
      detail: person.detail,
      chips: person.chips.map((chip) => chip.label),
      groups: person.groupIds.map((id) => GROUP_NAME[id] ?? id),
      cannot: person.cannot,
      toldOn: person.toldOn,
      // When their own week says they are free at each group's time, by the group's name.
      freeOn: Object.entries(person.freeOn).map(([id, said]) => [GROUP_NAME[id] ?? id, said]),
    })),
    // A group lends no "free on" words since October 2026: the person's own week says them.
    groups: board.groups.map((group) => [group.name, group.meets, group.startsOn, group.seatsFree]),
    offered: board.offered.map((person) => [person.uid, person.said, person.email]),
    test: board.test,
  };
}

// ---------------------------------------------------------------------------
// 2. The run is named while it is a draft, and moved on
// ---------------------------------------------------------------------------

async function theRunIsNamed() {
  at("naming");
  for (const [path, data] of Object.entries(runSide())) world.db.seed(path, data);
  // Staffed through the routes that staff a run.
  await courseStep("Yusuf is the run's track lead", 200, "zach", courseRoutes.runRoles.POST, { runId: RUN }, { body: { trackLeadUids: ["yusuf"] } });
  for (const [groupId, uids] of Object.entries(FACILITATORS)) {
    await courseStep(`${GROUP_NAME[groupId]}'s facilitators`, 200, "zach", courseRoutes.facilitators.POST, { groupId }, { body: { uids } });
  }
  seen.naming = {
    leadNames: await call("claudia", routes.run.PUT, of("agi"), { body: { runId: RUN } }),
    named: await step("an admin names the run while it is a draft", 200, "zach", routes.run.PUT, of("agi"), { body: { runId: RUN } }),
  };
  seen.naming.handOverWhileDraft = await call("zach", routes.handOver.POST, of("agi"));
  seen.naming.movedOn = await courseStep("an admin moves the run on from draft", 200, "zach", courseRoutes.runStatus.POST, { runId: RUN }, { body: { status: "applications-open" } });
  seen.naming.status = world.db.read(`courseRuns/${RUN}`).status;
  seen.naming.panel = (await call("zach", routes.run.GET, of("agi"))).body?.panel ?? null;

  // The incubator's run, the same way, with its lead facilitating its one group.
  for (const [path, data] of Object.entries(incubatorRunSide())) world.db.seed(path, data);
  await courseStep("the incubator group's facilitator is its lead", 200, "zach", courseRoutes.facilitators.POST, { groupId: INC_GROUP }, { body: { uids: ["tess"] } });
  await step("an admin names the incubator's run while it is a draft", 200, "zach", routes.run.PUT, of("inc"), { body: { runId: INC_RUN } });
  await courseStep("an admin moves the incubator's run on from draft", 200, "zach", courseRoutes.runStatus.POST, { runId: INC_RUN }, { body: { status: "applications-open" } });
  await timesAndBoard("named, nobody handed over");
  await reads("named, nobody handed over");
}

// ---------------------------------------------------------------------------
// 3. The hand-over
// ---------------------------------------------------------------------------

async function theHandOver() {
  at("handingOver");
  const mailBefore = world.mail.length;
  seen.handOver = {
    leadPresses: await call("claudia", routes.handOver.POST, of("agi")),
    trackLeadPresses: await call("yusuf", routes.handOver.POST, of("agi")),
    pressed: await step("an admin hands over AGI Strategy's place holders", 200, "zach", routes.handOver.POST, of("agi")),
  };
  seen.handOver.rows = rowsOnTheRun();
  seen.handOver.incubator = await step("an admin hands over the incubator's place holders", 200, "zach", routes.handOver.POST, of("inc"));
  seen.handOver.again = await call("zach", routes.handOver.POST, of("agi"));
  seen.handOver.asTrackLead = await courseCall("yusuf", courseRoutes.board.GET, { runId: RUN });
  seen.handOver.mailed = world.mail.length - mailBefore;
  await timesAndBoard("handed over");
  await reads("handed over");
}

// ---------------------------------------------------------------------------
// 4. Places on the board
// ---------------------------------------------------------------------------

const PLACEMENTS = [
  { uid: "amara", groupId: GROUP.B },
  { uid: "ella", groupId: GROUP.B },
  { uid: "kofi", groupId: GROUP.B },
  { uid: "dev", groupId: GROUP.A },
  { uid: "joel", groupId: GROUP.A },
  { uid: "priya", groupId: GROUP.A },
];

async function placesOnTheBoard() {
  at("placing");
  const mailBefore = world.mail.length;
  seen.placing = {
    trackLeadPlaces: await courseCall("yusuf", courseRoutes.allocate.POST, { runId: RUN }, { body: { placements: [PLACEMENTS[0]] } }),
    placed: await courseStep("an admin puts the six in groups", 200, "zach", courseRoutes.allocate.POST, { runId: RUN }, { body: { placements: PLACEMENTS } }),
    incubator: await courseStep("an admin puts the incubator's two in its group", 200, "zach", courseRoutes.allocate.POST, { runId: INC_RUN }, {
      body: { placements: INCUBATOR_PLACES.map((uid) => ({ uid, groupId: INC_GROUP })) },
    }),
  };
  seen.placing.mailed = world.mail.length - mailBefore;
  await timesAndBoard("placed");
  await reads("placed, before Publish");
  seen.pages = { placed: Object.fromEntries(await Promise.all([...AGI_PLACES, ...INCUBATOR_PLACES].map(async (who) => [who, await ownPage(who)]))) };
}

// ---------------------------------------------------------------------------
// 5. "Send a test to me", then Publish
// ---------------------------------------------------------------------------

async function testThenPublish() {
  at("publishing");
  const p = {};
  seen.publish = p;
  p.before = await publishSummary();
  const beforeTheUntestedPress = world.mail.length;
  p.untested = await courseCall("zach", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: p.before?.emails ?? -1 } });
  p.mailedByTheUntestedPress = world.mail.length - beforeTheUntestedPress;
  p.trackLeadTests = await courseCall("yusuf", courseRoutes.publishTest.POST, { runId: RUN });
  p.leadSummary = await publishSummary("claudia");
  p.trackLeadSummary = await publishSummary("yusuf");
  const beforeTheTest = world.mail.length;
  p.test = await courseStep("Send a test to me", 200, "zach", courseRoutes.publishTest.POST, { runId: RUN });
  p.testMail = await Promise.all(mailSince(beforeTheTest).map(opened));
  p.stampedByTheTest = AGI_PLACES.filter((uid) => enrolmentDoc(uid)?.allocatedEmailAt);
  p.markersAfterTheTest = markers();
  await reads("tested, before Publish");
  p.afterTest = await publishSummary();
  p.wrongCount = await courseCall("zach", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: (p.afterTest?.emails ?? 0) - 1 } });
  p.trackLeadPresses = await courseCall("yusuf", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: p.afterTest?.emails ?? 0 } });
  const beforeThePress = world.mail.length;
  p.pressed = await courseStep("Publish with the board's count", 200, "zach", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: p.afterTest?.emails ?? -1 } });
  p.pressMail = await Promise.all(mailSince(beforeThePress).map(opened));
  p.stamped = AGI_PLACES.filter((uid) => enrolmentDoc(uid)?.allocatedEmailAt);
  p.markers = markers();
  p.pushes = world.pushes.map((push) => push.uid);
  p.afterPress = await publishSummary();
  const beforeAgain = world.mail.length;
  p.pressedAgain = await courseCall("zach", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: p.afterPress?.emails ?? -1 } });
  p.mailedAgain = world.mail.length - beforeAgain;
  await reads("published");
  await timesAndBoard("published");
  seen.pages.published = Object.fromEntries(await Promise.all([...AGI_PLACES, ...INCUBATOR_PLACES].map(async (who) => [who, await ownPage(who)])));
}

// ---------------------------------------------------------------------------
// 5b. The incubator's run is published the same way
// ---------------------------------------------------------------------------

async function theIncubatorPublishes() {
  at("publishing");
  later(30);
  const i = {};
  seen.incubator = i;
  i.before = await publishSummary("zach", INC_RUN);
  const beforeTheTest = world.mail.length;
  const pushesBefore = world.pushes.length;
  i.test = await courseStep("Send a test to me, on the incubator's run", 200, "zach", courseRoutes.publishTest.POST, { runId: INC_RUN });
  i.afterTest = await publishSummary("zach", INC_RUN);
  i.pressed = await courseStep("Publish the incubator's run", 200, "zach", courseRoutes.publish.POST, { runId: INC_RUN }, {
    body: { emails: i.afterTest?.emails ?? -1 },
  });
  i.mail = await Promise.all(mailSince(beforeTheTest).map(opened));
  i.pushes = world.pushes.slice(pushesBefore);
  i.markers = markers().filter(([group]) => group === INC_GROUP);
  i.afterPress = await publishSummary("zach", INC_RUN);
  await reads("the incubator published");
  i.pages = Object.fromEntries(await Promise.all(INCUBATOR_PLACES.map(async (who) => [who, await ownPage(who)])));
}

// ---------------------------------------------------------------------------
// 6. A place given back after Publish
// ---------------------------------------------------------------------------

async function aPlaceGivenBack() {
  at("givingBack");
  const g = {};
  seen.gaveBack = g;
  const mailBefore = world.mail.length;
  g.reply = await step("Ella gives her place back", 200, "ella", routes.reply.POST, params(), {
    body: { reply: "cant-make-it", reason: { kind: "times", other: "" } },
  });
  // Q12: in a group Publish told her about, her reply is leaving the
  // programme, and the leave's email goes after the answer without being
  // waited for.
  await new Promise((resolve) => setImmediate(resolve));
  g.mailedByTheReply = mailSince(mailBefore).map((mail) => [mail.to, mail.subject, mail.kind]);
  g.page = await ownPage("ella");
  g.panel = (await call("zach", routes.run.GET, of("agi"))).body?.panel ?? null;
  // Off Group B at once, with nobody pressing anything.
  g.groupB = { memberCount: groupDoc(GROUP.B).memberCount };
  g.enrolment = (({ status, groupId, allocatedEmailAt, droppedOutAt, dropOutReason }) => ({
    status,
    groupId,
    told: allocatedEmailAt instanceof Date,
    droppedOutAt: droppedOutAt instanceof Date ? droppedOutAt.toISOString() : droppedOutAt ?? null,
    dropOutReason: dropOutReason ?? null,
  }))(enrolmentDoc("ella"));
  // Her place on the form, given back in the same transaction.
  g.application = (({ status, attendance, releaseReason }) => ({
    status,
    attendance: attendance?.answer ?? null,
    releaseReason: releaseReason ?? null,
  }))(world.db.read(`admissionApplications/${ROUND}__ella`));
  // Her facilitators' register: who left the group, as it lists them.
  g.registerLeavers =((await courseCall("rahul", courseRoutes.register.GET, { groupId: GROUP.B })).body?.leavers ?? []).map(
    (leaver) => [leaver.displayName, leaver.left],
  );
  await reads("Ella gave her place back");
  await timesAndBoard("Ella gave her place back");
  // Her seat is free the moment she has left: the page already offers it.
  // Nothing is pressed here; the programme's lead offers it in 8.
  g.offerPage = await offerPage("zach");
  g.summaryBeforeTidying = await publishSummary();

  // What is left of the runbook: her row on the run's own list changed from
  // Accepted. (Q12: Remove on the board, the runbook's other step, is not
  // one for somebody Publish had told: her reply took her out of her group.)
  at("tidying");
  g.summaryBetween = await publishSummary();
  g.publishBetween = await courseCall("zach", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: g.summaryBetween?.emails ?? -1 } });
  const beforeTheRowChange = world.mail.length;
  g.decided = await courseStep("an admin changes Ella's row from Accepted", 200, "zach", courseRoutes.decide.POST, { runId: RUN, uid: "ella" }, {
    body: { action: "reject", reason: "Gave her place back on the application form." },
  });
  // The decide route sends its email after it answers, without waiting for it.
  await new Promise((resolve) => setImmediate(resolve));
  g.mailedByTheRowChange = mailSince(beforeTheRowChange).map((mail) => mail.to);
  g.rows = rowsOnTheRun();
  g.summaryAfter = await publishSummary();
  await timesAndBoard("Ella taken off the run");
}

// ---------------------------------------------------------------------------
// 7. The freed place
// ---------------------------------------------------------------------------

const REPLY_BY = "2026-10-30";

async function aFreedPlace() {
  at("offering");
  const f = {};
  seen.freed = f;
  f.page = await offerPage("zach");
  f.leadPage = await offerPage("claudia");
  f.mailBefore = world.mail.length;
  f.test = await step("the programme's lead tests the freed place's email", 200, "claudia", routes.freedPlacesTest.POST, of("agi"), {
    body: { uid: "hannah", groupId: GROUP.B, replyBy: REPLY_BY },
  });
  f.offer = await step("the programme's lead offers Hannah the freed place", 200, "claudia", routes.freedPlaces.POST, of("agi"), {
    body: { picks: [{ uid: "hannah", groupId: GROUP.B }], replyBy: REPLY_BY, invitations: 1 },
  });
  f.offerMail = await Promise.all(mailSince(f.mailBefore).map(opened));
  f.hannahOffered = await ownPage("hannah");
  f.pageAfterTheOffer = await offerPage("zach");
  f.handOverBeforeTheAnswer = await call("zach", routes.handOver.POST, of("agi"));

  at("accepting");
  f.accepted = await step("Hannah accepts", 200, "hannah", routes.reply.POST, params(), { body: { reply: "accept-invitation" } });
  f.hannahAccepted = await ownPage("hannah");
  f.listOnceAccepted = await theList();
  f.applicationOnceAccepted = await theApplication("hannah");
  await timesAndBoard("Hannah accepted, before the hand-over");
  await reads("Hannah accepted");

  at("placingAgain");
  f.handedOver = await step("an admin hands over again", 200, "zach", routes.handOver.POST, of("agi"));
  f.rows = rowsOnTheRun();
  f.placed = await courseStep("an admin puts Hannah in Group B", 200, "zach", courseRoutes.allocate.POST, { runId: RUN }, {
    body: { placements: [{ uid: "hannah", groupId: GROUP.B }] },
  });
  await reads("Hannah placed, before Publish");
  f.summary = await publishSummary();
  const beforeThePress = world.mail.length;
  f.published = await courseStep("Publish again", 200, "zach", courseRoutes.publish.POST, { runId: RUN }, { body: { emails: f.summary?.emails ?? -1 } });
  f.pressMail = await Promise.all(mailSince(beforeThePress).map(opened));
  f.allMail = mailSince(f.mailBefore).map((mail) => [mail.to, mail.subject]);
  f.groupB = { memberCount: groupDoc(GROUP.B).memberCount };
  f.listAtTheEnd = await theList();
  f.applicationAtTheEnd = await theApplication("hannah");
  await reads("Hannah published");
  await timesAndBoard("the end");
  seen.pages.end = Object.fromEntries(await Promise.all([...AGI_PLACES, ...POOLED, ...INCUBATOR_PLACES].map(async (who) => [who, await ownPage(who)])));
}

// ---------------------------------------------------------------------------
// The story
// ---------------------------------------------------------------------------

async function tellTheStory() {
  mock.timers.enable({ apis: ["Date"], now: new Date(WHEN.building) });
  // The code under test logs what it cannot do. What is logged is kept and not printed.
  mock.method(console, "error", (...args) => {
    seen.logged.push(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  });
  mock.method(console, "warn", (...args) => {
    seen.logged.push(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  });
  world.db = makeDb(Object.fromEntries(CAST.map((person) => [`users/${person[0]}`, userDoc(person)])), { now: () => new Date() });
  world.courseDb = courseView(world.db);
  seen.times = {};
  seen.reads = {};
  try {
    await decisionDay();
    await theRunIsNamed();
    await theHandOver();
    await placesOnTheBoard();
    await testThenPublish();
    await theIncubatorPublishes();
    await aPlaceGivenBack();
    await aFreedPlace();
  } catch (err) {
    seen.crashed = err;
  }
}

// ---------------------------------------------------------------------------
// What the story has to have said
// ---------------------------------------------------------------------------

const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";
const short = (response) => [response.status, response.body?.error ?? null];
const groupPage = (runId, groupId) => `${APP_URL}/learn/${runId}/group/${groupId}`;
const programmePage = (runId) => `${APP_URL}/learn/${runId}`;

/**
 * The placement email Publish writes, word for word, from its greeting to its
 * footer: the board's words (st-emails), since October 2026. Until then it
 * read "You've been placed, Amara You're in Group B for AGI Strategy
 * Fellowship (Autumn 2026). Your group is facilitated by ..." with each fact
 * on a line of its own. This term's week 1 is published with no reading in
 * it, so nothing gives its time and the email says nothing of it.
 */
const placementWords = ({ first, group, slot, room, from, facilitators, size }) =>
  `Hi ${first}, You’re in ${group}. You’ll meet on ${slot} in ${room}, starting ${from}. Sessions last 2 hours. ` +
  (facilitators.length === 1 ? `${facilitators[0]} is your facilitator. ` : `${facilitators.join(" and ")} are your facilitators. `) +
  `There are ${size} of you. Open your programme Claudia AGI Strategy lead, NAISI ${FOOTER}`;

/**
 * The facilitators' email Publish writes, word for word, from its greeting to
 * its footer: the board's words since October 2026. Until then the room was
 * a line of its own ("Where: Room C20"), and so was "You’re facilitating with
 * Sofia.", and nothing said where the names are.
 */
const facilitatingWords = ({ first, group, slot, from, to, room, withWhom = null, size, lead, programme }) =>
  `Hi ${first}, ${group} meets on ${slot} in ${room}, from ${from} to ${to}. ` +
  (withWhom ? `You’re facilitating with ${withWhom}. ` : "") +
  `There are ${size} people in the group. Their names are on your group page. Open your group Take the register on your phone during the session. ` +
  `${lead} ${programme} lead, NAISI ${FOOTER}`;

/** Kofi's own application page while he holds his place and has not said he is coming, word for word. */
const KOFI_PAGE =
  "Your application AGI Strategy Fellowship Accepted Autumn 2026 · Fri 23 Oct You’re in AGI Strategy. 6 WEEKS · " +
  "starts w/c 26 Oct You’ll be in a small group with a facilitator, on campus. Before you start, we’ll email you " +
  "your group and when it meets. I’m coming Optional. It helps us plan groups. I can’t make it This frees your " +
  "place for someone else. Questions? ai-safety@uonsu.com";

/**
 * A fellowship place's page once Publish has told its owner their group (Q12):
 * no "I’m coming" and no "I can’t make it", but the way to their programme's
 * page and what giving the place back now means there. In the words written
 * for the boards' designers to confirm (`src/lib/applications/status/runWords.ts`).
 */
const AGI_TOLD_PAGE = (group) =>
  "Your application AGI Strategy Fellowship Accepted Autumn 2026 · Fri 23 Oct You’re in AGI Strategy. 6 WEEKS · " +
  `starts w/c 26 Oct You’re in ${group}. Your programme’s page has your sessions and each week’s reading. Go to ` +
  `your programme Changed your mind? Giving your place back now means leaving ${group}. You can do that from your ` +
  "programme’s page. Questions? ai-safety@uonsu.com";

/** An incubator place's page once Publish has told its owner: the same, naming no group. */
const INCUBATOR_TOLD_PAGE =
  "Your application Research Incubator Accepted Autumn 2026 · Fri 23 Oct You’re in Research incubator. 10 WEEKS · " +
  "starts w/c 2 Nov Your programme’s page has your sessions and each week’s reading. Go to your programme Changed " +
  "your mind? Giving your place back now means leaving the programme. You can do that from your programme’s page. " +
  "Questions? ai-safety@uonsu.com";

/**
 * Each group's weekly time and the day it meets from, as the placement email
 * writes them: in the words the facilitators' email and the boards write a
 * session in ("Tuesdays at 6pm", "Tue 3 Nov"), since the walk of stage one
 * found this email alone writing "Tuesday 3 November, 18:00" (F5). The
 * subject has said the weekly time since the email took the board's words
 * (October 2026; until then "first session Tue 3 Nov, 6pm"). `size` is how
 * many are in the group once the press is done, the reader among them.
 */
const B_PLACED = (first, size = 3) =>
  placementWords({ first, group: "Group B", slot: "Tuesdays at 6pm", room: "Room C20", from: "Tue 3 Nov", facilitators: ["Rahul", "Sofia"], size });
const A_PLACED = (first, size = 3) =>
  placementWords({ first, group: "Group A", slot: "Thursdays at 6pm", room: "Room A13", from: "Thu 29 Oct", facilitators: ["Amelia"], size });
/** Group B when Hannah is told: Amara and Kofi, told at Publish, and Hannah. Ella gave her place back and left it. */
const HANNAH_GROUP_SIZE = 3;
const B_SUBJECT = "Your AGI Strategy group: Tuesdays at 6pm";
const A_SUBJECT = "Your AGI Strategy group: Thursdays at 6pm";

/** What one moment's reading said. */
function readAt(label) {
  const read = seen.reads[label];
  assert.ok(read, `the story read nothing at "${label}"`);
  return read;
}
function timesAt(label) {
  const times = seen.times[label];
  assert.ok(times, `the story took no times picture at "${label}"`);
  return times;
}

/** A member who sees nothing of the run. */
const NOTHING = { programmes: [], run: { canLearn: false, group: null } };
/** A member who reads the run, in this group. */
const IN = (group, runId = RUN, gate = group) => ({ programmes: [[runId, "enrolled", group, "learner"]], run: { canLearn: true, group: gate } });
/** A facilitator's group page and programmes: the names their roster and register show. */
const FACILITATING = (members, notYetTold) => ({
  roster: { members, notYetTold },
  register: { members, notYetTold },
  programmes: [[RUN, "enrolled", null, "facilitator"]],
});

/** What every member and facilitator reads at one moment, against what they should. */
function readsAre(label, members, facilitators) {
  const read = readAt(label);
  assert.deepEqual(
    Object.fromEntries([...AGI_PLACES, ...POOLED, ...INCUBATOR_PLACES].map((uid) => [uid, read[uid]])),
    Object.fromEntries([...AGI_PLACES, ...POOLED, ...INCUBATOR_PLACES].map((uid) => [uid, members[uid] ?? NOTHING])),
    `${label}: members`,
  );
  assert.deepEqual(
    { amelia: read.amelia, rahul: read.rahul, sofia: read.sofia },
    facilitators,
    `${label}: facilitators`,
  );
}

describe("stage one of the course hub, one term from decision day to the first session", () => {
  before(tellTheStory);

  test("the story was told to the end, and every request it depended on answered as expected", () => {
    assert.equal(seen.crashed, null, seen.crashed?.stack);
    const wrong = seen.steps.filter((s) => (Array.isArray(s.expected) ? !s.expected.includes(s.status) : s.status !== s.expected));
    assert.deepEqual(wrong, []);
  });

  test("nothing the code under test did was logged as a failure", () => {
    // Node's own notice that the mock clock is experimental is the one line.
    assert.deepEqual(seen.logged.filter((line) => !line.includes("ExperimentalWarning: The MockTimers API")), []);
  });

  // -------------------------------------------------------------------------
  describe("1. decision day", () => {
    test("the send emails each of the ten applicants once, with the society's reply address", () => {
      assert.equal(seen.decisionDayCount, 10);
      assert.deepEqual(
        seen.decisionDayMail.map((mail) => [mail.to, mail.subject, mail.kind, mail.replyTo]).sort(),
        [
          [address("amara"), "You’re in AGI Strategy", "admissions", "ai-safety@uonsu.com"],
          [address("dev"), "You’re in AGI Strategy", "admissions", "ai-safety@uonsu.com"],
          [address("ella"), "You’re in AGI Strategy", "admissions", "ai-safety@uonsu.com"],
          [address("hannah"), "Your NAISI application", "admissions", "ai-safety@uonsu.com"],
          [address("joel"), "You’re in AGI Strategy", "admissions", "ai-safety@uonsu.com"],
          [address("kofi"), "You’re in AGI Strategy", "admissions", "ai-safety@uonsu.com"],
          [address("nell"), "Your NAISI application", "admissions", "ai-safety@uonsu.com"],
          [address("omar"), "You’re in Research incubator", "admissions", "ai-safety@uonsu.com"],
          [address("priya"), "You’re in AGI Strategy", "admissions", "ai-safety@uonsu.com"],
          [address("wen"), "You’re in Research incubator", "admissions", "ai-safety@uonsu.com"],
        ],
      );
    });

    test("the incubator's people are told it helps us plan, and never about a group; the fellowship's, that it helps us plan groups", () => {
      const mailTo = (uid) => seen.decisionDayMail.find((mail) => mail.to === address(uid));
      for (const uid of INCUBATOR_PLACES) {
        assert.equal(
          readFrom(mailTo(uid), "Hi "),
          `Hi ${NAME[uid].split(" ")[0]}, You’re in the Research Incubator. It starts w/c 2 Nov. We’ll email you before you ` +
            "start with how the first week works. You don’t need to reply. If you’re coming, tap the button. It helps us plan. " +
            "If you can’t make it, tell us and we’ll give your place to someone else. I’m coming I can’t make it Tess " +
            `Research incubator lead, NAISI ${FOOTER}`,
        );
        assert.doesNotMatch(mailTo(uid).text, /group/i, uid);
      }
      assert.equal(
        readFrom(mailTo("kofi"), "Hi "),
        "Hi Kofi, You’re in the AGI Strategy Fellowship. It starts w/c 26 Oct. You’ll be in a small group with a " +
          "facilitator, on campus, and we’ll email you your group and when it meets before you start. You don’t need to " +
          "reply. If you’re coming, tap the button. It helps us plan groups. If you can’t make it, tell us and we’ll give " +
          `your place to someone else. I’m coming I can’t make it Claudia AGI Strategy lead, NAISI ${FOOTER}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("2. the run is named while it is a draft, and moved on", () => {
    test("only an admin names it, and a run still a draft can be named", () => {
      assert.deepEqual(short(seen.naming.leadNames), [403, "Only an admin can say which course run a programme places people on."]);
      assert.equal(seen.naming.named.body.panel.runId, RUN);
      assert.deepEqual(seen.naming.named.body.panel.choices, [{ id: RUN, label: "Autumn 2026 · Draft", selectable: true, note: "" }]);
    });

    test("nobody can be handed over while it is a draft; moved on, the panel offers the six who hold a place", () => {
      assert.deepEqual(short(seen.naming.handOverWhileDraft), [
        409,
        "That run is still a draft. Move it on from draft first: its members cannot open a draft run.",
      ]);
      assert.deepEqual(seen.naming.movedOn.body, { ok: true, status: "applications-open" });
      assert.equal(seen.naming.status, "applications-open");
      const panel = seen.naming.panel;
      assert.deepEqual(panel.choices, [{ id: RUN, label: "Autumn 2026 · Applications open", selectable: true, note: "" }]);
      assert.deepEqual(
        [panel.runId, panel.blocked, panel.holders, panel.onTheList, panel.gaveBack, panel.notAccepted, panel.otherRows],
        [RUN, null, 6, 0, [], [], 0],
      );
      assert.deepEqual(panel.toHandOver.map((holder) => holder.name), ["Amara Okafor", "Dev Patel", "Ella Robinson", "Joel Adeyemi", "Kofi Mensah", "Priya Nair"]);
    });

    test("naming a run and moving it on shows nobody anything", () => {
      readsAre("named, nobody handed over", {}, {
        amelia: FACILITATING([], false),
        rahul: FACILITATING([], false),
        sofia: FACILITATING([], false),
      });
    });
  });

  // -------------------------------------------------------------------------
  describe("3. the hand-over", () => {
    test("only an admin hands over: the programme's lead and the run's track lead are refused in the same words", () => {
      for (const who of ["leadPresses", "trackLeadPresses"]) {
        assert.deepEqual(short(seen.handOver[who]), [403, "Only an admin can hand people over to a course run."], who);
      }
    });

    test("a press writes a row for exactly the six who hold a place, and a second press writes nothing; nobody is emailed", () => {
      assert.deepEqual(seen.handOver.pressed.body.receipt, { handedOver: 6, alreadyThere: 0 });
      assert.deepEqual(seen.handOver.rows, AGI_PLACES.map((uid) => [uid, "accepted"]));
      assert.deepEqual(seen.handOver.again.body.receipt, { handedOver: 0, alreadyThere: 6 });
      assert.deepEqual(seen.handOver.incubator.body.receipt, { handedOver: 2, alreadyThere: 0 });
      assert.equal(seen.handOver.mailed, 0);
    });

    test("the run's track lead opens the board and is listed nobody, and is told its Publish is an admin's", () => {
      const shown = seen.handOver.asTrackLead;
      assert.equal(shown.status, 200);
      assert.deepEqual(shown.body.people, []);
      assert.deepEqual(shown.body.groups.map((group) => group.name), ["Group B", "Group A"]);
      assert.deepEqual(shown.body.publish, {
        adminOnly: true,
        emails: 0,
        people: 0,
        facilitators: 0,
        more: 0,
        noAddress: [],
        emptyGroups: [],
        refusals: [],
        test: { state: "none", when: null, who: null },
      });
    });

    test("a hand-over shows nobody anything", () => {
      readsAre("handed over", {}, {
        amelia: FACILITATING([], false),
        rahul: FACILITATING([], false),
        sofia: FACILITATING([], false),
      });
    });
  });

  // -------------------------------------------------------------------------
  describe("4. the times picture counts, for each group, the people the board's cards say can make it", () => {
    test("on the Groups tab: six hold a place, five said when they are free, Joel fits no group", () => {
      assert.deepEqual(timesAt("handed over").picture, {
        holders: 6,
        said: 5,
        minutes: 120,
        canMake: { "Group A": 2, "Group B": 3 },
        canMakeOne: 4,
        fitsNone: ["Joel Adeyemi"],
        // [weekday, start in minutes, count]: Tuesday 5pm and 6pm, Thursday 6pm and 7pm, Tuesday 7pm, Friday 9am.
        best: [[2, 1020, 3], [2, 1080, 3], [4, 1080, 2], [4, 1140, 2], [2, 1140, 1], [5, 540, 1]],
      });
    });

    test("on the board: each card says which groups that person can make, and Dev said nothing", () => {
      const { cards, canMake } = timesAt("handed over").board;
      assert.deepEqual(
        Object.fromEntries(Object.entries(cards).map(([uid, card]) => [uid, [card.availability, card.canMake, card.holdsPlace]])),
        {
          amara: ["given", ["Group B"], true],
          dev: ["none-given", [], true],
          ella: ["given", ["Group B"], true],
          joel: ["given", [], true],
          kofi: ["given", ["Group B", "Group A"], true],
          priya: ["given", ["Group A"], true],
        },
      );
      assert.deepEqual(canMake, { "Group B": 3, "Group A": 2 });
    });

    test("the two agree at every moment the runbook's steps are done", () => {
      for (const label of ["handed over", "placed", "published", "Ella taken off the run", "the end"]) {
        const { picture, board } = timesAt(label);
        assert.deepEqual(board.canMake, { "Group B": picture.canMake["Group B"], "Group A": picture.canMake["Group A"] }, label);
      }
    });

    test("between those moments they differ by exactly the people one of them counts and the other cannot", () => {
      // Before the hand-over the board lists nobody; the picture counts who holds a place.
      assert.deepEqual(timesAt("named, nobody handed over").board.canMake, { "Group B": 0, "Group A": 0 });
      assert.deepEqual(timesAt("named, nobody handed over").picture.canMake, { "Group A": 2, "Group B": 3 });
      // Ella has given her place back and is still on the board, her card saying so.
      // (Q12: in a group Publish told her about, her reply was leaving it, so
      // her seat reads as left, the group and Publish's stamp kept as leaving
      // keeps them; until then a reply left the seat active.)
      const gaveBack = timesAt("Ella gave her place back");
      assert.deepEqual(gaveBack.picture.canMake, { "Group A": 2, "Group B": 2 });
      assert.deepEqual(gaveBack.board.canMake, { "Group B": 3, "Group A": 2 });
      assert.deepEqual(gaveBack.board.cards.ella, {
        availability: "given",
        canMake: ["Group B"],
        holdsPlace: false,
        group: "Group B",
        enrolment: "withdrawn",
        emailed: true,
      });
      // Hannah has accepted the freed place and is not handed over yet.
      const accepted = timesAt("Hannah accepted, before the hand-over");
      assert.deepEqual(accepted.picture.canMake, { "Group A": 2, "Group B": 3 });
      assert.deepEqual(accepted.board.canMake, { "Group B": 2, "Group A": 2 });
      assert.equal(accepted.board.cards.hannah, undefined);
    });

    test("the picture is the programme's lead's as well as an admin's: she is shown exactly the admin's, at every moment", () => {
      assert.deepEqual(
        [...new Set(Object.values(seen.times).map((times) => [times.asLead, times.leadSeesTheAdminsPicture].join(" ")))],
        ["ok true"],
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("5. places on the board", () => {
    test("the run's track lead cannot place somebody the form put there, and is answered as for nobody", () => {
      assert.deepEqual(seen.placing.trackLeadPlaces.body, { ok: true, placed: 0, rejected: [{ uid: "amara", reason: "not-accepted" }] });
    });

    test("an admin puts the six in groups and the incubator's two in its group, and nobody is emailed", () => {
      assert.deepEqual(seen.placing.placed.body, { ok: true, placed: 6, rejected: [] });
      assert.deepEqual(seen.placing.incubator.body, { ok: true, placed: 2, rejected: [] });
      assert.equal(seen.placing.mailed, 0);
      // The board's own label for a group's slot joins its two times with
      // U+2013, as the apply page's availability chips do.
      const join = "\u2013";
      assert.deepEqual(
        timesAt("placed").board.groups,
        [
          ["Group B", `Tuesdays 18:00${join}20:00`, 3, "Rahul and Sofia"],
          ["Group A", `Thursdays 18:00${join}20:00`, 3, "Amelia"],
        ],
      );
    });

    test("until Publish nobody placed reads their group, and each facilitator reads that names are to come", () => {
      const facilitators = {
        amelia: FACILITATING([], true),
        rahul: FACILITATING([], true),
        sofia: FACILITATING([], true),
      };
      readsAre("placed, before Publish", {}, facilitators);
    });
  });

  // -------------------------------------------------------------------------
  describe("6. a test first, then Publish with the board's count", () => {
    const p = () => seen.publish;

    test("before the test the board counts six people and three facilitators, and says no test has gone", () => {
      assert.deepEqual(p().before, {
        adminOnly: false,
        emails: 9,
        people: 6,
        facilitators: 3,
        more: 0,
        noAddress: [],
        emptyGroups: [],
        refusals: [],
        test: { state: "none", when: null, who: null },
      });
    });

    test("a press before any test is refused with a sentence, and sends nothing", () => {
      assert.deepEqual(short(p().untested), [
        409,
        "Nothing was published. Nobody has sent themselves a test of these emails yet. Send yourself one before you publish.",
      ]);
      assert.equal(p().mailedByTheUntestedPress, 0);
    });

    test("the run's track lead is told the run is an admin's or its programme's lead's; that lead is shown Publish as an admin is", () => {
      const WHO =
        "This run’s people came from the application form, so only an admin or its programme’s lead can publish it or send its test.";
      assert.deepEqual(short(p().trackLeadTests), [403, WHO]);
      assert.deepEqual(short(p().trackLeadPresses), [403, WHO]);
      assert.equal(p().trackLeadSummary.adminOnly, true);
      // The programme's lead is on the run through her programme, not its
      // track leads: she is served every row it holds, so her board's Publish
      // is the admin's, count, test and all.
      assert.deepEqual(p().leadSummary, p().before);
    });

    test("the test is the first person's and the first facilitator's real email, marked, to the presser alone", () => {
      assert.deepEqual(p().test.body, { ok: true, delivery: "sent", emails: 2, recorded: true });
      assert.deepEqual(
        p().testMail.map((mail) => [mail.to, mail.subject, mail.kind]),
        [
          [address("zach"), `[TEST] ${B_SUBJECT}`, "course-test"],
          [address("zach"), "[TEST] You’re facilitating Group A: Thursdays at 6pm", "course-test"],
        ],
      );
      assert.equal(readFrom(p().testMail[0], "Hi "), B_PLACED("Amara"));
      assert.equal(
        readFrom(p().testMail[1], "Hi "),
        facilitatingWords({ first: "Amelia", group: "Group A", slot: "Thursdays at 6pm", from: "Thu 29 Oct", to: "Thu 3 Dec", room: "Room A13", size: 3, lead: "Claudia", programme: "AGI Strategy" }),
      );
    });

    test("the test tells nobody anything: no seat stamped, no facilitator marked, and everybody reads what they read before", () => {
      assert.deepEqual(p().stampedByTheTest, []);
      assert.deepEqual(p().markersAfterTheTest, []);
      assert.deepEqual(readAt("tested, before Publish"), readAt("placed, before Publish"));
    });

    test("after the test the board says when it went, and a press for any other number is refused", () => {
      assert.deepEqual(p().afterTest.test, { state: "fresh", when: "5:38pm", who: null });
      assert.equal(p().afterTest.emails, 9);
      assert.deepEqual(short(p().wrongCount), [
        409,
        "Nothing was published. Since this page loaded, publishing has come to send 9 emails, not 8. Reload the page and check again.",
      ]);
    });

    test("Publish sends exactly the board's nine: each of the six their group, then each facilitator theirs", () => {
      assert.deepEqual(p().pressed.body, {
        ok: true,
        report: {
          people: { sent: 6, held: 0, suppressed: 0 },
          facilitators: { sent: 3, held: 0, suppressed: 0 },
          failed: [],
          noAddress: [],
          alreadyTold: 0,
          more: 0,
        },
        unplaced: [],
      });
      assert.deepEqual(
        p().pressMail.map((mail) => [mail.to, mail.subject, mail.kind]),
        [
          [address("amara"), B_SUBJECT, "course-application"],
          [address("dev"), A_SUBJECT, "course-application"],
          [address("ella"), B_SUBJECT, "course-application"],
          [address("joel"), A_SUBJECT, "course-application"],
          [address("kofi"), B_SUBJECT, "course-application"],
          [address("priya"), A_SUBJECT, "course-application"],
          [address("amelia"), "You’re facilitating Group A: Thursdays at 6pm", "course-application"],
          [address("rahul"), "You’re facilitating Group B: Tuesdays at 6pm", "course-application"],
          [address("sofia"), "You’re facilitating Group B: Tuesdays at 6pm", "course-application"],
        ],
      );
    });

    test("each email says what the board placed: the person's group, its facilitators, its first session and room", () => {
      const to = (uid) => p().pressMail.find((mail) => mail.to === address(uid));
      for (const uid of ["amara", "ella", "kofi"]) assert.equal(readFrom(to(uid), "Hi "), B_PLACED(NAME[uid].split(" ")[0]), uid);
      for (const uid of ["dev", "joel", "priya"]) assert.equal(readFrom(to(uid), "Hi "), A_PLACED(NAME[uid].split(" ")[0]), uid);
      const b = { group: "Group B", slot: "Tuesdays at 6pm", from: "Tue 3 Nov", to: "Tue 8 Dec", room: "Room C20", size: 3, lead: "Claudia", programme: "AGI Strategy" };
      assert.equal(readFrom(to("rahul"), "Hi "), facilitatingWords({ ...b, first: "Rahul", withWhom: "Sofia" }));
      assert.equal(readFrom(to("sofia"), "Hi "), facilitatingWords({ ...b, first: "Sofia", withWhom: "Rahul" }));
      assert.equal(
        readFrom(to("amelia"), "Hi "),
        facilitatingWords({ first: "Amelia", group: "Group A", slot: "Thursdays at 6pm", from: "Thu 29 Oct", to: "Thu 3 Dec", room: "Room A13", size: 3, lead: "Claudia", programme: "AGI Strategy" }),
      );
    });

    // Each person's email has had the board's "Open your programme" since
  // October 2026: their own programme's page is its one link, as a
  // facilitator's group page is theirs. Until then it had no link at all.
  test("no email Publish sends carries a meeting link or a token: the only link is the reader's own programme or group page", () => {
      for (const mail of [...p().testMail, ...p().pressMail]) {
        assert.deepEqual([...`${mail.subject} ${mail.text}`.matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]), [], mail.to);
      }
      assert.deepEqual(
        Object.fromEntries(p().pressMail.map((mail) => [mail.to, mail.links])),
        {
          [address("amara")]: [programmePage(RUN)],
          [address("dev")]: [programmePage(RUN)],
          [address("ella")]: [programmePage(RUN)],
          [address("joel")]: [programmePage(RUN)],
          [address("kofi")]: [programmePage(RUN)],
          [address("priya")]: [programmePage(RUN)],
          [address("amelia")]: [groupPage(RUN, GROUP.A)],
          [address("rahul")]: [groupPage(RUN, GROUP.B)],
          [address("sofia")]: [groupPage(RUN, GROUP.B)],
        },
      );
    });

    test("each facilitator's email counts the names their roster shows once it has gone", () => {
      const read = readAt("published");
      for (const uid of ["amelia", "rahul", "sofia"]) {
        const mail = p().pressMail.find((m) => m.to === address(uid));
        const said = Number(/There are (\d+) people in the group\./.exec(mail.text)?.[1]);
        assert.equal(said, read[uid].roster.members.length, uid);
      }
    });

    test("Publish stamps exactly the six it wrote to, marks each facilitator told once, and pushes the six", () => {
      assert.deepEqual(p().stamped, AGI_PLACES);
      assert.deepEqual(p().markers, [
        ["A", "amelia", "sent"],
        ["B", "rahul", "sent"],
        ["B", "sofia", "sent"],
      ]);
      assert.deepEqual(p().pushes, ["amara", "dev", "ella", "joel", "kofi", "priya"]);
    });

    test("then the board owes nothing, and pressed again Publish sends nothing", () => {
      assert.deepEqual([p().afterPress.emails, p().afterPress.people, p().afterPress.facilitators], [0, 0, 0]);
      assert.deepEqual(p().pressedAgain.body.report, {
        people: { sent: 0, held: 0, suppressed: 0 },
        facilitators: { sent: 0, held: 0, suppressed: 0 },
        failed: [],
        noAddress: [],
        alreadyTold: 0,
        more: 0,
      });
      assert.equal(p().mailedAgain, 0);
    });

    test("after Publish each person placed reads their group, and each facilitator their group's names", () => {
      readsAre(
        "published",
        {
          amara: IN("Group B"),
          dev: IN("Group A"),
          ella: IN("Group B"),
          joel: IN("Group A"),
          kofi: IN("Group B"),
          priya: IN("Group A"),
        },
        {
          amelia: FACILITATING(["Dev", "Joel", "Priya"], false),
          rahul: FACILITATING(["Amara", "Ella", "Kofi"], false),
          sofia: FACILITATING(["Amara", "Ella", "Kofi"], false),
        },
      );
    });

    // CHANGED ON PURPOSE (Q12, the walk of stage three's H4). Until then a
    // placed person's own application page read nothing of the course run, so
    // after Publish had emailed them their group it still said the email was
    // to come and still offered "I can’t make it" as if nothing had happened.
    // Once Publish has told them, giving the place back is leaving their
    // group: the page points to their programme's page, where leaving is, and
    // says so, and the reply buttons are gone.
    test("after Publish a placed person's application page points to their programme's page, and says giving the place back now means leaving their group", () => {
      const groupOf = Object.fromEntries(PLACEMENTS.map(({ uid, groupId }) => [uid, GROUP_NAME[groupId]]));
      for (const uid of AGI_PLACES) {
        assert.equal(seen.pages.placed[uid].view.inGroup, undefined, uid);
        assert.equal(seen.pages.published[uid].text, AGI_TOLD_PAGE(groupOf[uid]), uid);
        assert.deepEqual(seen.pages.published[uid].view.inGroup, { runId: RUN, groupName: groupOf[uid], leave: "open" }, uid);
      }
      assert.equal(seen.pages.placed.kofi.text, KOFI_PAGE);
    });
  });

  // -------------------------------------------------------------------------
  describe("6b. the incubator's run is published the same way", () => {
    const i = () => seen.incubator;

    // Its one group's only facilitator is the incubator's lead, who signs
    // "You’re facilitating". Until the walk of stage one (F1) Publish counted
    // her, tested her email and sent it, a letter to herself from herself. The
    // lead of the programme that names the run is never sent it now, and the
    // board's count, the test, the press and its report all leave her out.
    test("its own test first, then its count of two: its two people, and not its lead, who facilitates and would sign", () => {
      assert.deepEqual(
        [i().before.emails, i().before.people, i().before.facilitators, i().before.emptyGroups, i().before.test.state],
        [2, 2, 0, [], "none"],
      );
      assert.deepEqual(i().test.body, { ok: true, delivery: "sent", emails: 1, recorded: true });
      assert.deepEqual(i().afterTest.test, { state: "fresh", when: "6:08pm", who: null });
      assert.equal(i().afterTest.emails, 2);
      assert.deepEqual(i().pressed.body.report, {
        people: { sent: 2, held: 0, suppressed: 0 },
        facilitators: { sent: 0, held: 0, suppressed: 0 },
        failed: [],
        noAddress: [],
        alreadyTold: 0,
        more: 0,
      });
      // The count, what went and what the report says are one number, and
      // nothing is left owed or waiting on her.
      assert.equal(i().pressed.body.report.people.sent + i().pressed.body.report.facilitators.sent, i().afterTest.emails);
      assert.equal(i().mail.filter((mail) => mail.kind === "course-application").length, i().afterTest.emails);
      assert.deepEqual([i().afterPress.emails, i().afterPress.facilitators, i().afterPress.emptyGroups], [0, 0, []]);
      assert.deepEqual(i().markers, []);
    });

    // An incubator's people were told on decision day that an email about
    // how the first week works would come, and are never told about a group.
    // Until the walk of stage one (F1) Publish sent them "Placed in a group".
    // A run an incubator names is sent "Placed on an incubator" now: the
    // weekly session, the day it starts, who runs it and their programme's
    // page, every value a record's, and never a group or a facilitator.
    test("Publish tells the incubator's people their weekly session, in their own email, and never about a group", () => {
      const subject = "Your Research incubator sessions: Mondays at 5pm";
      assert.deepEqual(
        i().mail.map((mail) => [mail.to, mail.subject, mail.kind]),
        [
          [address("zach"), `[TEST] ${subject}`, "course-test"],
          [address("omar"), subject, "course-application"],
          [address("wen"), subject, "course-application"],
        ],
      );
      for (const mail of i().mail) {
        const to = mail.to === address("zach") ? "omar" : mail.to.split("@")[0];
        assert.equal(
          readFrom(mail, "Hi "),
          `Hi ${NAME[to].split(" ")[0]}, You’ll meet on Mondays at 5pm, starting Mon 2 Nov. Where: Room B5 ` +
            "Tess runs the sessions. Week 1 is on your programme’s page. Open your programme " +
            `Tess Research incubator lead, NAISI ${FOOTER}`,
          mail.to,
        );
        // The one link is their programme's page, where week 1 is: no meeting link, no token.
        assert.deepEqual(mail.links, [`${APP_URL}/learn/${INC_RUN}`], mail.to);
        assert.deepEqual([...`${mail.subject} ${mail.text}`.matchAll(/\{[a-zA-Z]+\}/g)].map((m) => m[0]), [], mail.to);
        // Never the word, and nothing a fellowship's people are told.
        assert.doesNotMatch(`${mail.subject} ${mail.text}`, /group|facilitat|small group|campus/i, mail.to);
      }
      // And the push that mirrors the email names no group either.
      assert.deepEqual(
        i().pushes.map((push) => [push.uid, push.title, push.body]),
        INCUBATOR_PLACES.map((uid) => [uid, "You've got a place", "Research Incubator: the details are in your email."]),
      );
    });

    // CHANGED ON PURPOSE (Q12): once Publish has told them, their application
    // page points to their programme's page as a fellowship's does, and names
    // no group, which an incubator's people are never told of.
    test("then the incubator's people read their run; their application page points to their programme's page, naming no group", () => {
      const read = readAt("the incubator published");
      for (const uid of INCUBATOR_PLACES) {
        assert.deepEqual(read[uid], IN("Group A", INC_RUN, "the incubator's Group A"), uid);
        assert.equal(i().pages[uid].text, INCUBATOR_TOLD_PAGE, uid);
        assert.deepEqual(i().pages[uid].view.inGroup, { runId: INC_RUN, groupName: null, leave: "open" }, uid);
        assert.doesNotMatch(i().pages[uid].text, /group/i, uid);
      }
    });
  });

  // -------------------------------------------------------------------------
  // CHANGED ON PURPOSE (Q12, the walk of stage three's H4 and 4a's question 3).
  // Until then "I can’t make it" after Publish gave the place back on the form
  // and left Ella in Group B until an admin took her out with the runbook's
  // two steps. Once Publish has told somebody their group, the reply is
  // leaving the programme: the same leave as "Leave the programme", written
  // by the same code, in one transaction with the place on the form.
  describe("7. a place given back after Publish is leaving the programme", () => {
    const g = () => seen.gaveBack;

    test("Ella's reply takes her out of Group B at once and gives the place back; her page says she left, and the one email is the leave's, to her", () => {
      assert.equal(g().reply.status, 200);
      assert.deepEqual(g().mailedByTheReply, [[address("ella"), "You've left AGI Strategy Fellowship", "course-enrolment"]]);
      // CHANGED ON PURPOSE (somebody who leaves keeps nothing): the page said
      // "Your notes and the reading list are still on your programme’s page."
      // after the day. The programme's page now shows somebody who left only
      // that they left, so the sentence is gone, and the page is held to its
      // whole text without it.
      assert.equal(
        g().page.text,
        "Autumn 2026 · Fri 23 Oct Your application Left the programme You left AGI Strategy. That was on Wed 28 Oct. " +
          "Thanks for coming along. Changed your mind? Email ai-safety@uonsu.com and we’ll see what we can do. " +
          "Go to your programme",
      );
      // The seat as leaving leaves one: withdrawn, the day and her reason,
      // the group and Publish's stamp kept; and her seat freed in Group B.
      assert.deepEqual(g().enrolment, {
        status: "withdrawn",
        groupId: GROUP.B,
        told: true,
        droppedOutAt: "2026-10-28T09:00:00.000Z",
        dropOutReason: "The times don’t work for me",
      });
      assert.deepEqual(g().groupB, { memberCount: 2 });
      // The place on the form given back as "I can’t make it" gives it, with
      // the reason kept with her seat and not on the application.
      assert.deepEqual(g().application, { status: "withdrawn", attendance: "cant-make-it", releaseReason: null });
      // A register keeps the row of somebody who left only where it marked
      // them, and Group B first meets on Tue 3 Nov: she left before any did.
      assert.deepEqual(g().registerLeavers, []);
    });

    // The Settings panel lists Ella under "Left the programme", apart from the
    // people whose seat is still on the run. Until the follow-ups to Publish
    // of October 2026 Ella was in `gaveBack` ("No longer hold a place", with
    // the runbook's steps for a seat nothing takes off the run), and this
    // read [5, 5, ["Ella Robinson"]] of holders, onTheList and gaveBack.
    test("the Settings panel and her card on the board name her, and the times picture stops counting her", () => {
      assert.deepEqual(
        [
          g().panel.holders,
          g().panel.onTheList,
          g().panel.gaveBack,
          g().panel.left.map((person) => person.name),
          g().panel.takenOff,
        ],
        [5, 5, [], ["Ella Robinson"], []],
      );
      assert.equal(timesAt("Ella gave her place back").board.cards.ella.holdsPlace, false);
      assert.deepEqual([timesAt("Ella gave her place back").picture.holders, timesAt("Ella gave her place back").picture.canMake["Group B"]], [5, 2]);
    });

    // Nobody acts: her reply took her off the group. She reads none of the
    // run but the page that says she left (her run's gate keeps her seat, in
    // Group B, and opens no cohort page), and her facilitators' roster and
    // register name her no more (the register lists her as having left).
    test("with nobody acting, she reads nothing of Group B, and her facilitators' roster and register name her no more", () => {
      readsAre(
        "Ella gave her place back",
        {
          amara: IN("Group B"),
          dev: IN("Group A"),
          ella: { programmes: [], run: { canLearn: false, group: "Group B" } },
          joel: IN("Group A"),
          kofi: IN("Group B"),
          priya: IN("Group A"),
          omar: IN("Group A", INC_RUN, "the incubator's Group A"),
          wen: IN("Group A", INC_RUN, "the incubator's Group A"),
        },
        {
          amelia: FACILITATING(["Dev", "Joel", "Priya"], false),
          rahul: FACILITATING(["Amara", "Kofi"], false),
          sofia: FACILITATING(["Amara", "Kofi"], false),
        },
      );
    });

    // Until Q12 her seat was not free until an admin removed her, so neither
    // a group Hannah could make nor the offer had one. It is free the moment
    // she has left: the page offers Hannah Group B at once (the lead offers it
    // in 8, so nothing is pressed here).
    test("her seat is free at once: the place is free, Group B has a seat, and Hannah can be offered it", () => {
      const page = g().offerPage;
      assert.deepEqual([page.free, page.heading, page.gaveBack], [1, "Offer 1 freed place", "Ella Robinson gave theirs back."]);
      // In People in groups' order, Monday first, as every tab of the
      // programme's page lists groups (the walk of stage two's fixes, G10).
      assert.deepEqual(page.groups, [
        ["Group B", "Tuesdays at 6pm", "Tue 3 Nov", 1],
        ["Group A", "Thursdays at 6pm", "Thu 29 Oct", 0],
      ]);
      // Hannah's own week says she is free on Tuesday evenings, when Group B meets.
      assert.deepEqual(page.people.find((person) => person.uid === "hannah").freeOn, [["Group B", "Tuesday evenings"]]);
      const NO_SEAT = "No group whose time they can make has a seat and a session still to come.";
      assert.deepEqual(
        page.people.map((person) => [person.uid, person.chips, person.groups, person.cannot]),
        [
          ["hannah", ["Fits Group B"], ["Group B"], null],
          ["nell", ["Fits Group A"], [], NO_SEAT],
        ],
      );
      assert.deepEqual(page.window, { open: true, sentence: "You can offer freed places until Wed 4 Nov, the end of week 1." });
      // Nobody is owed Publish's email: she has left, and Publish waits for nobody who has.
      assert.equal(g().summaryBeforeTidying.emails, 0);
    });

    // Until the walk of stage two's fixes (G4) Publish waited for her row to
    // be changed from Accepted, naming her. Somebody who has left the run is
    // nobody to place now, so the press between goes, and sends nothing.
    test("Publish then no longer waits for her, and her row changed from Accepted emails nobody", () => {
      assert.equal(g().summaryBetween.emails, 0);
      assert.deepEqual(g().publishBetween.body, {
        ok: true,
        report: {
          people: { sent: 0, held: 0, suppressed: 0 },
          facilitators: { sent: 0, held: 0, suppressed: 0 },
          failed: [],
          noAddress: [],
          alreadyTold: 0,
          more: 0,
        },
        unplaced: [],
      });
      assert.deepEqual(g().decided.body, { ok: true });
      assert.deepEqual(g().mailedByTheRowChange, []);
      assert.deepEqual(g().rows, [
        ["amara", "accepted"],
        ["dev", "accepted"],
        ["ella", "rejected"],
        ["joel", "accepted"],
        ["kofi", "accepted"],
        ["priya", "accepted"],
      ]);
      assert.equal(timesAt("Ella taken off the run").board.cards.ella, undefined);
      assert.deepEqual([g().summaryAfter.emails, g().summaryAfter.refusals], [0, []]);
    });
  });

  // -------------------------------------------------------------------------
  describe("8. the freed place", () => {
    const f = () => seen.freed;

    test("the page offers Hannah Group B, now its seat is free, and says why Nell cannot be offered one", () => {
      const page = f().page;
      assert.deepEqual(page.window, { open: true, sentence: "You can offer freed places until Wed 4 Nov, the end of week 1." });
      assert.deepEqual(
        [page.free, page.heading, page.gaveBack, page.told],
        [1, "Offer 1 freed place", "Ella Robinson gave theirs back.", "All of them read No offer this time on Fri 23 Oct."],
      );
      assert.deepEqual(page.people, [
        {
          uid: "hannah",
          detail: "Pooled: capacity · Free Tue evenings",
          chips: ["Fits Group B"],
          groups: ["Group B"],
          cannot: null,
          toldOn: "Friday",
          freeOn: [["Group B", "Tuesday evenings"]],
        },
        {
          uid: "nell",
          detail: "Pooled: capacity · Free Thu evenings",
          chips: ["Fits Group A"],
          groups: [],
          cannot: "No group whose time they can make has a seat and a session still to come.",
          toldOn: "Friday",
          // No group she could be offered, so her email would name no time.
          freeOn: [],
        },
      ]);
      // Monday first, as every tab lists groups (the walk of stage two's fixes, G10).
      assert.deepEqual(page.groups, [
        ["Group B", "Tuesdays at 6pm", "Tue 3 Nov", 1],
        ["Group A", "Thursdays at 6pm", "Thu 29 Oct", 0],
      ]);
    });

    test("the programme's lead is shown the page an admin is shown", () => {
      assert.deepEqual(f().leadPage, f().page);
    });

    test("the lead's test and offer email her and Hannah, in the board's words, and nobody else", () => {
      assert.deepEqual(f().test.body, { ok: true, delivery: "sent", subject: "A place has come up on AGI Strategy", recorded: true });
      assert.deepEqual(f().offer.body, { ok: true, report: { offered: 1, emailed: 1, held: 0, suppressed: 0, failed: [], unconfirmed: [] } });
      assert.deepEqual(
        f().offerMail.map((mail) => [mail.to, mail.subject, mail.kind, mail.replyTo]),
        [
          [address("claudia"), "[TEST] A place has come up on AGI Strategy", "admin-test", "ai-safety@uonsu.com"],
          [address("hannah"), "A place has come up on AGI Strategy", "admissions", "ai-safety@uonsu.com"],
        ],
      );
      for (const mail of f().offerMail) {
        assert.equal(
          readFrom(mail, "Hi "),
          "Hi Hannah, On Friday we couldn’t offer you a place this term. Someone has given theirs back, and we’d love you " +
            "to have it. It meets on Tuesdays at 6pm, starting Tue 3 Nov. You told us you’re free on Tuesday evenings. Once " +
            "you accept, we’ll email you your group and room. Please accept by Fri 30 Oct. If you can’t take it, just press " +
            `No thanks. Accept your invitation No thanks Claudia AGI Strategy lead, NAISI ${FOOTER}`,
        );
        assert.deepEqual(mail.links, [`${APP_URL}/applications/${ROUND}`, `${APP_URL}/applications/${ROUND}`]);
      }
    });

    test("the offer is an invitation on Hannah's page, its seat is kept, and nobody new is handed over", () => {
      assert.equal(
        f().hannahOffered.text,
        "Autumn 2026 · Fri 23 Oct Your application Invitation You’re invited to AGI Strategy. 6 WEEKS · starts w/c 26 Oct " +
          "On Fri 23 Oct we couldn’t offer you a place this term. Someone has given theirs back, and we’d love you to have " +
          "it. Accept your invitation by Fri 30 Oct to let us know you’re coming. Accept your invitation No thanks",
      );
      const after = f().pageAfterTheOffer;
      assert.deepEqual([after.free, after.heading], [0, "No freed places to offer"]);
      // Group B is listed first, Monday first (the walk of stage two's fixes, G10).
      assert.deepEqual(after.groups[0], ["Group B", "Tuesdays at 6pm", "Tue 3 Nov", 0]);
      assert.deepEqual(after.offered, [["hannah", "Waiting for an answer, by Fri 30 Oct", "Email sent"]]);
      assert.deepEqual(f().handOverBeforeTheAnswer.body.receipt, { handedOver: 0, alreadyThere: 5 });
    });

    test("she accepts on her own page, and the next hand-over adds her alone", () => {
      assert.equal(f().accepted.status, 200);
      assert.equal(
        f().hannahAccepted.text,
        "Autumn 2026 · Fri 23 Oct Your application Accepted You’re in AGI Strategy. 6 WEEKS · starts w/c 26 Oct You’ll be " +
          "in a small group with a facilitator, on campus. You’ve accepted your invitation. I can’t make it This frees " +
          "your place for someone else.",
      );
      assert.deepEqual(readAt("Hannah accepted").hannah, NOTHING);
      assert.deepEqual(f().handedOver.body.receipt, { handedOver: 1, alreadyThere: 5 });
      assert.deepEqual(f().rows, [
        ["amara", "accepted"],
        ["dev", "accepted"],
        ["ella", "rejected"],
        ["hannah", "accepted"],
        ["joel", "accepted"],
        ["kofi", "accepted"],
        ["priya", "accepted"],
      ]);
    });

    test("placed, she is not shown her group until Publish, and her facilitators read that a name is to come", () => {
      assert.deepEqual(f().placed.body, { ok: true, placed: 1, rejected: [] });
      const read = readAt("Hannah placed, before Publish");
      assert.deepEqual(read.hannah, NOTHING);
      assert.deepEqual(read.rahul, FACILITATING(["Amara", "Kofi"], true));
      assert.deepEqual(read.sofia, FACILITATING(["Amara", "Kofi"], true));
    });

    test("Publish again owes one email, needs no new test, and sends it to her and to nobody else", () => {
      assert.deepEqual(
        [f().summary.emails, f().summary.people, f().summary.facilitators, f().summary.test],
        [1, 1, 0, { state: "fresh", when: "Tue 27 Oct at 5:38pm", who: null }],
      );
      assert.deepEqual(f().published.body.report, {
        people: { sent: 1, held: 0, suppressed: 0 },
        facilitators: { sent: 0, held: 0, suppressed: 0 },
        failed: [],
        noAddress: [],
        alreadyTold: 0,
        more: 0,
      });
      assert.deepEqual(f().pressMail.map((mail) => [mail.to, mail.subject]), [[address("hannah"), B_SUBJECT]]);
      assert.equal(readFrom(f().pressMail[0], "Hi "), B_PLACED("Hannah", HANNAH_GROUP_SIZE));
      // From the freed place's test to the end: the lead's test, the offer, and her group.
      assert.deepEqual(f().allMail, [
        [address("claudia"), "[TEST] A place has come up on AGI Strategy"],
        [address("hannah"), "A place has come up on AGI Strategy"],
        [address("hannah"), B_SUBJECT],
      ]);
    });

    test("after it she reads Group B, and Group B's facilitators read her name; the seat her offer kept is hers", () => {
      const read = readAt("Hannah published");
      assert.deepEqual(read.hannah, IN("Group B"));
      assert.deepEqual(read.rahul, FACILITATING(["Amara", "Hannah", "Kofi"], false));
      assert.deepEqual(read.sofia, FACILITATING(["Amara", "Hannah", "Kofi"], false));
      assert.deepEqual(f().groupB, { memberCount: 3 });
    });

    // The programme's own list counts a place held by `holdingOf`, which reads
    // an accepted freed place as one. Until the walk of stage one (F7) her row
    // kept the lead's decision, Pool, and was counted under Pooled, while the
    // head counted her place. Now a freed place accepted reads as an
    // invitation accepted does: her row stands as accepted, under the Accepted
    // tab and out of the Pooled one, so the tabs, the chip and the head agree.
    // She ranked the programme, so she is not `byInvitation`.
    test("the programme's list and her application read Hannah's freed place as accepted: its tabs, her row and its head agree", () => {
      for (const list of [f().listOnceAccepted, f().listAtTheEnd]) {
        assert.deepEqual(list, {
          counts: { all: 7, toReview: 0, accepted: 6, pooled: 1, declined: 0 },
          placed: 6,
          placesLeft: 0,
          hannah: { standing: "accepted", byInvitation: false, freedPlace: true, withdrawn: false },
        });
        // The tabs say what the head says: every place held is under Accepted.
        assert.equal(list.counts.accepted, list.placed);
      }
      // Her application, as the lead opens it, says the same, and keeps the
      // lead's Pool as the record of what was decided.
      for (const application of [f().applicationOnceAccepted, f().applicationAtTheEnd]) {
        assert.deepEqual(application, { standing: "accepted", byInvitation: false, freedPlace: true, kind: "pool", told: true });
      }
    });

    test("Nell, pooled too, was emailed once, on decision day, and never after", () => {
      assert.deepEqual(world.mail.filter((mail) => mail.to === address("nell")).map((mail) => mail.subject), ["Your NAISI application"]);
      assert.deepEqual(readAt("Hannah published").nell, NOTHING);
    });
  });

  // -------------------------------------------------------------------------
  describe("9. the incubator's people read “It helps us plan.”", () => {
    // CHANGED ON PURPOSE (Q12): "I’m coming" and its line are offered only
    // until Publish has told somebody their group. The fellowship's run is
    // published by the "published" moment and the incubator's only after it,
    // so each kind is held to its line while its people can press it, and to
    // the page that points to their programme once they are told; an
    // incubator's people never read the word group at any moment.
    test("on their own page until they are told, and never the word group; the fellowship's people read “It helps us plan groups.”", () => {
      const INCUBATOR_PAGE =
        "Your application Research Incubator Accepted Autumn 2026 · Fri 23 Oct You’re in Research incubator. 10 WEEKS · " +
        "starts w/c 2 Nov We’ll email you before you start with how the first week works. I’m coming Optional. It " +
        "helps us plan. I can’t make it This frees your place for someone else. Questions? ai-safety@uonsu.com";
      const told = { placed: { incubator: false, fellowship: false }, published: { incubator: false, fellowship: true }, end: { incubator: true, fellowship: true } };
      for (const moment of ["placed", "published", "end"]) {
        for (const uid of INCUBATOR_PLACES) {
          const { view, text } = seen.pages[moment][uid];
          assert.deepEqual([view.kind, view.comingHelps, view.next], ["place", "It helps us plan.", "We’ll email you before you start with how the first week works."], `${moment}: ${uid}`);
          assert.equal(text, told[moment].incubator ? INCUBATOR_TOLD_PAGE : INCUBATOR_PAGE, `${moment}: ${uid}`);
          assert.doesNotMatch(text, /group/i, `${moment}: ${uid}`);
        }
        assert.equal(seen.pages[moment].kofi.view.comingHelps, "It helps us plan groups.", moment);
        assert.equal(seen.pages[moment].kofi.text, told[moment].fellowship ? AGI_TOLD_PAGE("Group B") : KOFI_PAGE, moment);
      }
    });
  });
});
