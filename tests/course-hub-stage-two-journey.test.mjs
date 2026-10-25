/**
 * STAGE TWO OF THE COURSE HUB: one term from Publish into its first three
 * weeks, through every part built for it at once.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Stage two was built as pieces, each with suites of its own on sample
 * documents shaped the way that piece expects: a programme's lead acting on
 * the run their programme names (the Groups tab's People in groups and
 * Facilitators, Publish and Remove for the lead), the lead's Overview and
 * Attendance tabs (the grid, Remind, the CSV), updates (the Messages tab, the
 * member's Updates, a facilitator's "Write to Group B"), pitching week on an
 * incubator's run, and the fixes from the walk through stage one (the
 * incubator's own placement email, the lead never sent "You’re
 * facilitating"). What none of them can see is the seam between two of
 * them: a number one screen counts and another lists, a stamp one writes and
 * another reads, an email that promises what a page does not show.
 *
 * So this file runs ONE term through the real route handlers and pages of
 * all of them, against one database, from decision day to the end of week
 * 3, and at each moment asserts that what the lead's tabs say agrees with
 * what each facilitator and each member is shown:
 *
 *  1. Decision day, the runs named, the hand-over and the placements, made
 *     smaller from the stage one journey (`course-hub-stage-one-journey`),
 *     which asserts them in full. Then, before Publish, the lead writes to
 *     everyone and to the facilitators, and a facilitator to their group.
 *  2. Each programme's lead tests and presses Publish.
 *  3. Week 1's updates, emailed: the count on each button, who each email
 *     reaches, what it says.
 *  4. The registers, marked and finished by the facilitators, read by the
 *     lead, shown to each person once finished, and next week's email.
 *  5. The lead adds facilitators on the Facilitators view; Publish tells them.
 *  6. The lead removes somebody who has left, and what that does to the
 *     grid, the registers and her next Publish.
 *  7. Somebody stops the weekly email, and what the next update does.
 *  8. Pitching week on the incubator: its lead opens week 3, its people
 *     pitch and pick, each sees their own picks, the lead sees the counts,
 *     and the group's session closes it.
 *  9. A register left unfinished overnight: the Overview, Remind, the CSV.
 * 10. At every moment the story looked around: the Messages tab's counts,
 *     each facilitator's page, roster and register, the lead's register and
 *     grid, and every member's updates and marks, agreeing.
 *
 * Where two pieces disagree today the test pins what is so and its comment
 * names the disagreement (G1 to G9, written up in the walk's notes), so a
 * change to either piece has to change this file on purpose.
 *
 * ## How it is laid out
 *
 * As the stage one journey: `tellTheStory()` makes every request once, in
 * order, and writes down what came back (`seen`); the tests read what was
 * written down. A request that goes wrong is recorded like any other and the
 * story carries on, so one disagreement between two pieces is one failing
 * test and does not hide the ones after it. At each named moment
 * `lookAround()` reads everything everybody is shown, one person at a time:
 * the world has one signed-in user, so no two requests are ever in flight.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route handler named below, the libraries behind them, the
 * access predicates, the rate limiters, the email templates, the pages'
 * loaders and the server pages it draws (the Messages, Attendance and
 * Overview tabs, a facilitator's group page, the pitches list) and the
 * client views it draws from a route's own answer (the member's Updates, the
 * pitching page). Stubbed: `server-only`, `next/server`, `next/link`,
 * `next/navigation`, the stylesheets, the Admin SDK's sentinels and handle,
 * the session, the view-as guard, the push mirrors, `sendEmail`, which
 * writes down what it was handed, and the three
 * cards of the group page that read in the browser (the session card, the
 * roster and the register, whose routes are asked here directly). No message
 * can leave this process. The clock is the runner's, set by the story.
 */
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
// The unsubscribe links of the course emails are signed for real.
process.env.EVENTS_TOKEN_SECRET = "a-test-signing-key-that-is-long-enough-to-pass";
for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "EMAIL_AUDIENCE", "EMAIL_GMAIL_ONLY_MODE"]) {
  delete process.env[name];
}

const world = {
  db: null,
  courseDb: null,
  /** True for the length of one request to a course route or one page drawn. */
  course: false,
  user: null,
  /** Every message handed to the one mail door, in order. */
  mail: [],
  /** Every notification handed to a push mirror. */
  pushes: [],
  /** The roster route's answer the group page's roster card is drawn from, while one is drawn. */
  roster: null,
  /** The board route's answer the allocation board is drawn from, while it is drawn. */
  board: null,
};
globalThis.__stageTwo = { world, h: createElement };
const W = "globalThis.__stageTwo.world";
const H = "globalThis.__stageTwo.h";

/** A stand-in for every stylesheet a drawn page imports. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = [
  "./status.module.css",
  "./editor.module.css",
  "@/features/applications/editor/editor.module.css",
  "./kit.module.css",
  "@/features/applications/kit/kit.module.css",
  "./ProgrammeFrame.module.css",
  "./Chip.module.css",
  "./InitialsChip.module.css",
  "./Button.module.css",
  "./Input.module.css",
  "./Select.module.css",
  "./Switch.module.css",
  "./Card.module.css",
  "./Updates.module.css",
  "./UpdateComposer.module.css",
  "./Messages.module.css",
  "@/features/courses/updates/Messages.module.css",
  "./GroupsViews.module.css",
  "./ProgrammePitches.module.css",
  "./PitchingWeek.module.css",
  "./ProgrammeAttendance.module.css",
  "./ProgrammeOverview.module.css",
  "./SessionCard.module.css",
  "./GroupRoster.module.css",
  "./EmptyState.module.css",
  "./Skeleton.module.css",
  "./AllocationBoard.module.css",
  "./AllocationPublish.module.css",
  "./ActionToast.module.css",
  "./Badge.module.css",
  "./Dropdown.module.css",
];
/** A card of the group page that reads in the browser: it draws its own name. */
const CARD = (name) => `export default function ${name}() { return ${H}("div", null, "[${name}]"); }`;
const MAIL_DOOR =
  "export async function sendEmail(args) {\n" +
  `  ${W}.mail.push(args);\n` +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}\n" +
  "export async function sendPushToUid() {\n" +
  "  return { sent: 0, pruned: 0, deferred: 0, failed: 0, retried: 0 };\n" +
  "}";

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
      ) + " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
    ],
    ["@/lib/firebase/admin", `export function getAdminDb() { return ${W}.course ? ${W}.courseDb : ${W}.db; }`],
    ["@/lib/firebase/session", `export async function getCurrentUser() { return ${W}.user; }`],
    // The page gates read the session through their own relative import.
    ["./session", `export async function getCurrentUser() { return ${W}.user; }`],
    [
      "@/lib/firebase/impersonation",
      "export async function assertNotImpersonating() { return null; }\n" +
        "export async function getImpersonator() { return null; }\n" +
        "export function markerIsLive(marker, currentUid) { return marker !== null && marker.actorUid !== currentUid; }",
    ],
    ["@/lib/email/send", MAIL_DOOR],
    ["./send", MAIL_DOOR],
    [
      "@/lib/push/courseNotifications",
      `export async function mirrorCourseDecisionToPush(uid, note) { ${W}.pushes.push({ uid, ...note }); }`,
    ],
    [
      "@/lib/push/noticeNotifications",
      `export async function sendNoticePush(uid, note) { ${W}.pushes.push({ uid, ...note }); return false; }`,
    ],
    // The pages, drawn to HTML as the server sends them.
    ["next/link", `export default ({ href, className, children }) => ${H}('a', { href, className }, children);`],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\n" +
        "export function usePathname() { return '/'; }\n" +
        "export function useSelectedLayoutSegment() { return null; }",
    ],
    // Before the page's script arrives, as the server draws it.
    ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
    ["@/features/courses/SessionCard", CARD("SessionCard")],
    ["@/features/courses/GroupRoster", CARD("GroupRoster")],
    ["@/features/courses/AttendanceGrid", CARD("AttendanceGrid")],
    // The allocation board's data, as its hook holds it once the board route
    // has answered: the route is asked first, and the board drawn from that.
    [
      "./useAllocation",
      "export function useAllocation() {\n" +
        `  return { data: ${W}.board, loading: false, error: null, reload() {}, place: async () => ({ ok: true }),\n` +
        "    publishAllocation: async () => ({ ok: true }), sendPublishTest: async () => ({ ok: true }), removeEnrolment: async () => ({ ok: true }) };\n" +
        "}\n" +
        "export default useAllocation;",
    ],
    // The roster card's data, as its hook holds it once the roster route has
    // answered: the route is asked first, and the card is drawn from that.
    [
      "./useGroupRoster",
      "export function useGroupRoster() {\n" +
        `  const data = ${W}.roster;\n` +
        "  return { group: data ? data.group : null, facilitators: data ? data.facilitators : [], members: data ? data.members : [],\n" +
        "    notYetTold: data ? data.notYetTold === true : false, memberCount: data ? data.members.length : null,\n" +
        "    loading: false, error: null, reload() {} };\n" +
        "}",
    ],
    ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
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
  list: await formRoute(R, "programmes", PG, "applications"),
  decision: await formRoute(R, "applications", "[uid]", "decision"),
  pool: await formRoute(R, "pool"),
  send: await formRoute(R, "send"),
  sendTest: await formRoute(R, "send", "test"),
  run: await formRoute(R, "programmes", PG, "run"),
  handOver: await formRoute(R, "programmes", PG, "run", "hand-over"),
  remind: await formRoute(R, "programmes", PG, "registers", "remind"),
  csv: await formRoute(R, "programmes", PG, "attendance", "export"),
};
const courseRoutes = {
  runStatus: await courseRoute("runs", "[runId]", "status"),
  facilitators: await courseRoute("groups", "[groupId]", "facilitators"),
  runFacilitators: await courseRoute("runs", "[runId]", "facilitators"),
  board: await courseRoute("runs", "[runId]", "allocation"),
  allocate: await courseRoute("runs", "[runId]", "allocate"),
  publishTest: await courseRoute("runs", "[runId]", "allocation", "publish", "test"),
  publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
  remove: await courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove"),
  decide: await courseRoute("runs", "[runId]", "applications", "[uid]", "decide"),
  me: await courseRoute("me"),
  overview: await courseRoute("runs", "[runId]", "overview"),
  roster: await courseRoute("groups", "[groupId]", "roster"),
  register: await courseRoute("groups", "[groupId]", "attendance"),
  finish: await courseRoute("groups", "[groupId]", "attendance", "push"),
  updates: await courseRoute("runs", "[runId]", "updates"),
  pitching: await courseRoute("runs", "[runId]", "pitching"),
  pitch: await courseRoute("runs", "[runId]", "pitching", "pitch"),
  picks: await courseRoute("runs", "[runId]", "pitching", "picks"),
};
/** What the pages read before they draw. */
const lib = {
  runAccess: await loadTs(join("features", "courses", "runAccess.ts")),
  programmeRun: await loadTs(join("lib", "applications", "handover", "programmeRun.ts")),
  pitches: await loadTs(join("lib", "applications", "handover", "pitchesLoad.ts")),
  pitching: await loadTs(join("lib", "courses", "pitching", "load.ts")),
  /** The allocation board's rail: the function the board itself asks. */
  boardTally: (await loadTs(join("features", "courses", "allocationTally.ts"))).boardTally,
  /** The register reminder's words: the function the job and Remind both ask. */
  reminderWords: (await loadTs(join("lib", "email", "registerReminderEmail.ts"))).registerReminderWords,
  /** The Groups tab's Times view. */
  times: await loadTs(join("lib", "applications", "handover", "timesLoad.ts")),
  /** The cohort list's own writer, as Publish subscribes somebody it tells. */
  subscriptions: await loadTs(join("lib", "firestore", "subscriptions.ts")),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const LEARN = join("app", "(app)", "learn", "[runId]");
const pages = {
  messages: (await loadTs(join(TABS, "messages", "page.tsx"))).default,
  attendance: (await loadTs(join(TABS, "attendance", "page.tsx"))).default,
  overview: (await loadTs(join(TABS, "overview", "page.tsx"))).default,
  pitches: (await loadTs(join(TABS, "groups", "pitches", "page.tsx"))).default,
  group: (await loadTs(join(LEARN, "group", "[groupId]", "page.tsx"))).default,
};
const unsubscribe = await loadTs(join("app", "api", "unsubscribe", "route.ts"));
const { RunUpdatesView } = await loadTs(join("features", "courses", "updates", "RunUpdates.tsx"));
const { default: PitchingWeek } = await loadTs(join("features", "courses", "pitching", "PitchingWeek.tsx"));
/** The session card itself, as the run home draws it (the group page's copy of it is stood in, above). */
const { default: SessionCard } = await loadTs(join("features", "courses", "SessionCard.tsx"));
/** The group page's roster card itself, drawn from the roster route's answer. */
const { default: GroupRosterCard } = await loadTs(join("features", "courses", "GroupRoster.tsx"));
/** People in groups' board itself, drawn from the board route's answer. */
const { default: AllocationBoard } = await loadTs(join("features", "courses", "AllocationBoard.tsx"));

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * The days of the term, in London. The clocks go back on Sun 25 Oct, so a
 * London hour is the same hour in UTC from then on.
 */
const WHEN = {
  building: "2026-10-05T09:00:00Z",
  applying: "2026-10-10T10:00:00Z",
  deciding: "2026-10-20T10:00:00Z",
  /** Fri 23 Oct, 9am. */
  decisionDay: "2026-10-23T08:00:00Z",
  /** Sat 24 Oct: the runs are named while drafts, and moved on. */
  naming: "2026-10-24T10:00:00Z",
  /** Mon 26 Oct. */
  handingOver: "2026-10-26T10:00:00Z",
  placing: "2026-10-26T14:00:00Z",
  /** Tue 27 Oct, 9am: the lead writes before anybody is told their group. */
  postingEarly: "2026-10-27T09:00:00Z",
  /** Tue 27 Oct, 5:38pm: the lead's test, then her Publish. */
  publishing: "2026-10-27T17:38:00Z",
  /** Tue 27 Oct, 6:08pm: the incubator's lead's test, then hers. */
  publishingIncubator: "2026-10-27T18:08:00Z",
  /** Wed 28 Oct, 9am: week 1's updates. */
  weekOneUpdates: "2026-10-28T09:00:00Z",
  /** Thu 29 Oct: Group A's first session is 6pm to 8pm. */
  groupAWeek1Marked: "2026-10-29T19:30:00Z",
  groupAWeek1Finished: "2026-10-29T20:15:00Z",
  /** Fri 30 Oct: the lead adds a facilitator to Group A, and tells him. */
  staffing: "2026-10-30T10:00:00Z",
  /** Mon 2 Nov: the incubator's first session is 5pm to 7pm. */
  incubatorWeek1: "2026-11-02T19:15:00Z",
  /** Tue 3 Nov: Group B's first session. */
  groupBWeek1Marked: "2026-11-03T19:30:00Z",
  groupBWeek1Finished: "2026-11-03T20:15:00Z",
  /** Wed 4 Nov: somebody tells the lead they have left. */
  leaving: "2026-11-04T10:00:00Z",
  /** Thu 5 Nov: Group A's second session. */
  groupAWeek2: "2026-11-05T20:15:00Z",
  /** Tue 10 Nov: Group B's second session, and the incubator's lead opens week 3. */
  groupBWeek2: "2026-11-10T20:15:00Z",
  openingPitching: "2026-11-10T21:00:00Z",
  /** Wed 11 Nov: an update to one group, and the first pitches. */
  oneGroup: "2026-11-11T09:00:00Z",
  pitching: "2026-11-11T12:00:00Z",
  /** Thu 12 Nov: picks, and Group A's third session. */
  picking: "2026-11-12T12:00:00Z",
  groupAWeek3: "2026-11-12T20:15:00Z",
  /** Mon 16 Nov: the incubator's pitching session starts at 5pm. */
  beforeTheClose: "2026-11-16T16:59:00Z",
  afterTheClose: "2026-11-16T17:00:00Z",
  thatEvening: "2026-11-16T21:00:00Z",
  /** Tue 17 Nov: the day after, and Group B's third session. */
  nextDay: "2026-11-17T09:00:00Z",
  groupBWeek3: "2026-11-17T19:45:00Z",
  /** Wed 18 Nov, 9am: Group B's register of Tuesday isn't finished. */
  registerNotFinished: "2026-11-18T09:00:00Z",
  finishedLate: "2026-11-18T10:00:00Z",
  downloading: "2026-11-18T11:00:00Z",
  /** The incubator's second and third sessions, Mondays 5pm to 7pm. */
  incubatorWeek2: "2026-11-09T19:15:00Z",
  incubatorWeek3: "2026-11-16T19:15:00Z",
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
  // AGI Strategy's lead.
  ["claudia", "Claudia Reyes", "committee", true],
  // The Research incubator's lead, who runs its one group herself.
  ["tess", "Tess Okoro", "committee", true],
  // AGI Strategy run's track lead, named on nothing on the form.
  ["yusuf", "Yusuf Demir", "committee", true],
  // Facilitators: Group A's, Group B's two, and the one the lead adds to Group A.
  ["amelia", "Amelia Hart", "member", false],
  ["rahul", "Rahul Mehta", "member", false],
  ["sofia", "Sofia Rossi", "member", false],
  ["tom", "Tom Fletcher", "member", false],
  // AGI Strategy's six places.
  ["amara", "Amara Okafor", "member", false],
  ["dev", "Dev Patel", "member", false],
  ["ella", "Ella Robinson", "member", false],
  ["joel", "Joel Adeyemi", "member", false],
  ["kofi", "Kofi Mensah", "member", false],
  ["priya", "Priya Nair", "member", false],
  // Pooled by AGI Strategy and told "No offer this time": on nothing all term.
  ["hannah", "Hannah Brooks", "member", false],
  ["nell", "Nell Carter", "member", false],
  // The Research incubator's four places.
  ["omar", "Omar Haddad", "member", false],
  ["wen", "Wen Li", "member", false],
  ["lena", "Lena Fischer", "member", false],
  ["tariq", "Tariq Mensah", "member", false],
];
const FIRST = Object.fromEntries(CAST.map(([uid, name]) => [uid, name.split(" ")[0]]));
/** Each person's whole name, as the lead's tabs name them, and the name they go by, from it. */
const FULL = Object.fromEntries(CAST.map(([uid, name]) => [uid, name]));
const FIRST_OF = Object.fromEntries(CAST.map(([uid, name]) => [name, FIRST[uid]]));
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
// Making a request, and drawing a page
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
    // What a route draws or sends itself (the unsubscribe page, a CSV) is a
    // real Response, read byte for byte with a byte-order mark kept.
    if (response instanceof Response) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { status: response.status, body: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) };
    }
    return { status: response.status, body: structuredClone(response.body) };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    world.course = false;
  }
}
const courseCall = (who, handler, params, options = {}) => call(who, handler, params, { ...options, course: true });

/**
 * Something read for each person in turn, as `{ uid: answer }`. Never at once:
 * the world has one signed-in user, so two requests in flight would read as
 * whoever set it last.
 */
async function eachOf(uids, read) {
  const out = {};
  for (const uid of uids) out[uid] = await read(uid);
  return out;
}

/** Everything the story writes down. `steps` is every request it depended on, with the status it expected. */
const seen = { crashed: null, steps: [], logged: [], looks: {} };

async function step(name, expected, who, handler, params, options) {
  const response = await call(who, handler, params, options);
  seen.steps.push({ name, expected, status: response.status, error: response.body?.error ?? null });
  return response;
}
const courseStep = (name, expected, who, handler, params, options = {}) =>
  step(name, expected, who, handler, params, { ...options, course: true });

/** Text out of HTML, as somebody reads it: every tag is a gap, entities are read. */
function pageText(html) {
  return html
    // React's marker between two pieces of text in one element is no gap.
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every element below `element` whose component is called `name`. */
function find(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) find(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element);
  for (const value of Object.values(element.props ?? {})) find(value, name, out);
  return out;
}

/** A server page as `who` is served it: its element, its text, or where it sent them. */
async function draw(Page, who, params) {
  world.user = sessionOf(who);
  world.course = true;
  try {
    const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}) });
    return { element, text: pageText(renderToStaticMarkup(element)), to: null };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") return { element: null, text: `[threw] ${err?.stack ?? err}`, to: null };
    return { element: null, text: "", to: err.to };
  } finally {
    world.course = false;
  }
}

// ---------------------------------------------------------------------------
// The term's programmes, courses, runs and groups
// ---------------------------------------------------------------------------

let ROUND = "";
/** Programme ids and question set ids, as the editor minted them. */
const P = { agi: "", inc: "" };
const SET = { fellowships: "", incubator: "", agi: "", incStream: "", facilitator: "" };
const Q = {};

const COURSE = "agi-strategy-fellowship__st2crs01";
const RUN = "agi-strategy-fellowship-autumn-2026__st2run01";
const GROUP = {
  /** Thursdays 6pm to 8pm, Room A13, Amelia (and Tom, from Fri 30 Oct). */
  A: "autumn-2026-group-a__st2grp0a",
  /** Tuesdays 6pm to 8pm, Room C20, Rahul and Sofia. */
  B: "autumn-2026-group-b__st2grp0b",
};
const FACILITATORS = { [GROUP.A]: ["amelia"], [GROUP.B]: ["rahul", "sofia"] };

/**
 * The Research incubator's course and run. The plan for this term gives each
 * incubator one group with its lead facilitating it, and a pitching week.
 */
const INC_COURSE = "research-incubator__st2crs02";
const INC_RUN = "research-incubator-autumn-2026__st2run02";
const INC_GROUP = "autumn-2026-incubator__st2grp0i";
/** Week 3's two readings: the papers a pitch replicates. */
const READING = { probes: "m_probes", reward: "m_reward" };
/** The incubator's run settings for pitching week, as its run editor saves them. */
const PITCH_SETTINGS = { pickLimit: 2, teamSizeMin: 2, teamSizeMax: 3, teamsMadeOn: "2026-11-23" };

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
function runDocs(runId, courseId, courseTitle, startDate, weeks, groupCount, extra = {}) {
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
      ...extra,
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

/**
 * The incubator's draft run of seven weeks from Mon 2 Nov, its one group
 * (Mondays 5pm, Room B5), and its pitching week as the run editor and the
 * week editor leave them: week 3 ticked, with its two readings, not yet
 * published, and the run's pitching settings set.
 */
function incubatorRunSide() {
  const docs = {
    ...runDocs(INC_RUN, INC_COURSE, "Research Incubator", "2026-11-02", 7, 1, { pitchSettings: PITCH_SETTINGS }),
    [`courseGroups/${INC_GROUP}`]: groupOn(INC_RUN, INC_COURSE, "Group A", 1, "17:00", "Room B5", 4),
  };
  docs[`courseRuns/${INC_RUN}/weeks/w03`] = {
    ...docs[`courseRuns/${INC_RUN}/weeks/w03`],
    title: "Pitching week",
    pitching: true,
    materials: [
      { id: READING.probes, type: "reading", title: "Probes that transfer", url: "https://example.com/probes", minutes: 30, required: true },
      { id: READING.reward, type: "reading", title: "Reward hacking in the wild", url: "https://example.com/reward", minutes: 25, required: true },
    ],
  };
  return docs;
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
const MONDAY_EVENING = [1, "16:30", "20:00"];

/** Who applies, what they rank, and when they are free. */
const APPLIES = {
  amara: { ranked: ["agi"], week: [TUESDAY_EVENING] },
  dev: { ranked: ["agi"], week: [] },
  ella: { ranked: ["agi"], week: [[2, "17:00", "21:00"]] },
  joel: { ranked: ["agi"], week: [THURSDAY_EVENING] },
  kofi: { ranked: ["agi"], week: [TUESDAY_EVENING, THURSDAY_EVENING] },
  priya: { ranked: ["agi"], week: [THURSDAY_EVENING] },
  hannah: { ranked: ["agi"], week: [TUESDAY_EVENING] },
  nell: { ranked: ["agi"], week: [THURSDAY_EVENING] },
  omar: { ranked: ["inc"], week: [MONDAY_EVENING] },
  wen: { ranked: ["inc"], week: [MONDAY_EVENING] },
  lena: { ranked: ["inc"], week: [MONDAY_EVENING] },
  tariq: { ranked: ["inc"], week: [MONDAY_EVENING] },
};
const APPLICANTS = Object.keys(APPLIES);
/** AGI Strategy's six places, and who goes in which group. */
const AGI_PLACES = ["amara", "dev", "ella", "joel", "kofi", "priya"];
const IN_A = ["dev", "joel", "priya"];
const IN_B = ["amara", "ella", "kofi"];
const POOLED = ["hannah", "nell"];
const INCUBATOR_PLACES = ["omar", "wen", "lena", "tariq"];
const MEMBERS = [...AGI_PLACES, ...POOLED, ...INCUBATOR_PLACES];

const params = () => ({ roundId: ROUND });
const of = (name) => ({ roundId: ROUND, programmeId: P[name] });
const groupDoc = (groupId) => world.db.read(`courseGroups/${groupId}`);

/** What the mail door has been handed since `from`, in order. */
const mailSince = (from) => world.mail.slice(from);

/** Characters that take up no room on the page: a preview's padding, a button's hair spaces. */
const UNSEEN = /[\u00a0\u00ad\u034f\u200a-\u200f\u2060-\u2064\ufeff]/g;

/** Text out of an email's HTML, as somebody reads it: the tags inside a sentence go without a gap. */
function mailText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    // React's marker between two pieces of text in one element is no gap.
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(?:strong|em|b|i|u|span|a)(?:\s[^>]*)?>/gi, "")
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
    text: mailText(html),
    links: [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1].replace(/&amp;/g, "&")),
  };
}

// ---------------------------------------------------------------------------
// Decision day to the placements, as the stage one journey tells it
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
    ["inc", { places: 4, starts: "w/c 2 Nov", facts: "7 WEEKS", useScores: false }],
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

  at("applying");
  for (const who of APPLICANTS) {
    later();
    const plan = APPLIES[who];
    const look = await call(who, routes.application.GET, params());
    const grid = look.body?.form?.availabilityGrid;
    const answers = {};
    if (plan.ranked.includes("agi")) {
      answers[SET.fellowships] = { [Q.fellowships.why]: "I want to understand it." };
      answers[SET.agi] = { [Q.agi.event]: "A new law came into force." };
    }
    if (plan.ranked.includes("inc")) answers[SET.incubator] = { [Q.incubator.idea]: "Measure it." };
    const draft = {
      aboutYou: look.body?.account,
      rankedProgrammeIds: plan.ranked.map((name) => P[name]),
      wantsToFacilitate: false,
      answers,
      availability: paint(grid, plan.week),
      suMembership: "yes",
    };
    await step(`${who} saves`, 200, who, routes.application.PUT, params(), { body: { draft } });
    await step(`${who} sends`, 200, who, routes.applicationSend.POST, params(), { body: {} });
  }

  at("deciding");
  await step("AGI Strategy's lead accepts six", 200, "claudia", routes.list.POST, of("agi"), { body: { decision: "accept", uids: AGI_PLACES } });
  for (const who of POOLED) {
    await step(`she pools ${who}`, 200, "claudia", routes.decision.PUT, { roundId: ROUND, uid: who }, {
      body: { programmeId: P.agi, decision: "pool", poolReason: "capacity" },
    });
  }
  await step("the incubator's lead accepts four", 200, "tess", routes.list.POST, of("inc"), { body: { decision: "accept", uids: INCUBATOR_PLACES } });
  for (const who of POOLED) {
    await step(`no offer for ${who}`, 200, "zach", routes.pool.PUT, params(), { body: { uid: who, outcome: { kind: "no-offer" } } });
  }

  at("decisionDay");
  await step("the decision-day test", 200, "zach", routes.sendTest.POST, params(), { body: { kind: "accepted" } });
  const board = (await call("zach", routes.send.GET, params())).body?.board;
  const emails = board ? board.pending.emails + board.owed.people.length : -1;
  await step("the send", 200, "zach", routes.send.POST, params(), { body: { emails } });
}

async function namedHandedOverPlaced() {
  at("naming");
  for (const [path, data] of Object.entries(runSide())) world.db.seed(path, data);
  for (const [path, data] of Object.entries(incubatorRunSide())) world.db.seed(path, data);
  for (const [groupId, uids] of Object.entries(FACILITATORS)) {
    await courseStep(`${groupId}'s facilitators`, 200, "zach", courseRoutes.facilitators.POST, { groupId }, { body: { uids } });
  }
  await courseStep("the incubator group's facilitator is its lead", 200, "zach", courseRoutes.facilitators.POST, { groupId: INC_GROUP }, { body: { uids: ["tess"] } });
  for (const [name, runId] of [["agi", RUN], ["inc", INC_RUN]]) {
    await step(`an admin names ${name}'s run while it is a draft`, 200, "zach", routes.run.PUT, of(name), { body: { runId } });
    await courseStep(`an admin moves ${name}'s run on from draft`, 200, "zach", courseRoutes.runStatus.POST, { runId }, { body: { status: "applications-open" } });
  }
  // The run's track lead, through the route that staffs a run.
  const runRoles = await courseRoute("runs", "[runId]", "roles");
  await courseStep("Yusuf is the run's track lead", 200, "zach", runRoles.POST, { runId: RUN }, { body: { trackLeadUids: ["yusuf"] } });

  at("handingOver");
  await step("an admin hands over AGI Strategy's place holders", 200, "zach", routes.handOver.POST, of("agi"));
  await step("an admin hands over the incubator's place holders", 200, "zach", routes.handOver.POST, of("inc"));

  // The lead places her people on the Groups tab's People in groups, and the
  // incubator's lead hers: the lead's power since the lead's access (#86).
  at("placing");
  await courseStep("the lead puts the six in groups", 200, "claudia", courseRoutes.allocate.POST, { runId: RUN }, {
    body: { placements: [...IN_A.map((uid) => ({ uid, groupId: GROUP.A })), ...IN_B.map((uid) => ({ uid, groupId: GROUP.B }))] },
  });
  await courseStep("the incubator's lead puts her four in its group", 200, "tess", courseRoutes.allocate.POST, { runId: INC_RUN }, {
    body: { placements: INCUBATOR_PLACES.map((uid) => ({ uid, groupId: INC_GROUP })) },
  });
}

// ---------------------------------------------------------------------------
// What everybody is shown, at one moment
// ---------------------------------------------------------------------------

const GROUP_NAME = { [GROUP.A]: "Group A", [GROUP.B]: "Group B", [INC_GROUP]: "the incubator's Group A" };

/** The board's `publish` summary: the number on its button, and the last test. */
const publishSummary = async (who, runId) => (await courseCall(who, courseRoutes.board.GET, { runId })).body?.publish ?? null;

/** The updates a person reads on their programme page: the route's answer, and the section drawn from it. */
async function updatesOf(who, runId) {
  const answer = await courseCall(who, courseRoutes.updates.GET, { runId });
  if (answer.status !== 200) return { refused: answer.status };
  return {
    titles: answer.body.updates.map((update) => update.title),
    lines: answer.body.updates.map((update) => `${update.authorFirst} · ${update.toWords} · ${update.postedOn}`),
    drawn: pageText(renderToStaticMarkup(createElement(RunUpdatesView, { updates: answer.body.updates, showAll: false }))),
  };
}

/** A member's programmes (the member area's route) and their own marks (the programme page's route). */
async function memberSees(who) {
  const me = await courseCall(who, courseRoutes.me.GET, {});
  const runId = INCUBATOR_PLACES.includes(who) ? INC_RUN : RUN;
  const overview = await courseCall(who, courseRoutes.overview.GET, { runId });
  return {
    programmes: (me.body?.runs ?? []).map((run) => [run.runId, run.membership, run.groupName, run.roles.join(" ")]),
    updates: await updatesOf(who, runId),
    marks:
      overview.status === 200
        ? (overview.body.ownAttendance?.sessions ?? []).map((session) => [session.weekNumber, session.status])
        : { refused: overview.status },
  };
}

/**
 * A member's run home's session card, drawn as the run home draws it: from
 * their own overview answer, dated by their group's own calendar, with the
 * week's mode, and titled "Your first session" before the start.
 */
async function runHomeCardOf(who, runId) {
  const answer = await courseCall(who, courseRoutes.overview.GET, { runId });
  const group = answer.body?.group ?? null;
  if (answer.status !== 200 || !group) return { refused: answer.status };
  const current = group.calendar.currentWeek;
  const weekNumber = current ? (current.weekNumber ?? current.anchorWeekNumber) : 0;
  const card = createElement(SessionCard, {
    group,
    slotStartKey: current?.slotStartKey ?? null,
    mode: weekNumber >= 1 ? (group.sessionModes[`w${String(weekNumber).padStart(2, "0")}`] ?? null) : null,
    title: current?.phase === "before" ? "Your first session" : undefined,
  });
  return pageText(renderToStaticMarkup(card));
}

/** People in groups, as `who` is drawn it from the board route's answer to them. */
async function boardOf(who, runId) {
  const answer = await courseCall(who, courseRoutes.board.GET, { runId });
  if (answer.status !== 200) return { refused: answer.status };
  world.board = answer.body;
  try {
    return pageText(renderToStaticMarkup(createElement(AllocationBoard, { courseId: COURSE, runId, runEditorHref: null })));
  } finally {
    world.board = null;
  }
}

/** A facilitator's roster card, drawn from the roster route's answer to them. */
async function rosterCardOf(who, groupId) {
  const answer = await courseCall(who, courseRoutes.roster.GET, { groupId });
  if (answer.status !== 200) return { refused: answer.status };
  world.roster = answer.body;
  try {
    return pageText(renderToStaticMarkup(createElement(GroupRosterCard, { groupId, groupName: groupDoc(groupId).name })));
  } finally {
    world.roster = null;
  }
}

/** A register as `who` reads it: its rows and every mark, `week -> name -> status`. */
async function registerOf(who, groupId) {
  const answer = await courseCall(who, courseRoutes.register.GET, { groupId });
  if (answer.status !== 200) return { refused: answer.status };
  const nameOf = new Map(answer.body.members.map((member) => [member.uid, member.displayName]));
  const marks = {};
  for (const session of answer.body.sessions) {
    const week = {};
    for (const [uid, status] of Object.entries(answer.body.records[session.sessionKey] ?? {})) {
      week[nameOf.get(uid) ?? uid] = status;
    }
    marks[`week ${session.weekNumber}${session.pushedAt ? ", finished" : ""}`] = week;
  }
  return { members: answer.body.members.map((member) => member.displayName), notYetTold: answer.body.notYetTold, marks };
}

/** A facilitator's group page, as the server draws it: the way to write to the group, and its updates. */
async function groupPageOf(who, runId, groupId) {
  const drawn = await draw(pages.group, who, { runId, groupId });
  if (drawn.to) return { sentTo: drawn.to };
  const [list] = find(drawn.element, "StaffUpdatesSection");
  const write =
    /Write to [^()]+ \(\d+\) Posts an update to the group(?:\.| and emails \d+ (?:person|people)\.)(?: Nobody in it can be emailed yet\.| Replies go to \S+@\S+\.[a-z]+\.)?(?: \d+ (?:person|people) placed in it (?:hasn’t|haven’t) been told their group yet\. They’ll read it once Publish tells them, and won’t be emailed it\.)?/.exec(
      drawn.text,
    )?.[0] ?? null;
  return { write, updates: (list?.props.updates ?? []).map((row) => [row.title, row.meta]) };
}

/** A facilitator's view of their group: its page, its roster and its register. */
async function facilitatorSees(who, runId, groupId) {
  const roster = await courseCall(who, courseRoutes.roster.GET, { groupId });
  return {
    page: await groupPageOf(who, runId, groupId),
    roster:
      roster.status === 200
        ? { members: roster.body.members.map((member) => member.displayName), notYetTold: roster.body.notYetTold }
        : { refused: roster.status },
    register: await registerOf(who, groupId),
  };
}

/**
 * The lead's tabs, as `who` (the lead, or an admin) is shown them: Messages
 * (the composer's audiences and the list of updates), People in groups (the
 * board), Facilitators (its route), and Attendance (each group's heading and
 * its register through the register's route).
 */
async function tabsOf(who, name, runId) {
  const messages = await draw(pages.messages, who, of(name));
  const [composer] = find(messages.element, "UpdateComposer");
  const [list] = find(messages.element, "StaffUpdatesSection");
  const board = await courseCall(who, courseRoutes.board.GET, { runId });
  const staffing = await courseCall(who, courseRoutes.runFacilitators.GET, { runId });
  world.course = true;
  let headings = [];
  try {
    headings = await lib.programmeRun.loadRunGroupHeadings(world.courseDb, runId);
  } finally {
    world.course = false;
  }
  const registers = [];
  for (const heading of headings) {
    registers.push({ name: heading.name, when: heading.when, facilitators: heading.facilitators, register: await registerOf(who, heading.id) });
  }
  const attendancePage = await draw(pages.attendance, who, of(name));
  const [grid] = find(attendancePage.element, "ProgrammeAttendance");
  const overviewPage = await draw(pages.overview, who, of(name));
  const [overview] = find(overviewPage.element, "ProgrammeOverview");
  world.user = sessionOf(who);
  world.course = true;
  let times;
  try {
    const outcome = await lib.times.loadTimesPicture(world.courseDb, world.user, ROUND, P[name], undefined);
    times = outcome.status === "ok" ? (outcome.view.picture?.groups.map((group) => group.name) ?? outcome.view.blank) : outcome.status;
  } finally {
    world.course = false;
  }
  return {
    messages: {
      to: (composer?.props.audiences ?? []).map((audience) => [audience.label, audience.emails]),
      /** The line under To for each audience: who is placed there and not yet told, or null. */
      waiting: (composer?.props.audiences ?? []).map((audience) => audience.notYetTold),
      updates: (list?.props.updates ?? []).map((row) => [row.title, row.meta]),
    },
    people: {
      groups: (board.body?.groups ?? []).map((group) => [group.name, group.memberCount, group.facilitatorNames]),
      placed: Object.fromEntries((board.body?.people ?? []).map((row) => [row.uid, [GROUP_NAME[row.groupId] ?? row.groupId, row.allocatedEmailAt !== null]])),
      publish: board.body?.publish ? [board.body.publish.emails, board.body.publish.people, board.body.publish.facilitators] : null,
      /** The board's rail: accepted, placed, who it would name as having no group, and who has left. */
      rail: board.body
        ? (() => {
            const columns = new Set(board.body.groups.map((group) => group.id));
            const tally = lib.boardTally(board.body.people, (row) => !row.groupId || !columns.has(row.groupId));
            return [tally.accepted, tally.placed, tally.toPlace.map((row) => row.displayName), tally.left];
          })()
        : null,
    },
    facilitators:
      staffing.status === 200
        ? staffing.body.groups.map((group) => [group.name, group.when, group.facilitators.map((person) => person.name)])
        : { refused: staffing.status },
    /** Each group's register through the register's own route, as the lead may read it. */
    registers,
    /** The Groups tab's Times view: its list of who can make each group, by group. */
    times,
    /** The Attendance tab's grid: each group's rows, each person's marks week by week, Came and Of. */
    attendance: grid
      ? {
          ending: grid.props.model.ending,
          groups: grid.props.model.groups.map((group) => ({
            name: group.name,
            line: group.line,
            notYetTold: group.notYetTold,
            people: group.people.map((person) => ({
              name: person.name,
              left: person.left,
              marks: person.cells.filter((cell) => cell.state === "mark").map((cell) => [cell.weekNumber, cell.mark, cell.saved ? "saved" : "finished"]),
              came: `${person.came} of ${person.of}`,
              inARow: person.absentInARow,
            })),
          })),
          totals: grid.props.model.totals.map((total) => [total.weekNumber, total.percent, `${total.came} of ${total.of}`, total.soFar]),
        }
      : { text: attendancePage.text.slice(0, 300) },
    /** The Overview tab: the week, each group's session card, what needs attention and the people line. */
    overview: overview
      ? {
          week: overview.props.model.week ? [overview.props.model.week.label, overview.props.model.week.title, overview.props.model.week.span] : null,
          sessions: overview.props.model.sessions.map((session) => ({
            group: session.groupName,
            when: session.when,
            where: session.where,
            facilitators: session.facilitators.map((person) => person.name),
            pill: session.pill,
            line: session.line,
            remind: session.remind ? [session.remind.label, session.remind.count, session.remind.countLine, session.remind.confirm, session.remind.sessionKey] : null,
            reminded: session.reminded,
          })),
          attention: overview.props.model.attention.map((item) => [item.kind, item.title, item.detail]),
          people: overview.props.model.people,
        }
      : { text: overviewPage.text.slice(0, 300) },
  };
}

/**
 * EVERYTHING EVERYBODY IS SHOWN, at one moment: the lead's tabs (and an
 * admin's, which must be the same), each facilitator's group, each member's
 * programmes, updates and marks, and what the staff who are on neither read.
 */
async function lookAround(label) {
  const look = {
    lead: await tabsOf("claudia", "agi", RUN),
    admin: await tabsOf("zach", "agi", RUN),
    incubatorLead: await tabsOf("tess", "inc", INC_RUN),
    facilitators: {},
    members: {},
    others: {},
  };
  const staffing = { [GROUP.A]: groupDoc(GROUP.A).facilitatorUids, [GROUP.B]: groupDoc(GROUP.B).facilitatorUids };
  for (const [groupId, uids] of Object.entries(staffing)) {
    for (const who of uids) {
      look.facilitators[`${who} (${GROUP_NAME[groupId]})`] = {
        ...(await facilitatorSees(who, RUN, groupId)),
        updates: await updatesOf(who, RUN),
      };
    }
  }
  look.facilitators["tess (the incubator's Group A)"] = {
    ...(await facilitatorSees("tess", INC_RUN, INC_GROUP)),
    updates: await updatesOf("tess", INC_RUN),
  };
  for (const who of MEMBERS) look.members[who] = await memberSees(who);
  for (const who of ["yusuf", "tom", "tess", "zach"]) look.others[`${who} on AGI Strategy`] = await updatesOf(who, RUN);
  for (const who of ["claudia", "amara", "rahul"]) look.others[`${who} on the incubator`] = await updatesOf(who, INC_RUN);
  // The facts the screens are made from, at this moment: every update with
  // who it is to (newest first, as every list orders them), who facilitates
  // each group, and who is on each run's cohort list.
  look.stored = world.db
    .paths()
    .filter((path) => path.startsWith("courseUpdates/"))
    .map((path) => world.db.read(path))
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .map((update) => ({ runId: update.runId, title: update.title, to: update.to === "group" ? GROUP_NAME[update.groupId] : update.to }));
  look.staffing = Object.fromEntries([GROUP.A, GROUP.B, INC_GROUP].map((groupId) => [GROUP_NAME[groupId], groupDoc(groupId).facilitatorUids]));
  look.onTheList = Object.fromEntries(
    [RUN, INC_RUN].map((runId) => [
      runId,
      world.db
        .paths()
        .filter((path) => path.startsWith("subscriptions/"))
        .map((path) => world.db.read(path))
        .filter((row) => row.channel === `cohort:${runId}` && row.subscribed === true)
        .map((row) => row.audienceId)
        .sort(),
    ]),
  );
  seen.looks[label] = look;
}

// ---------------------------------------------------------------------------
// Before Publish: the lead writes, and a facilitator writes to their group
// ---------------------------------------------------------------------------

/**
 * A press made the way the composer makes one: the number on the button is
 * the one the page that offers it counted, read first.
 */
async function post(name, who, runId, { to, groupId = null, title, message, email }) {
  const counted = await countOnTheButton(who, runId, to, groupId);
  const body = { to, ...(groupId ? { groupId } : {}), title, message, email, ...(email ? { emailCount: counted } : {}) };
  const before = world.mail.length;
  const answer = await courseCall(who, courseRoutes.updates.POST, { runId }, { body });
  const mail = await Promise.all(mailSince(before).map(opened));
  seen.steps.push({ name, expected: 200, status: answer.status, error: answer.body?.error ?? null });
  return { counted, answer, mail };
}

/** The number a writer's page puts on the button: the Messages tab's for a lead, the group page's for a facilitator. */
async function countOnTheButton(who, runId, to, groupId) {
  const isLead = (who === "claudia" && runId === RUN) || (who === "tess" && runId === INC_RUN) || who === "zach";
  if (isLead) {
    const drawn = await draw(pages.messages, who, of(runId === RUN ? "agi" : "inc"));
    const [composer] = find(drawn.element, "UpdateComposer");
    const audience = (composer?.props.audiences ?? []).find((a) => a.to === to && (a.groupId ?? null) === groupId);
    return audience ? audience.emails : -1;
  }
  const page = await groupPageOf(who, runId, groupId);
  const match = /emails (\d+) (?:person|people)\./.exec(page.write ?? "");
  return match ? Number(match[1]) : 0;
}

async function beforePublish() {
  at("postingEarly");
  const e = {};
  seen.early = e;
  e.leadTabs = await tabsOf("claudia", "agi", RUN);
  e.welcome = await post("the lead posts a welcome to everyone, before anybody is told", "claudia", RUN, {
    to: "everyone",
    title: "Welcome to AGI Strategy",
    message: "Your group and its first session come in an email this evening.\nWeek 1’s readings are on the programme page.",
    email: false,
  });
  later();
  // The composer turns "Also email it" off when nobody can be emailed; a
  // press that asks for it anyway is refused with a sentence.
  e.welcomeEmailed = await courseCall("claudia", courseRoutes.updates.POST, { runId: RUN }, {
    body: { to: "everyone", title: "Welcome to AGI Strategy", message: "Hello.", email: true, emailCount: 0 },
  });
  later();
  e.guide = await post("the lead writes to the facilitators, emailed", "claudia", RUN, {
    to: "facilitators",
    title: "The facilitators’ guide for week 1",
    message: "Start with ten minutes on the readings.\nThe guide is on your group page.",
    email: true,
  });
  later();
  e.rahulsPage = await groupPageOf("rahul", RUN, GROUP.B);
  e.toGroupB = await post("Rahul writes to Group B before it is told", "rahul", RUN, {
    to: "group",
    groupId: GROUP.B,
    title: "See you on Tuesday",
    message: "We meet in Room C20.",
    email: false,
  });
  await lookAround("placed, before Publish");
}

// ---------------------------------------------------------------------------
// Publish, by each programme's lead
// ---------------------------------------------------------------------------

async function publishAsTheLead(who, runId, label) {
  const p = {};
  p.before = await publishSummary(who, runId);
  const beforeTheTest = world.mail.length;
  p.test = await courseStep(`${label}: Send a test to me`, 200, who, courseRoutes.publishTest.POST, { runId });
  p.testMail = await Promise.all(mailSince(beforeTheTest).map(opened));
  p.afterTest = await publishSummary(who, runId);
  const beforeThePress = world.mail.length;
  const pushesBefore = world.pushes.length;
  p.pressed = await courseStep(`${label}: Publish with the board's count`, 200, who, courseRoutes.publish.POST, { runId }, {
    body: { emails: p.afterTest?.emails ?? -1 },
  });
  p.pressMail = await Promise.all(mailSince(beforeThePress).map(opened));
  p.pushes = world.pushes.slice(pushesBefore).map((push) => [push.uid, push.title, push.body]);
  p.afterPress = await publishSummary(who, runId);
  return p;
}

async function publish() {
  at("publishing");
  seen.publish = await publishAsTheLead("claudia", RUN, "AGI Strategy's lead");
  at("publishingIncubator");
  seen.incubatorPublish = await publishAsTheLead("tess", INC_RUN, "the incubator's lead");
  await lookAround("published");
}

// ---------------------------------------------------------------------------
// Week 1's updates, emailed
// ---------------------------------------------------------------------------

async function weekOneUpdates() {
  at("weekOneUpdates");
  const u = {};
  seen.weekOne = u;
  u.everyone = await post("the lead posts week 1 to everyone, emailed", "claudia", RUN, {
    to: "everyone",
    title: "Week 1 readings are up",
    message: "The three readings take about 75 minutes.\nBring one question to your session.",
    email: true,
  });
  later();
  u.facilitators = await post("the lead writes to the facilitators again, emailed", "claudia", RUN, {
    to: "facilitators",
    title: "Registers this week",
    message: "Take the register on your phone during the session, then finish it.",
    email: true,
  });
  later();
  u.groupB = await post("Rahul writes to Group B, emailed", "rahul", RUN, {
    to: "group",
    groupId: GROUP.B,
    title: "Room C20 on Tuesday",
    message: "It’s on the second floor. Come up the main stairs.",
    email: true,
  });
  later();
  // A facilitator writes to their own group only.
  u.ameliaToB = await courseCall("amelia", courseRoutes.updates.POST, { runId: RUN }, {
    body: { to: "group", groupId: GROUP.B, title: "Hello", message: "Hi.", email: false },
  });
  u.ameliaToEveryone = await courseCall("amelia", courseRoutes.updates.POST, { runId: RUN }, {
    body: { to: "everyone", title: "Hello", message: "Hi.", email: false },
  });
  // The incubator's lead runs its one group, so she is its one facilitator:
  // an update to the facilitators, emailed, would be to herself.
  u.tessToFacilitators = await courseCall("tess", courseRoutes.updates.POST, { runId: INC_RUN }, {
    body: { to: "facilitators", title: "Notes for Monday", message: "Bring the papers.", email: true, emailCount: 1 },
  });
  // The session card on two people's run home, and a facilitator's group page.
  u.runHome = { amara: await runHomeCardOf("amara", RUN), omar: await runHomeCardOf("omar", INC_RUN) };
  u.groupPage = (await draw(pages.group, "amelia", { runId: RUN, groupId: GROUP.A })).text;
  u.roster = await rosterCardOf("amelia", GROUP.A);
  // The incubator's lead writes to her people, emailed.
  later();
  u.incubator = await post("the incubator's lead posts to everyone on it, emailed", "tess", INC_RUN, {
    to: "everyone",
    title: "Week 1 on Monday",
    message: "Read the first paper before Monday.",
    email: true,
  });
  await lookAround("week 1's updates");
}

// ---------------------------------------------------------------------------
// The registers, the lead's staffing, somebody who leaves, the weekly email stopped
// ---------------------------------------------------------------------------

/** The lead of the programme that names each run. */
const LEAD_OF = { [RUN]: "claudia", [INC_RUN]: "tess" };

/** A facilitator marks a session of their group, then finishes the register; its run's lead reads it between. */
async function aSession(who, groupId, weekNumber, marks, label, { finish = true } = {}) {
  const lead = LEAD_OF[groupDoc(groupId).runId];
  const r = {};
  r.marked = await courseStep(`${label}: ${who} marks week ${weekNumber}`, 200, who, courseRoutes.register.POST, { groupId }, {
    body: { weekNumber, marks: Object.entries(marks).map(([uid, status]) => ({ uid, status })) },
  });
  r.beforeFinish = await eachOf(Object.keys(marks), async (uid) => (await memberSees(uid)).marks);
  r.leadReadsDraft = await registerOf(lead, groupId);
  // The lead reads and never marks, unless she runs the group herself.
  r.leadMarks =
    lead === who
      ? null
      : await courseCall(lead, courseRoutes.register.POST, { groupId }, {
          body: { weekNumber, marks: [{ uid: Object.keys(marks)[0], status: "absent" }] },
        });
  if (!finish) return r;
  later(45);
  const before = world.mail.length;
  r.finished = await courseStep(`${label}: ${who} finishes week ${weekNumber}`, 200, who, courseRoutes.finish.POST, { groupId }, { body: { weekNumber } });
  r.finishMail = await Promise.all(mailSince(before).map(opened));
  r.afterFinish = await eachOf(Object.keys(marks), async (uid) => (await memberSees(uid)).marks);
  return r;
}

async function weeksOneAndTwo() {
  const r = {};
  seen.registers = r;
  at("groupAWeek1Marked");
  r.a1 = await aSession("amelia", GROUP.A, 1, { dev: "present", joel: "late", priya: "absent" }, "Group A");

  // The lead adds Tom to Group A on the Facilitators view, then tells him
  // with Publish: the board owes one email, and a press sends it.
  at("staffing");
  const s = {};
  seen.staffing = s;
  s.viewBefore = await courseCall("claudia", courseRoutes.runFacilitators.GET, { runId: RUN });
  const beforeTheChange = world.mail.length;
  s.changed = await courseStep("the lead adds Tom to Group A", 200, "claudia", courseRoutes.facilitators.POST, { groupId: GROUP.A }, {
    body: { uids: ["amelia", "tom"] },
  });
  s.mailedByTheChange = world.mail.length - beforeTheChange;
  s.tomBeforeHeIsTold = await facilitatorSees("tom", RUN, GROUP.A);
  s.summary = await publishSummary("claudia", RUN);
  const beforeThePress = world.mail.length;
  s.pressed = await courseStep("the lead's Publish tells Tom", 200, "claudia", courseRoutes.publish.POST, { runId: RUN }, {
    body: { emails: s.summary?.emails ?? -1 },
  });
  s.pressMail = await Promise.all(mailSince(beforeThePress).map(opened));
  // An admin opens AGI Strategy's week 2 in the week editor, after its first session.
  world.db.poke(`courseRuns/${RUN}/weeks/w02`, { published: true });
  await lookAround("Tom added and told");

  at("incubatorWeek1");
  r.inc1 = await aSession("tess", INC_GROUP, 1, { omar: "present", wen: "present", lena: "late", tariq: "present" }, "the incubator");
  // The incubator's lead opens week 2 after its first session, in the week editor.
  world.db.poke(`courseRuns/${INC_RUN}/weeks/w02`, { published: true });

  at("groupBWeek1Marked");
  r.b1 = await aSession("rahul", GROUP.B, 1, { amara: "present", ella: "present", kofi: "excused" }, "Group B");
  await lookAround("week 1's registers finished");

  // Kofi tells the lead he has left; she removes him on People in groups.
  at("leaving");
  const l = {};
  seen.leaving = l;
  const beforeTheRemove = world.mail.length;
  l.removed = await courseStep("the lead removes Kofi", 200, "claudia", courseRoutes.remove.POST, { runId: RUN, uid: "kofi" });
  l.mailed = world.mail.length - beforeTheRemove;
  l.summary = await publishSummary("claudia", RUN);
  l.board = await boardOf("claudia", RUN);
  await lookAround("Kofi removed");

  // Then the lead asks Sofia to run Group A with Tom as well, which Publish
  // has to tell her: the board owes one email, and the lead presses.
  later(30);
  l.sofiaToA = await courseStep("the lead adds Sofia to Group A as well", 200, "claudia", courseRoutes.facilitators.POST, { groupId: GROUP.A }, {
    body: { uids: ["amelia", "tom", "sofia"] },
  });
  l.owed = await publishSummary("claudia", RUN);
  const beforeSofiasPress = world.mail.length;
  l.pressed = await courseStep("the lead's Publish tells Sofia, with Kofi's row still Accepted", 200, "claudia", courseRoutes.publish.POST, { runId: RUN }, {
    body: { emails: l.owed?.emails ?? -1 },
  });
  l.pressMail = await Promise.all(mailSince(beforeSofiasPress).map(opened));
  // What the runbook asks next: Kofi's row changed from Accepted on the run's
  // own list. Still an admin's step, and Publish no longer waits for it.
  later();
  l.leadDecides = await courseCall("claudia", courseRoutes.decide.POST, { runId: RUN, uid: "kofi" }, {
    body: { action: "reject", reason: "Left in week 1." },
  });
  l.adminDecides = await courseStep("an admin changes Kofi's row from Accepted", 200, "zach", courseRoutes.decide.POST, { runId: RUN, uid: "kofi" }, {
    body: { action: "reject", reason: "Left in week 1." },
  });
  await new Promise((resolve) => setImmediate(resolve));
  later();
  l.owedAfter = await publishSummary("claudia", RUN);
  // An admin opens week 3 in the week editor.
  world.db.poke(`courseRuns/${RUN}/weeks/w03`, { published: true });
  await lookAround("Sofia added to Group A and told");

  at("groupAWeek2");
  r.a2 = await aSession("tom", GROUP.A, 2, { dev: "present", joel: "present", priya: "late" }, "Group A");
  // Joel follows "you can stop it here" at the foot of the weekly email he
  // has just been sent, and confirms on the page it opens.
  later(60);
  const link = r.a2.finishMail.find((mail) => mail.to === address("joel"))?.links.find((href) => href.includes("/api/unsubscribe?t=")) ?? "";
  const token = new URL(link || `${APP_URL}/api/unsubscribe?t=none`).searchParams.get("t");
  const asked = await call(null, unsubscribe.GET, {}, { query: { t: token } });
  r.joelStops = {
    page: typeof asked.body === "string" ? pageText(asked.body.replace(/<head[\s\S]*?<\/head>/i, "")) : asked.status,
    confirmed: await step("Joel stops the weekly email", 200, null, unsubscribe.POST, {}, { query: { t: token } }),
  };
  await lookAround("Joel stopped the weekly email");
  at("incubatorWeek2");
  r.inc2 = await aSession("tess", INC_GROUP, 2, { omar: "present", wen: "late", lena: "present", tariq: "present" }, "the incubator");
  at("groupBWeek2");
  r.b2 = await aSession("sofia", GROUP.B, 2, { amara: "late", ella: "present" }, "Group B");
}

// ---------------------------------------------------------------------------
// Pitching week on the incubator
// ---------------------------------------------------------------------------

const pitchBody = (over = {}) => ({
  title: "Probe transfer",
  paper: { kind: "reading", materialId: READING.probes },
  twist: "Test whether the probes still work on a smaller open model.",
  partnerUid: null,
  ...over,
});

/** One person's pitching page, from the route's own answer, and the run home's card. */
async function pitchingOf(who) {
  const answer = await courseCall(who, courseRoutes.pitching.GET, { runId: INC_RUN });
  world.user = sessionOf(who);
  world.course = true;
  let card;
  try {
    card = await lib.pitching.pitchingCard(world.courseDb, world.user, INC_RUN);
  } finally {
    world.course = false;
  }
  if (answer.status !== 200) return { refused: [answer.status, answer.body?.error ?? null], card };
  const view = answer.body.view;
  return {
    lede: view.lede,
    open: view.open,
    picked: `${view.picked} of ${view.pickLimit}`,
    mine: view.mine ? [view.mine.title, view.mine.partner?.name ?? null] : null,
    pitches: view.pitches.map((pitch) => [pitch.title, pitch.pitchedBy, pitch.yours ? "yours" : pitch.picked ? "picked" : ""]),
    partners: view.partners.map((partner) => partner.name),
    teams: view.teams,
    drawn: pageText(renderToStaticMarkup(createElement(PitchingWeek, { initial: view, editing: false }))),
    card,
  };
}

/** The lead's list of pitches (the Groups tab's Pitches), as the page draws it for `who`. */
async function pitchesListOf(who) {
  const drawn = await draw(pages.pitches, who, of("inc"));
  world.user = sessionOf(who);
  world.course = true;
  let loaded;
  try {
    loaded = await lib.pitches.loadProgrammePitches(world.courseDb, world.user, ROUND, P.inc);
  } finally {
    world.course = false;
  }
  return {
    status: loaded.status,
    counts: loaded.status === "ok" ? loaded.view.pitches.map((pitch) => [pitch.title, pitch.pitchedBy, pitch.wouldJoin]) : null,
    published: loaded.status === "ok" ? loaded.view.published : null,
    text: drawn.text,
  };
}

async function pitchingWeek() {
  const k = {};
  seen.pitching = k;
  at("groupBWeek2");
  k.beforeWeek3 = { omar: await pitchingOf("omar"), list: await pitchesListOf("tess") };

  // The incubator's lead opens week 3 after week 2's session, and writes to her people.
  at("openingPitching");
  world.db.poke(`courseRuns/${INC_RUN}/weeks/w03`, { published: true });
  k.opened = await post("the incubator's lead says pitching week is open, emailed", "tess", INC_RUN, {
    to: "everyone",
    title: "Pitching week is open",
    message: "Pitch a paper and a twist by Monday’s session, then pick the pitches you’d join.",
    email: true,
  });
  k.openFor = await eachOf(INCUBATOR_PLACES, pitchingOf);

  // An update to one group of AGI Strategy, emailed: read by that group only.
  at("oneGroup");
  seen.oneGroup = await post("the lead writes to Group A only, emailed", "claudia", RUN, {
    to: "group",
    groupId: GROUP.A,
    title: "Group A is in A14 on Thursday",
    message: "A13 is booked for an exam. Same time.",
    email: true,
  });

  at("pitching");
  k.omarPitches = await courseStep("Omar pitches alone", 200, "omar", courseRoutes.pitch.POST, { runId: INC_RUN }, { body: pitchBody() });
  later();
  k.wenPitches = await courseStep("Wen pitches with Lena", 200, "wen", courseRoutes.pitch.POST, { runId: INC_RUN }, {
    body: pitchBody({
      title: "Reward hacking evals",
      paper: { kind: "reading", materialId: READING.reward },
      twist: "Rebuild the evaluation with tasks the team writes.",
      partnerUid: "lena",
    }),
  });
  later();
  // The partner edits the pitch's words from her own form, which offers no
  // partner: the pitch keeps its people.
  k.lenaEdits = await courseStep("Lena, Wen's partner, sharpens the twist", 200, "lena", courseRoutes.pitch.POST, { runId: INC_RUN }, {
    body: pitchBody({
      title: "Reward hacking evals",
      paper: { kind: "reading", materialId: READING.reward },
      twist: "Rebuild the evaluation with tasks the team writes, and run it on two models.",
      partnerUid: null,
    }),
  });
  later();
  // Somebody already on a pitch is nobody's partner.
  k.tariqAsksOmar = await courseCall("tariq", courseRoutes.pitch.POST, { runId: INC_RUN }, {
    body: pitchBody({ title: "Chess model features", paper: { kind: "typed", title: "Chess models learn board features" }, twist: "Check a smaller chess model.", partnerUid: "omar" }),
  });
  k.afterPitching = await eachOf(INCUBATOR_PLACES, pitchingOf);

  at("picking");
  const pitchId = (title) =>
    world.db
      .paths()
      .filter((path) => path.startsWith("coursePitches/"))
      .map((path) => [path.split("/")[1], world.db.read(path)])
      .find(([, pitch]) => pitch.title === title)?.[0] ?? "";
  const OMAR = pitchId("Probe transfer");
  const WEN = pitchId("Reward hacking evals");
  for (const [who, id, title] of [
    ["tariq", OMAR, "Probe transfer"],
    ["tariq", WEN, "Reward hacking evals"],
    ["lena", OMAR, "Probe transfer"],
    ["wen", OMAR, "Probe transfer"],
    ["omar", WEN, "Reward hacking evals"],
  ]) {
    await courseStep(`${who} picks ${title}`, 200, who, courseRoutes.picks.POST, { runId: INC_RUN }, { body: { pitchId: id, join: true } });
    later(1);
  }
  // Nobody picks their own pitch.
  k.omarPicksHisOwn = await courseCall("omar", courseRoutes.picks.POST, { runId: INC_RUN }, { body: { pitchId: OMAR, join: true } });
  k.afterPicking = await eachOf(INCUBATOR_PLACES, pitchingOf);
  k.leadList = await pitchesListOf("tess");
  k.adminList = await pitchesListOf("zach");
  k.otherLeadList = await pitchesListOf("claudia");
  k.staffAsk = await eachOf(["tess", "zach", "claudia", "amara"], async (who) => {
    const answer = await courseCall(who, courseRoutes.pitching.GET, { runId: INC_RUN });
    return [answer.status, answer.body?.error ?? null];
  });

  at("beforeTheClose");
  k.lastMinute = await courseStep("Tariq takes one pick back, a minute before the session", 200, "tariq", courseRoutes.picks.POST, { runId: INC_RUN }, {
    body: { pitchId: WEN, join: false },
  });
  at("afterTheClose");
  k.afterTheClose = await courseCall("tariq", courseRoutes.picks.POST, { runId: INC_RUN }, { body: { pitchId: WEN, join: true } });
  k.pitchAfterTheClose = await courseCall("omar", courseRoutes.pitch.POST, { runId: INC_RUN }, { body: pitchBody({ title: "Probe transfer, renamed" }) });
  k.closed = await eachOf(INCUBATOR_PLACES, pitchingOf);
  k.closedList = await pitchesListOf("tess");
  at("thatEvening");
  k.thatEvening = { omar: await pitchingOf("omar") };
  at("nextDay");
  k.nextDay = { omar: await pitchingOf("omar") };
}

// ---------------------------------------------------------------------------
// Week 3: a register left overnight, Remind, the CSV
// ---------------------------------------------------------------------------

async function weekThree() {
  at("groupAWeek3");
  seen.registers.a3 = await aSession("tom", GROUP.A, 3, { dev: "present", joel: "absent", priya: "present" }, "Group A");
  at("incubatorWeek3");
  seen.registers.inc3 = await aSession("tess", INC_GROUP, 3, { omar: "present", wen: "present", lena: "present", tariq: "absent" }, "the incubator");
  // Group B's register of Tue 17 Nov is marked and not finished that evening.
  at("groupBWeek3");
  seen.registers.b3 = await aSession("rahul", GROUP.B, 3, { amara: "present", ella: "left-early" }, "Group B", { finish: false });

  // The next morning the lead's Overview says so, and offers Remind with its count.
  at("registerNotFinished");
  const m = {};
  seen.remind = m;
  await lookAround("Group B's register not finished");
  const card = seen.looks["Group B's register not finished"].lead.overview.sessions?.find((session) => session.group === "Group B");
  const [, count, , , sessionKey] = card?.remind ?? [null, -1, null, null, ""];
  const before = world.mail.length;
  m.pressed = await step("the lead presses Remind on Group B's register", 200, "claudia", routes.remind.POST, of("agi"), {
    body: { groupId: GROUP.B, sessionKey, emails: count },
  });
  m.mail = await Promise.all(mailSince(before).map(opened));
  later();
  m.again = await call("claudia", routes.remind.POST, of("agi"), { body: { groupId: GROUP.B, sessionKey, emails: count } });
  m.overview = (await tabsOf("claudia", "agi", RUN)).overview;

  at("finishedLate");
  const finishing = world.mail.length;
  seen.registers.b3.finished = await courseStep("Group B: rahul finishes week 3 the morning after", 200, "rahul", courseRoutes.finish.POST, { groupId: GROUP.B }, {
    body: { weekNumber: 3 },
  });
  seen.registers.b3.finishMail = await Promise.all(mailSince(finishing).map(opened));

  // The lead downloads the programme's attendance.
  at("downloading");
  const csv = await step("the lead downloads the attendance CSV", 200, "claudia", routes.csv.POST, of("agi"));
  seen.csv = typeof csv.body === "string" ? csv.body : null;
  await lookAround("the end of week 3");

  // An admin asks the lead to run Group B as well, and she writes to the
  // facilitators: she is one of them now, and her own email is not one the
  // update sends (the walk of stage two's fixes, G2).
  later();
  const l = {};
  seen.leadFacilitates = l;
  l.staffed = await courseStep("an admin adds the lead to Group B's facilitators", 200, "zach", courseRoutes.facilitators.POST, { groupId: GROUP.B }, {
    body: { uids: ["rahul", "sofia", "claudia"] },
  });
  l.offered = (await tabsOf("claudia", "agi", RUN)).messages.to.at(-1);
  later();
  l.posted = await post("the lead, a facilitator too, writes to the facilitators, emailed", "claudia", RUN, {
    to: "facilitators",
    title: "Week 4 plans",
    message: "The same as week 3.",
    email: true,
  });

  // An admin who is also placed in Group A, told, and on the run's list
  // writes to the group: their own email is not one the update sends either.
  later();
  const a = {};
  seen.adminInTheGroup = a;
  world.db.seed(`courseEnrolments/${RUN}__zach`, {
    runId: RUN,
    courseId: COURSE,
    uid: "zach",
    groupId: GROUP.A,
    status: "active",
    role: "learner",
    selfEnrolled: false,
    applicationId: null,
    joinedWeekNumber: 1,
    allocatedEmailAt: new Date(),
    allocatedEmailDelivery: "sent",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await lib.subscriptions.subscribe(world.db, {
    email: address("zach"),
    channel: `cohort:${RUN}`,
    audience: "user",
    audienceId: "zach",
    source: "course-allocation",
    actor: { kind: "admin", uid: "zach", label: "Zach Levin" },
    inboxProven: true,
    name: "Zach Levin",
  });
  a.offered = (await tabsOf("zach", "agi", RUN)).messages.to.find(([label]) => label.startsWith("Group A"));
  later();
  a.posted = await post("an admin placed in Group A writes to it, emailed", "zach", RUN, {
    to: "group",
    groupId: GROUP.A,
    title: "Week 4 room",
    message: "The same room as week 3.",
    email: true,
  });
}

// ---------------------------------------------------------------------------
// The story
// ---------------------------------------------------------------------------

async function tellTheStory() {
  mock.timers.enable({ apis: ["Date"], now: new Date(WHEN.building) });
  // The code under test logs what it cannot do. What is logged is kept and not printed.
  for (const method of ["error", "warn"]) {
    mock.method(console, method, (...args) => {
      seen.logged.push(args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    });
  }
  world.db = makeDb(Object.fromEntries(CAST.map((person) => [`users/${person[0]}`, userDoc(person)])), { now: () => new Date() });
  world.courseDb = courseView(world.db);
  try {
    await decisionDay();
    await namedHandedOverPlaced();
    await beforePublish();
    await publish();
    await weekOneUpdates();
    await weeksOneAndTwo();
    await pitchingWeek();
    await weekThree();
  } catch (err) {
    seen.crashed = err;
  }
}

// ---------------------------------------------------------------------------
// What the story has to have said
// ---------------------------------------------------------------------------

/** Two marks some of the site's own words carry, which this file never types. */
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);
/** The byte-order mark a spreadsheet reads a file's names as UTF-8 by. */
const BOM = String.fromCharCode(0xfeff);
const FOOTER = "Nottingham AI Safety Initiative · University of Nottingham · ai-safety@uonsu.com";
const NOTICE_LINE = (reason) =>
  `Sent as an important notice You are getting this because ${reason}, so it reaches you whatever your notification settings say, and it is never marketing.`;
const short = (response) => [response.status, response.body?.error ?? null];
const groupPage = (runId, groupId) => `${APP_URL}/learn/${runId}/group/${groupId}`;

/** What an email says from `start` (its heading or greeting) to the end of its footer. */
function readFrom(mail, start) {
  const at = mail.text.indexOf(start);
  assert.ok(at !== -1, `${mail.to}: "${mail.subject}" never says "${start}"`);
  return mail.text.slice(at);
}

/** The moments the story looked around at, in order. */
const BEFORE_PUBLISH = "placed, before Publish";
const AFTER_PUBLISH = [
  "published",
  "week 1's updates",
  "Tom added and told",
  "week 1's registers finished",
  "Kofi removed",
  "Sofia added to Group A and told",
  "Joel stopped the weekly email",
  "Group B's register not finished",
  "the end of week 3",
];
const MOMENTS = [BEFORE_PUBLISH, ...AFTER_PUBLISH];
function lookAt(label) {
  const look = seen.looks[label];
  assert.ok(look, `the story never looked around at "${label}"`);
  return look;
}

/** Each run as its lead's tabs name it, and its groups as the story names them and as its people read them. */
const RUNS = [
  // In People in groups' order: Group B meets on Tuesdays, Group A on Thursdays.
  { runId: RUN, tabs: "lead", viewer: "claudia", programme: "AGI Strategy", groups: { "Group B": "Group B", "Group A": "Group A" } },
  { runId: INC_RUN, tabs: "incubatorLead", viewer: "tess", programme: "Research incubator", groups: { "the incubator's Group A": "Group A" } },
];

/** Who reads a run's group at one moment: every member whose own programmes put them in it, by name. */
function shownIn(look, runId, groupName) {
  return MEMBERS.filter((uid) =>
    (look.members[uid].programmes ?? []).some(([id, membership, group, roles]) => id === runId && membership === "enrolled" && group === groupName && roles === "learner"),
  )
    .map((uid) => FIRST[uid])
    .sort();
}
const uidOf = Object.fromEntries(CAST.map(([uid]) => [FIRST[uid], uid]));
const people = (n) => (n === 1 ? "1 person" : `${n} people`);
/** The line said of the people placed somewhere and not yet told, word for word, or null for nobody. */
const waitingWords = (n, where, update = "this") =>
  n > 0
    ? `${people(n)} placed ${where} ${n === 1 ? "hasn’t" : "haven’t"} been told their group yet. ` +
      `They’ll read ${update} once Publish tells them, and won’t be emailed it.`
    : null;

/** The updates meant for a reader, newest first: those to one of the audiences they are in. */
const meant = (look, runId, audiences) =>
  look.stored.filter((update) => update.runId === runId && audiences.includes(update.to)).map((update) => update.title);

/** A register's marks by person, `[week, status, finished or saved]`, as the grid's rows hold them. */
function marksByPerson(register) {
  const out = {};
  for (const [week, marks] of Object.entries(register.marks ?? {})) {
    const number = Number(/week (\d+)/.exec(week)[1]);
    for (const [name, status] of Object.entries(marks)) {
      (out[name] ??= []).push([number, status, week.endsWith(", finished") ? "finished" : "saved"]);
    }
  }
  return out;
}

describe("stage two of the course hub, one term from Publish to the end of week 3", () => {
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
  describe("1. before Publish: the lead writes to everyone and to the facilitators, and a facilitator to their group", () => {
    const e = () => seen.early;

    // Updates count who reads them, and nobody placed reads the run until
    // Publish has told them their group. So on the morning of Publish the
    // Messages tab counts nobody in a group while People in groups, one tab
    // along, shows the six placed and owes them nine emails. Both are true;
    // nothing on the tab says the six will read what is written now once
    // they are told (the walk of stage two, G1).
    test("the Messages tab counts nobody in a group until Publish, while People in groups shows the six placed", () => {
      // To offers the groups in People in groups' order, Monday first, since
      // the walk of stage two's fixes (G10): Group B meets on Tuesdays. And
      // under To it now says who is placed and not yet told, and that they
      // will read what is written once Publish tells them (G1).
      assert.deepEqual(e().leadTabs.messages, {
        to: [
          ["Everyone on AGI Strategy (0)", 0],
          ["Group B (0)", 0],
          ["Group A (0)", 0],
          ["The facilitators (3)", 3],
        ],
        waiting: [
          "6 people placed in groups haven’t been told their group yet. They’ll read this once Publish tells them, and won’t be emailed it.",
          "3 people placed in Group B haven’t been told their group yet. They’ll read this once Publish tells them, and won’t be emailed it.",
          "3 people placed in Group A haven’t been told their group yet. They’ll read this once Publish tells them, and won’t be emailed it.",
          null,
        ],
        updates: [],
      });
      assert.deepEqual(e().leadTabs.people.groups, [
        ["Group B", 3, ["Rahul", "Sofia"]],
        ["Group A", 3, ["Amelia"]],
      ]);
      assert.deepEqual(e().leadTabs.people.publish, [9, 6, 3]);
    });

    test("an update to people not yet told is kept and emailed to nobody; asking to email it is refused with a sentence", () => {
      assert.deepEqual([e().welcome.answer.status, e().welcome.answer.body.ok, e().welcome.answer.body.email, e().welcome.mail], [200, true, null, []]);
      assert.deepEqual(short(e().welcomeEmailed), [400, "Nobody it’s to can be emailed yet. Turn off Also email it to post it."]);
    });

    test("the update to the facilitators reaches each of the three once: a notice, the society's reply address, no link", () => {
      assert.equal(e().guide.counted, 3);
      assert.deepEqual(e().guide.answer.body.email, { sent: 3, held: 0, suppressed: 0, failed: 0 });
      assert.deepEqual(
        e().guide.mail.map((mail) => [mail.to, mail.subject, mail.kind, mail.replyTo, mail.links]),
        ["amelia", "rahul", "sofia"].map((uid) => [address(uid), "The facilitators’ guide for week 1", "notice", "ai-safety@uonsu.com", []]),
      );
      for (const mail of e().guide.mail) {
        assert.equal(
          readFrom(mail, "The facilitators’ guide for week 1 Sent"),
          `The facilitators’ guide for week 1 ${NOTICE_LINE("you are on this course")} Start with ten minutes on the readings. ` +
            `The guide is on your group page. Sent by Claudia · Facilitators · AGI Strategy Fellowship (Autumn 2026) ${FOOTER}`,
        );
      }
    });

    // Until the walk of stage two's fixes (G1) his line stopped at "Nobody in
    // it can be emailed yet.", with the three placed in his group not told.
    test("Rahul's page says nobody in Group B can be emailed yet, and his update to it is kept, emailed to nobody", () => {
      assert.equal(
        e().rahulsPage.write,
        "Write to Group B (0) Posts an update to the group. Nobody in it can be emailed yet. 3 people placed in it haven’t been told " +
          "their group yet. They’ll read it once Publish tells them, and won’t be emailed it.",
      );
      assert.deepEqual([e().toGroupB.counted, e().toGroupB.answer.status, e().toGroupB.answer.body.email], [0, 200, null]);
    });

    test("before Publish no member reads the run, and the lead's grid and Overview count nobody, where an admin's count the six placed", () => {
      const look = lookAt(BEFORE_PUBLISH);
      for (const uid of MEMBERS) {
        assert.deepEqual(look.members[uid], { programmes: [], updates: { refused: 403 }, marks: { refused: 403 } }, uid);
      }
      // The told rule: an admin is shown everybody placed, the lead the people Publish has told.
      // In People in groups' order and by their whole names, since the walk of
      // stage two's fixes (G10); until then A to D, by first names.
      assert.deepEqual(
        look.lead.attendance.groups.map((group) => [group.name, group.notYetTold, group.people.length]),
        [["Group B", true, 0], ["Group A", true, 0]],
      );
      assert.deepEqual(
        look.admin.attendance.groups.map((group) => [group.name, group.notYetTold, group.people.map((person) => person.name)]),
        [["Group B", false, ["Amara Okafor", "Ella Robinson", "Kofi Mensah"]], ["Group A", false, ["Dev Patel", "Joel Adeyemi", "Priya Nair"]]],
      );
      assert.deepEqual([look.lead.overview.people.takingPart, look.admin.overview.people.takingPart], [0, 6]);
      assert.deepEqual(look.lead.overview.week, ["Before the start", "Week 1 of 6", "Thu 29 Oct to Wed 4 Nov"]);
    });
  });

  // -------------------------------------------------------------------------
  describe("2. Publish, pressed by each programme's lead", () => {
    test("AGI Strategy's lead tests and publishes as an admin would: the board's nine, two tests to her, then the nine", () => {
      const p = seen.publish;
      assert.deepEqual([p.before.adminOnly, p.before.emails, p.before.people, p.before.facilitators, p.before.test.state], [false, 9, 6, 3, "none"]);
      assert.deepEqual(p.test.body, { ok: true, delivery: "sent", emails: 2, recorded: true });
      assert.deepEqual(
        p.testMail.map((mail) => [mail.to, mail.subject, mail.kind]),
        [
          [address("claudia"), "[TEST] Your AGI Strategy Fellowship group: first session Tue 3 Nov, 6pm", "course-test"],
          [address("claudia"), "[TEST] You’re facilitating Group A: Thursdays at 6pm", "course-test"],
        ],
      );
      assert.deepEqual(p.afterTest.test, { state: "fresh", when: "5:38pm", who: null });
      assert.deepEqual(p.pressed.body.report, {
        people: { sent: 6, held: 0, suppressed: 0 },
        facilitators: { sent: 3, held: 0, suppressed: 0 },
        failed: [],
        noAddress: [],
        alreadyTold: 0,
        more: 0,
      });
      assert.deepEqual(
        p.pressMail.map((mail) => mail.to),
        [...AGI_PLACES, "amelia", "rahul", "sofia"].map(address),
      );
      assert.deepEqual([p.afterPress.emails, p.afterPress.people, p.afterPress.facilitators], [0, 0, 0]);
    });

    // The incubator's one group is run by its lead, who signs "You’re
    // facilitating" and is never sent it (the walk of stage one, F1), and its
    // people are sent the incubator's own email, which never says group.
    test("the incubator's lead publishes her four, sends herself one test and no facilitators' email, in the incubator's own words", () => {
      const p = seen.incubatorPublish;
      assert.deepEqual([p.before.emails, p.before.people, p.before.facilitators], [4, 4, 0]);
      assert.deepEqual(p.test.body, { ok: true, delivery: "sent", emails: 1, recorded: true });
      assert.deepEqual(p.testMail.map((mail) => [mail.to, mail.subject]), [[address("tess"), "[TEST] Your Research incubator sessions: Mondays at 5pm"]]);
      assert.deepEqual(p.pressed.body.report.people, { sent: 4, held: 0, suppressed: 0 });
      assert.deepEqual(p.pressed.body.report.facilitators, { sent: 0, held: 0, suppressed: 0 });
      assert.deepEqual(
        p.pressMail.map((mail) => [mail.to, mail.subject, mail.links]),
        ["lena", "omar", "tariq", "wen"].map((uid) => [address(uid), "Your Research incubator sessions: Mondays at 5pm", [`${APP_URL}/learn/${INC_RUN}`]]),
      );
      for (const mail of p.pressMail) {
        const first = FIRST[mail.to.split("@")[0]];
        assert.equal(
          readFrom(mail, "Hi "),
          `Hi ${first}, You’ll meet on Mondays at 5pm, starting Mon 2 Nov. Where: Room B5 Tess runs the sessions. ` +
            `Week 1 is on your programme’s page. Open your programme Tess Research incubator lead, NAISI ${FOOTER}`,
        );
        assert.doesNotMatch(`${mail.subject} ${mail.text}`, /group|facilitat/i, mail.to);
      }
      assert.deepEqual(
        p.pushes,
        ["lena", "omar", "tariq", "wen"].map((uid) => [uid, "You've got a place", "Research Incubator: the details are in your email."]),
      );
    });

    // Group names are free text, and the incubator's one group is called
    // Group A, so its people's own programmes name the group their email never
    // does (the walk of stage one's fixes, question 2 for Zach).
    test("after Publish the incubator's people read their run, its group named as it is stored", () => {
      const look = lookAt("published");
      for (const uid of INCUBATOR_PLACES) assert.deepEqual(look.members[uid].programmes, [[INC_RUN, "enrolled", "Group A", "learner"]], uid);
    });
  });

  // -------------------------------------------------------------------------
  describe("3. week 1's updates, emailed: the count on each button is who each email reaches", () => {
    const u = () => seen.weekOne;

    test("to everyone: six on the button, six sent, one each to the six, in the update's words", () => {
      assert.equal(u().everyone.counted, 6);
      assert.deepEqual(u().everyone.answer.body.email, { sent: 6, held: 0, suppressed: 0, failed: 0 });
      assert.deepEqual(u().everyone.mail.map((mail) => [mail.to, mail.subject, mail.kind, mail.replyTo, mail.links]), AGI_PLACES.map((uid) => [address(uid), "Week 1 readings are up", "notice", "ai-safety@uonsu.com", []]));
      assert.equal(
        readFrom(u().everyone.mail[0], "Week 1 readings are up Sent"),
        `Week 1 readings are up ${NOTICE_LINE("you are on this course")} The three readings take about 75 minutes. ` +
          `Bring one question to your session. Sent by Claudia · AGI Strategy Fellowship (Autumn 2026) ${FOOTER}`,
      );
    });

    test("to Group B from its facilitator's page: three on it, three sent, to Group B alone", () => {
      assert.equal(u().groupB.counted, 3);
      assert.deepEqual(u().groupB.answer.body.email, { sent: 3, held: 0, suppressed: 0, failed: 0 });
      assert.deepEqual(u().groupB.mail.map((mail) => [mail.to, mail.replyTo]), IN_B.map((uid) => [address(uid), "ai-safety@uonsu.com"]));
      assert.equal(
        readFrom(u().groupB.mail[0], "Room C20 on Tuesday Sent"),
        `Room C20 on Tuesday ${NOTICE_LINE("you are in this course group")} It’s on the second floor. Come up the main stairs. ` +
          `Sent by Rahul · Group B · AGI Strategy Fellowship (Autumn 2026) ${FOOTER}`,
      );
    });

    test("to the facilitators, and the incubator's lead to her four: each count is who is sent it", () => {
      assert.deepEqual([u().facilitators.counted, u().facilitators.mail.map((mail) => mail.to)], [3, ["amelia", "rahul", "sofia"].map(address)]);
      assert.deepEqual([u().incubator.counted, u().incubator.mail.map((mail) => mail.to)], [4, ["lena", "omar", "tariq", "wen"].map(address)]);
      assert.equal(
        readFrom(u().incubator.mail[0], "Week 1 on Monday Sent"),
        `Week 1 on Monday ${NOTICE_LINE("you are on this course")} Read the first paper before Monday. Sent by Tess · Research Incubator (Autumn 2026) ${FOOTER}`,
      );
    });

    test("a facilitator writes to their own group only", () => {
      for (const refused of [u().ameliaToB, u().ameliaToEveryone]) assert.deepEqual(short(refused), [403, "You can write to your own group only."]);
    });
  });

  // -------------------------------------------------------------------------
  describe("4. the registers: marked by a group's facilitators, read by its lead, shown to each person once finished", () => {
    const r = () => seen.registers;
    const SESSIONS = ["a1", "inc1", "b1", "a2", "inc2", "b2", "a3", "inc3", "b3"];

    test("each person sees their own mark only once the register is finished, and then exactly what was marked", () => {
      for (const key of SESSIONS) {
        const session = r()[key];
        const week = Number(key.at(-1));
        for (const [uid, before] of Object.entries(session.beforeFinish)) {
          assert.deepEqual(before.filter(([n]) => n === week), [], `${key}: ${uid} saw a mark before it was finished`);
        }
        // Group B's third register was finished the morning after: section 9.
        if (key === "b3") continue;
        for (const [uid, after] of Object.entries(session.afterFinish)) {
          assert.deepEqual(after.filter(([n]) => n === week), [[week, session.leadReadsDraft.marks[`week ${week}`][FIRST[uid]]]], `${key}: ${uid}`);
        }
      }
    });

    test("the lead reads every register of her run, a draft included, and marks none", () => {
      for (const key of ["a1", "b1", "a2", "b2", "a3", "b3"]) {
        assert.equal(r()[key].leadReadsDraft.notYetTold, false, key);
        assert.deepEqual(short(r()[key].leadMarks), [403, "Forbidden"], key);
      }
    });

    // The weekly email goes from the press that finishes a register while its
    // job is off (how it ships), once the next week is published. Since the
    // walk of stage two's fixes (G6) it names the session as the placement
    // email names a first session ("Tue 3 Nov, 6pm"), with its end added, and
    // its foot has no dash; until then it said "Tuesday 10 November" and the
    // hours with a dash between.
    test("finishing a register emails the group next week's email once that week is published, and says why not when it is not", () => {
      const reason = (n) => `Week ${n} isn't published yet, so the group wasn't sent a reminder. Publish it and use the run's catch-up send.`;
      assert.deepEqual(
        SESSIONS.map((key) => [key, r()[key].finished.body.sent, r()[key].finished.body.reason ?? null, r()[key].finishMail.map((mail) => mail.to.split("@")[0])]),
        [
          ["a1", 0, reason(2), []],
          ["inc1", 0, reason(2), []],
          ["b1", 3, null, ["amara", "ella", "kofi"]],
          ["a2", 3, null, ["dev", "joel", "priya"]],
          ["inc2", 0, reason(3), []],
          ["b2", 2, null, ["amara", "ella"]],
          ["a3", 0, reason(4), []],
          ["inc3", 0, reason(4), []],
          ["b3", 0, reason(4), []],
        ],
      );
      const amara = r().b1.finishMail[0];
      assert.deepEqual([amara.subject, amara.kind], ["Week 2 · Week 2 of AGI Strategy Fellowship", "course-nudge"]);
      assert.equal(
        readFrom(amara, "Hi "),
        "Hi Amara, Week 2 of AGI Strategy Fellowship is open: Week 2. Your group meets Tue 10 Nov, 6pm to 8pm, Room C20. " +
          "Open this week on the site Read what you can. The week stays open, and nobody is keeping score. You're getting this because " +
          `you're on this course with NAISI. If the weekly email isn't useful to you, you can stop it here. You stay on the course either way. ${FOOTER}`,
      );
      for (const mail of SESSIONS.flatMap((key) => r()[key].finishMail)) {
        assert.doesNotMatch(`${mail.subject} ${mail.text}`, new RegExp(`[${EN_DASH}${EM_DASH}]`), mail.to);
      }
      // Its two links: the week's page and the way to stop it. No meeting link.
      assert.deepEqual(
        amara.links.map((href) => href.replace(/\?t=.*$/, "?t=")),
        [`${APP_URL}/learn/${RUN}/weeks/2`, `${APP_URL}/api/unsubscribe?t=`],
      );
    });

    // The run home's card wrote "Monday 2 November" and the hours with a dash
    // between, and the facilitator's page and roster each had a dash in their
    // note about names (the walk of stage two, G6). The card now says a
    // session as the weekly email does, and neither note has a dash.
    test("the run home's session card says a session as the weekly email does, and the group page and its roster have no dash", () => {
      const u = seen.weekOne;
      assert.deepEqual(u.runHome, {
        amara: "Your first session Group B with Rahul and Sofia Tue 3 Nov, 6pm to 8pm Room C20",
        omar: "Your first session Group A with Tess Mon 2 Nov, 5pm to 7pm Room B5",
      });
      assert.ok(
        u.groupPage.includes("Everyone in the group, when it meets, and the register. Names only: no email addresses appear here. Back to the course"),
        u.groupPage,
      );
      assert.equal(
        u.roster,
        "Who is in this group 3 members Refresh Names only. Nobody's email address appears on this page. To reach the group, use the " +
          "email composer, which looks the addresses up when it sends and never shows them. Facilitator A Amelia Members D Dev J Joel P Priya",
      );
      for (const text of [...Object.values(u.runHome), u.groupPage, u.roster]) {
        assert.doesNotMatch(text, new RegExp(`[${EN_DASH}${EM_DASH}]`), text);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("5. the lead staffs a group on the Facilitators view, and Publish tells who she added", () => {
    const s = () => seen.staffing;

    test("the view names each group's facilitators and everybody approved by full name, and no address", () => {
      assert.deepEqual(
        s().viewBefore.body.groups.map((group) => [group.name, group.when, group.facilitators.map((person) => person.name)]),
        [["Group B", "Tuesdays at 6pm", ["Rahul Mehta", "Sofia Rossi"]], ["Group A", "Thursdays at 6pm", ["Amelia Hart"]]],
      );
      assert.deepEqual(s().viewBefore.body.people.map((person) => person.name), CAST.map(([, name]) => name).sort((a, b) => a.localeCompare(b, "en")));
      assert.doesNotMatch(JSON.stringify(s().viewBefore.body), /@/);
    });

    // A facilitator added after Publish opens their group, its names, its
    // register and the facilitators' updates at once, before Publish tells
    // them, where somebody placed after Publish reads nothing until it does
    // (the walk of stage two, G8).
    test("the change emails nobody, and Tom opens the group, its names and its register before Publish tells him", () => {
      assert.deepEqual([s().changed.body, s().mailedByTheChange], [{ ok: true, facilitatorUids: ["amelia", "tom"] }, 0]);
      assert.deepEqual(s().tomBeforeHeIsTold.roster, { members: ["Dev", "Joel", "Priya"], notYetTold: false });
      assert.deepEqual(s().tomBeforeHeIsTold.register.members, ["Dev", "Joel", "Priya"]);
      assert.equal(s().tomBeforeHeIsTold.page.write, "Write to Group A (3) Posts an update to the group and emails 3 people. Replies go to ai-safety@uonsu.com.");
    });

    // Sent the day after Group A first met, it gave the group's first session
    // as the day its term starts, already past (the walk of stage two, G5).
    // It now names the group's next session on its own calendar.
    test("Publish then owes one email, needs no new test, and sends Tom his, from the group's next session", () => {
      assert.deepEqual([s().summary.emails, s().summary.people, s().summary.facilitators, s().summary.test.state], [1, 0, 1, "fresh"]);
      assert.deepEqual(s().pressed.body.report.facilitators, { sent: 1, held: 0, suppressed: 0 });
      assert.deepEqual(s().pressMail.map((mail) => [mail.to, mail.subject, mail.links]), [[address("tom"), "You’re facilitating Group A: Thursdays at 6pm", [groupPage(RUN, GROUP.A)]]]);
      assert.equal(
        readFrom(s().pressMail[0], "Hi "),
        "Hi Tom, Group A meets on Thursdays at 6pm, from Thu 5 Nov to Thu 3 Dec. Where: Room A13 You’re facilitating with Amelia. " +
          `There are 3 people in the group. Open your group Take the register on your phone during the session. Claudia AGI Strategy lead, NAISI ${FOOTER}`,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("6. somebody leaves, and the lead removes them", () => {
    const l = () => seen.leaving;

    test("the lead's Remove emails nobody, and Kofi reads nothing of the run from then on", () => {
      assert.deepEqual([l().removed.body, l().mailed], [{ ok: true }, 0]);
      for (const label of AFTER_PUBLISH.slice(AFTER_PUBLISH.indexOf("Kofi removed"))) {
        assert.deepEqual(lookAt(label).members.kofi, { programmes: [], updates: { refused: 403 }, marks: { refused: 403 } }, label);
      }
    });

    // The Attendance tab keeps somebody who left in the group whose register
    // marked them, with their marks, as wk-attendance draws "Sam Whitfield,
    // Left Fri 13 Nov"; the register on their facilitators' page, which
    // wk-fac-group draws the same way, lists only who is still in the group
    // (the walk of stage two, G3).
    test("the lead's Attendance keeps Kofi, with his finished mark, while his facilitators' register drops him and it", () => {
      const look = lookAt("Kofi removed");
      const b = look.lead.attendance.groups.find((group) => group.name === "Group B");
      // The lead's tabs name him in full, the sentence about him by the name
      // he goes by (the walk of stage two's fixes, G10).
      assert.deepEqual(b.people.find((person) => person.name === "Kofi Mensah"), { name: "Kofi Mensah", left: "Left", marks: [[1, "excused", "finished"]], came: "0 of 1", inARow: 0 });
      assert.deepEqual(look.facilitators["rahul (Group B)"].register, { members: ["Amara", "Ella"], notYetTold: false, marks: { "week 1, finished": { Amara: "present", Ella: "present" } } });
      assert.deepEqual(look.lead.overview.attention, [["left", "Kofi Mensah left", "Kofi’s off Group B’s register."]]);
      assert.equal(look.lead.overview.people.line, "1 left. Freed places can be offered until Wed 4 Nov, the end of week 1.");
    });

    // Remove is the lead's since the lead's access (#86); changing the row
    // from Accepted on the run's own list is still an admin's. Until the walk
    // of stage two's fixes (G4) Publish waited for that row, so her next
    // press was refused naming him. Now somebody who has left is nobody to
    // place: the board's rail counts Kofi as left and names nobody as having
    // no group, and her press tells Sofia while his row still says Accepted.
    test("the board counts Kofi as left and names nobody as having no group", () => {
      // As People in groups draws it for the lead: his card stays, marked
      // Removed, so it can be moved back, and the column's number leaves him out.
      const board = l().board;
      assert.ok(
        board.startsWith(
          "AGI Strategy Fellowship · Autumn 2026 6 accepted · 5 placed · 0 unallocated · 1 left Refresh Select several " +
            "All 5 accepted applicants are placed, and 1 has left. No one is in two groups.",
        ),
        board,
      );
      assert.match(board, /Unallocated 0 Accepted applicants with no group yet\. Kofi Unpaid Removed /);
      assert.doesNotMatch(board, /has no group|have no group/);
      assert.deepEqual(lookAt("Kofi removed").lead.people.rail, [6, 5, [], 1]);
      assert.deepEqual(lookAt("Kofi removed").lead.people.placed.kofi, [null, false]);
      // Once an admin has changed his row he is off the run's list, and off the board.
      assert.deepEqual(lookAt("Sofia added to Group A and told").lead.people.rail, [5, 5, [], 0]);
    });

    test("her next Publish tells Sofia without waiting for Kofi's row, which only an admin changes", () => {
      assert.deepEqual([l().owed.emails, l().owed.people, l().owed.facilitators, l().owed.refusals], [1, 0, 1, []]);
      assert.deepEqual(l().pressed.body, {
        ok: true,
        report: {
          people: { sent: 0, held: 0, suppressed: 0 },
          facilitators: { sent: 1, held: 0, suppressed: 0 },
          failed: [],
          noAddress: [],
          alreadyTold: 0,
          more: 0,
        },
        unplaced: [],
      });
      assert.deepEqual(l().pressMail.map((mail) => [mail.to, mail.subject]), [[address("sofia"), "You’re facilitating Group A: Thursdays at 6pm"]]);
      assert.equal(
        readFrom(l().pressMail[0], "Hi "),
        // Told on Wed 4 Nov, after the group first met: its next session (G5).
        "Hi Sofia, Group A meets on Thursdays at 6pm, from Thu 5 Nov to Thu 3 Dec. Where: Room A13 You’re facilitating with Amelia and Tom. " +
          `There are 3 people in the group. Open your group Take the register on your phone during the session. Claudia AGI Strategy lead, NAISI ${FOOTER}`,
      );
      assert.deepEqual(short(l().leadDecides), [403, "Forbidden"]);
      assert.deepEqual(l().adminDecides.body, { ok: true });
      assert.deepEqual([l().owedAfter.emails, l().owedAfter.refusals], [0, []]);
    });
  });

  // -------------------------------------------------------------------------
  // The weekly email's foot offers to stop the weekly email; the page it
  // opens unsubscribes the address from the run's cohort list, which updates
  // go through too. So the lead's room change afterwards is not emailed to
  // him, though an update "reaches you whatever your notification settings
  // say" (the walk of stage two, G7). The counts say so honestly.
  describe("7. Joel stops the weekly email", () => {
    test("the page it opens says it stops the cohort's updates, and confirming takes him off the run's list", () => {
      const stop = seen.registers.joelStops;
      assert.equal(
        stop.page,
        "Unsubscribe? You're about to unsubscribe j**el@example.com from the Agi Strategy Fellowship Autumn 2026 cohort updates. We won't send " +
          "any more to that inbox. If this isn't your email or you didn't expect to be here, just close the page. Nothing happens until you " +
          "click the button below. Confirm unsubscribe Cancel",
      );
      assert.deepEqual(stop.confirmed.body, { ok: true, category: `cohort:${RUN}` });
      assert.deepEqual(lookAt("Joel stopped the weekly email").onTheList[RUN], ["amara", "dev", "ella", "priya"]);
    });

    test("then an update to his group emails the other two, as the Messages tab and the group page both count it, and he reads it on his page", () => {
      const look = lookAt("Joel stopped the weekly email");
      assert.deepEqual(look.lead.messages.to.find(([label]) => label.startsWith("Group A")), ["Group A (3)", 2]);
      assert.equal(look.facilitators["amelia (Group A)"].page.write, "Write to Group A (3) Posts an update to the group and emails 2 people. Replies go to ai-safety@uonsu.com.");
      const one = seen.oneGroup;
      assert.deepEqual([one.counted, one.answer.body.email, one.mail.map((mail) => mail.to)], [2, { sent: 2, held: 0, suppressed: 0, failed: 0 }, [address("dev"), address("priya")]]);
      assert.equal(
        readFrom(one.mail[0], "Group A is in A14 on Thursday Sent"),
        `Group A is in A14 on Thursday ${NOTICE_LINE("you are in this course group")} A13 is booked for an exam. Same time. ` +
          `Sent by Claudia · Group A · AGI Strategy Fellowship (Autumn 2026) ${FOOTER}`,
      );
      assert.equal(lookAt("the end of week 3").members.joel.updates.titles[0], "Group A is in A14 on Thursday");
    });
  });

  // -------------------------------------------------------------------------
  describe("8. pitching week on the incubator", () => {
    const k = () => seen.pitching;

    test("while week 3 is not published nobody can open it, and the lead's list says why", () => {
      assert.deepEqual(k().beforeWeek3.omar, { refused: [404, "There’s no pitching week on this programme."], card: null });
      assert.deepEqual([k().beforeWeek3.list.status, k().beforeWeek3.list.published, k().beforeWeek3.list.counts], ["ok", false, []]);
      assert.equal(
        k().beforeWeek3.list.text,
        "Sessions People in groups Times Facilitators Pitches Pitches from week 3 (0) Week 3 isn’t published yet, so nobody can pitch until it is. No pitches yet.",
      );
    });

    test("once it is, the lead's update reaches her four, and each of them is offered the week on their page and their programme's home", () => {
      assert.deepEqual([k().opened.counted, k().opened.mail.map((mail) => mail.to)], [4, ["lena", "omar", "tariq", "wen"].map(address)]);
      const lede = "No pitches yet. Pick up to 2 you’d join before the session on Mon 16 Nov at 5pm.";
      for (const uid of INCUBATOR_PLACES) {
        const page = k().openFor[uid];
        assert.deepEqual([page.lede, page.open, page.picked, page.mine, page.pitches, page.card], [lede, true, "0 of 2", null, [], { lede, open: true }], uid);
        assert.deepEqual(page.partners, INCUBATOR_PLACES.filter((other) => other !== uid).map((other) => FIRST[other]).sort(), uid);
        assert.equal(page.teams, "Tess makes the teams on Mon 23 Nov. Teams are 2 to 3 people.", uid);
      }
    });

    test("a partner edits the pitch's words and keeps its people; somebody on a pitch is nobody else's partner; nobody picks their own", () => {
      assert.equal(k().lenaEdits.status, 200);
      assert.deepEqual(k().lenaEdits.body.view.mine, {
        id: k().lenaEdits.body.view.mine.id,
        title: "Reward hacking evals",
        paperTitle: "Reward hacking in the wild",
        readingId: READING.reward,
        twist: "Rebuild the evaluation with tasks the team writes, and run it on two models.",
        partner: { uid: "wen", name: "Wen" },
        sentByMe: false,
      });
      assert.deepEqual(short(k().tariqAsksOmar), [409, "Omar already has a pitch. Pick somebody else, or pitch alone."]);
      assert.deepEqual(short(k().omarPicksHisOwn), [409, "That’s your own pitch, so you can’t pick it."]);
    });

    test("each person sees which pitches they picked and how many, and the lead and an admin see how many would join each", () => {
      const pages = k().afterPicking;
      assert.deepEqual(
        Object.fromEntries(INCUBATOR_PLACES.map((uid) => [uid, [pages[uid].mine, pages[uid].pitches, pages[uid].picked]])),
        {
          omar: [["Probe transfer", null], [["Probe transfer", "Pitched by you", "yours"], ["Reward hacking evals", "Pitched by Wen and Lena", "picked"]], "1 of 2"],
          wen: [["Reward hacking evals", "Lena"], [["Probe transfer", "Pitched by Omar", "picked"], ["Reward hacking evals", "Pitched by you and Lena", "yours"]], "1 of 2"],
          lena: [["Reward hacking evals", "Wen"], [["Probe transfer", "Pitched by Omar", "picked"], ["Reward hacking evals", "Pitched by you and Wen", "yours"]], "1 of 2"],
          tariq: [null, [["Probe transfer", "Pitched by Omar", "picked"], ["Reward hacking evals", "Pitched by Wen and Lena", "picked"]], "2 of 2"],
        },
      );
      // What the lead counts is what the people picked: three would join Omar's, two Wen and Lena's.
      const picks = (title) => INCUBATOR_PLACES.filter((uid) => pages[uid].pitches.some(([t, , state]) => t === title && state === "picked")).length;
      assert.deepEqual(k().leadList.counts, [["Probe transfer", "Pitched by Omar", picks("Probe transfer")], ["Reward hacking evals", "Pitched by Wen and Lena", picks("Reward hacking evals")]]);
      assert.deepEqual(k().leadList.counts.map(([, , n]) => n), [3, 2]);
      assert.deepEqual(k().adminList.counts, k().leadList.counts);
      assert.equal(
        k().leadList.text,
        "Sessions People in groups Times Facilitators Pitches Pitches from week 3 (2) Probe transfer 3 would join Pitched by Omar Test whether the probes " +
          "still work on a smaller open model. Reward hacking evals 2 would join Pitched by Wen and Lena Rebuild the evaluation with tasks the team " +
          "writes, and run it on two models.",
      );
      // Nobody's page counts anybody's picks.
      for (const uid of INCUBATOR_PLACES) assert.doesNotMatch(pages[uid].drawn, /would join|\d+ (?:people|person) picked/, uid);
    });

    test("pitching week is for the people in its group: its lead, an admin, another programme's lead and a fellowship member are refused alike", () => {
      const NOT_FOR_YOU = [403, "Pitching week is for the people in this programme’s groups."];
      assert.deepEqual(k().staffAsk, { tess: NOT_FOR_YOU, zach: NOT_FOR_YOU, claudia: NOT_FOR_YOU, amara: NOT_FOR_YOU });
      assert.deepEqual(k().otherLeadList.status, "none");
    });

    test("the group's session closes it: a pick taken back a minute before stands, and after it both writers refuse", () => {
      assert.equal(k().lastMinute.status, 200);
      const CLOSED = [409, "Pitching has closed: your group’s session has started."];
      assert.deepEqual([short(k().afterTheClose), short(k().pitchAfterTheClose)], [CLOSED, CLOSED]);
      const lede = "Pitching closed at 5pm on Mon 16 Nov, when your group’s session started.";
      assert.deepEqual([k().closed.tariq.lede, k().closed.tariq.open, k().closed.tariq.picked], [lede, false, "1 of 2"]);
      assert.deepEqual(k().closedList.counts.map(([, , n]) => n), [3, 1]);
      assert.deepEqual(k().thatEvening.omar.card, { lede, open: false });
      assert.deepEqual([k().nextDay.omar.card, k().nextDay.omar.lede], [null, lede]);
    });
  });

  // -------------------------------------------------------------------------
  describe("9. week 3's last register: the Overview, Remind and the CSV", () => {
    test("the morning after, the Overview says Group B's register is not finished and offers Remind with its count", () => {
      const look = lookAt("Group B's register not finished");
      const b = look.lead.overview.sessions.find((session) => session.group === "Group B");
      assert.deepEqual(b, {
        group: "Group B",
        when: "Tue 17 Nov · 6pm",
        where: "Room C20",
        // By their whole names, as wk-overview draws them (the walk of stage two's fixes, G10).
        facilitators: ["Rahul Mehta", "Sofia Rossi"],
        pill: "Register not pushed",
        line: "Saved, not pushed. 2 of 2 so far.",
        remind: ["Remind Rahul and Sofia", 2, "Emails 2 people", "Remind Rahul and Sofia to push Group B’s register for Tue 17 Nov? This emails 2 people.", "w03"],
        reminded: null,
      });
      assert.deepEqual(look.lead.overview.attention, [
        ["week", "Week 4 isn’t ready, and Groups A and B have reached it", "Groups A and B meet again from Thu 19 Nov. Week 4 isn’t published, so people in these groups can’t open it yet."],
        ["register", "Group B’s register for Tue 17 Nov isn’t pushed", "If it’s still not pushed on Fri 20 Nov at 8am, you and admins get a task."],
        ["left", "Kofi Mensah left", "Kofi’s off Group B’s register."],
      ]);
    });

    // The Overview, the grid and the register's own button say "push" while
    // next week's email is not on its schedule (how it ships). Until the walk
    // of stage two's fixes (G9) the reminder the press sends said "finished"
    // in its subject, its first line and its last; it now follows the same
    // switch, and says "finished" only while next week's email is on its
    // schedule and the button is "Finish the register".
    test("Remind emails the two of them once each, a second press is refused, and the card says who was reminded", () => {
      const m = seen.remind;
      assert.deepEqual(m.pressed.body, { emailed: 2, failed: 0, names: ["Rahul", "Sofia"] });
      assert.deepEqual(
        m.mail.map((mail) => [mail.to, mail.subject, mail.kind, mail.links]),
        ["rahul", "sofia"].map((uid) => [address(uid), "Group B’s register isn’t pushed", "course-facilitator", [groupPage(RUN, GROUP.B), groupPage(RUN, GROUP.B)]]),
      );
      assert.equal(
        readFrom(m.mail[0], "Hi "),
        "Hi Rahul, Group B’s register for Tue 17 Nov isn’t pushed yet. Push attendance to lock the register, show everyone their mark and " +
          `email the group about next week. Open the register Or paste this into your browser: ${groupPage(RUN, GROUP.B)} If the session didn’t ` +
          `happen, the register can say so, and it still needs pushing. If it’s still not pushed 60 hours after the session, Claudia and admins get a task. ${FOOTER}`,
      );
      assert.doesNotMatch(`${m.mail[1].subject} ${m.mail[1].text}`, /finish/i);
      assert.deepEqual(short(m.again), [409, "Nobody is left to remind about Group B’s register: its facilitators have been reminded already, or can’t be emailed."]);
      const b = m.overview.sessions.find((session) => session.group === "Group B");
      assert.deepEqual([b.remind, b.reminded], [null, "Rahul and Sofia were reminded on Wed 18 Nov at 9am."]);
    });

    test("the reminder's words, both versions, follow the switch the register's button reads", () => {
      const facts = (scheduled) => ({
        groupName: "Group B",
        sessionStartsAt: new Date("2026-11-17T18:00:00Z"),
        scheduled,
        task: { hours: 60, leadName: "Claudia" },
      });
      // While next week's email is not on its schedule (how it ships): "Push attendance".
      assert.deepEqual(lib.reminderWords(facts(false)), {
        subject: "Group B’s register isn’t pushed",
        lead: "Group B’s register for Tue 17 Nov isn’t pushed yet.",
        effect: "Push attendance to lock the register, show everyone their mark and email the group about next week.",
        notHeld: "If the session didn’t happen, the register can say so, and it still needs pushing.",
        next: "If it’s still not pushed 60 hours after the session, Claudia and admins get a task.",
      });
      // While it is: "Finish the register".
      assert.deepEqual(lib.reminderWords(facts(true)), {
        subject: "Group B’s register isn’t finished",
        lead: "Group B’s register for Tue 17 Nov isn’t finished yet.",
        effect: "Finish the register to lock it and show everyone their mark. Nobody’s emailed.",
        notHeld: "If the session didn’t happen, the register can say so, and it still needs finishing.",
        next: "If it’s still not finished 60 hours after the session, Claudia and admins get a task.",
      });
      // The Overview the lead pressed Remind on read the same switch: its words are the push ones.
      assert.equal(lookAt("Group B's register not finished").lead.overview.sessions.find((session) => session.group === "Group B").pill, "Register not pushed");
    });

    // Its Name column holds whole names, so two people who go by one first
    // name are told apart, and its groups come in People in groups' order
    // (the walk of stage two's fixes, G10); until then first names, A to D.
    test("the CSV is the grid: every row, every mark in words, Came and Of, and Kofi's leaving", () => {
      assert.equal(
        seen.csv,
        `${BOM}Group,Name,Week 1,Week 2,Week 3,Week 4,Week 5,Week 6,Came,Of,Left\n` +
          "Group B,Amara Okafor,Present,Late,Present,,,,3,3,\n" +
          "Group B,Ella Robinson,Present,Present,Left early,,,,3,3,\n" +
          "Group B,Kofi Mensah,Excused,,,,,,0,1,Yes\n" +
          "Group A,Dev Patel,Present,Present,Present,,,,3,3,\n" +
          "Group A,Joel Adeyemi,Late,Present,Absent,,,,2,3,\n" +
          "Group A,Priya Nair,Absent,Late,Present,,,,2,3,",
      );
      const grid = lookAt("the end of week 3").lead.attendance;
      assert.deepEqual(
        grid.groups.flatMap((group) => group.people.map((person) => [group.name, person.name, person.came])),
        [
          ["Group B", "Amara Okafor", "3 of 3"],
          ["Group B", "Ella Robinson", "3 of 3"],
          ["Group B", "Kofi Mensah", "0 of 1"],
          ["Group A", "Dev Patel", "3 of 3"],
          ["Group A", "Joel Adeyemi", "2 of 3"],
          ["Group A", "Priya Nair", "2 of 3"],
        ],
      );
    });
  });

  // -------------------------------------------------------------------------
  describe("10. at every moment, the lead's tabs agree with what each facilitator and each member is shown", () => {
    test("an admin is shown the lead's tabs, but for the people placed and not yet told, and the words for who gets a task", () => {
      for (const label of MOMENTS) {
        const look = lookAt(label);
        const asLead = (tabs) => JSON.parse(JSON.stringify(tabs).replaceAll("Claudia and admins get a task", "you and admins get a task"));
        if (label === BEFORE_PUBLISH) {
          assert.deepEqual([look.admin.messages, look.admin.people, look.admin.facilitators], [look.lead.messages, look.lead.people, look.lead.facilitators], label);
          continue;
        }
        assert.deepEqual(asLead(look.admin), look.lead, label);
      }
    });

    // Groups were Monday first on People in groups and Facilitators, A to D on
    // Attendance and the Times view, in meeting order on the Overview's
    // sessions and in stored order on Messages (the walk of stage two, G10).
    // Every tab now lists them in People in groups' order.
    test("every tab of the programme page lists the groups in one order, the order People in groups draws them in", () => {
      for (const label of MOMENTS) {
        const look = lookAt(label);
        for (const { tabs, programme } of RUNS) {
          const order = look[tabs].people.groups.map(([name]) => name);
          const where = `${label}: ${programme}`;
          assert.deepEqual(look[tabs].facilitators.map(([name]) => name), order, `${where}, Facilitators`);
          assert.deepEqual(look[tabs].times, order, `${where}, Times`);
          assert.deepEqual(look[tabs].attendance.groups.map((group) => group.name), order, `${where}, Attendance`);
          assert.deepEqual(
            look[tabs].messages.to.slice(1, 1 + order.length).map(([option]) => option.replace(/ \(\d+\)$/, "")),
            order,
            `${where}, Messages`,
          );
          const sessions = look[tabs].overview.sessions.map((session) => session.group);
          assert.deepEqual(sessions, order.filter((name) => sessions.includes(name)), `${where}, the Overview's sessions`);
        }
      }
      // Monday first: Group B meets on Tuesdays, Group A on Thursdays, and in
      // week 3 the Overview shows both, Thursday's first session of the week
      // after Tuesday's.
      assert.deepEqual(lookAt("the end of week 3").lead.people.groups.map(([name]) => name), ["Group B", "Group A"]);
      assert.deepEqual(lookAt("Group B's register not finished").lead.overview.sessions.map((session) => [session.group, session.when]), [
        ["Group B", "Tue 17 Nov · 6pm"],
        ["Group A", "Thu 12 Nov · 6pm"],
      ]);
    });

    test("each group's count on the Messages tab is the people its facilitators' pages, rosters and registers name, and who read it as their group", () => {
      for (const label of MOMENTS) {
        const look = lookAt(label);
        for (const { runId, tabs, viewer, programme, groups } of RUNS) {
          const everyone = Object.values(groups).flatMap((name) => shownIn(look, runId, name));
          const onTheList = (names) => names.filter((name) => look.onTheList[runId].includes(uidOf[name])).length;
          const facilitators = [...new Set(Object.keys(groups).flatMap((key) => look.staffing[key]))];
          // Never the writer's own email, and the facilitators are not offered
          // to the one facilitator there is (the walk of stage two's fixes, G2).
          const alone = facilitators.length === 1 && facilitators[0] === viewer;
          const expected = [
            [`Everyone on ${programme} (${everyone.length})`, onTheList(everyone)],
            ...Object.entries(groups).map(([, name]) => [`${name} (${shownIn(look, runId, name).length})`, onTheList(shownIn(look, runId, name))]),
            ...(alone ? [] : [[`The facilitators (${facilitators.length})`, facilitators.filter((uid) => uid !== viewer).length]]),
          ];
          assert.deepEqual(look[tabs].messages.to, expected, `${label}: ${programme}`);
          // Who is placed and not yet told, as the board has them: said under
          // To and on the facilitators' write line (the walk of stage two's fixes, G1).
          const notTold = (key) => Object.values(look[tabs].people.placed).filter(([group, told]) => group === key && !told).length;
          assert.deepEqual(
            look[tabs].messages.waiting,
            [
              waitingWords(Object.keys(groups).reduce((sum, key) => sum + notTold(key), 0), "in groups"),
              ...Object.entries(groups).map(([key, name]) => waitingWords(notTold(key), `in ${name}`)),
              ...(alone ? [] : [null]),
            ],
            `${label}: ${programme}, under To`,
          );
          for (const [key, name] of Object.entries(groups)) {
            const names = shownIn(look, runId, name);
            const emails = onTheList(names);
            for (const uid of look.staffing[key]) {
              const theirs = look.facilitators[`${uid} (${key})`];
              assert.ok(theirs, `${label}: ${uid} facilitates ${key} and was not looked at`);
              assert.equal(
                theirs.page.write,
                `Write to ${name} (${names.length}) Posts an update to the group` +
                  (emails > 0 ? ` and emails ${people(emails)}. Replies go to ai-safety@uonsu.com.` : ". Nobody in it can be emailed yet.") +
                  (notTold(key) > 0 ? ` ${waitingWords(notTold(key), "in it", "it")}` : ""),
                `${label}: ${uid}`,
              );
              assert.deepEqual(theirs.roster, { members: names, notYetTold: label === BEFORE_PUBLISH }, `${label}: ${uid}'s roster`);
              assert.deepEqual(theirs.register.members, names, `${label}: ${uid}'s register`);
            }
          }
        }
      }
    });

    test("the register the lead reads is the one each facilitator reads, and her grid holds its marks for everybody still in the group", () => {
      for (const label of AFTER_PUBLISH) {
        const look = lookAt(label);
        for (const { runId, tabs, groups } of RUNS) {
          for (const [key, name] of Object.entries(groups)) {
            const lead = look[tabs].registers.find((heading) => heading.name === name).register;
            for (const uid of look.staffing[key]) assert.deepEqual(look.facilitators[`${uid} (${key})`].register, lead, `${label}: ${uid}`);
            const grid = look[tabs].attendance.groups.find((group) => group.name === name);
            const marks = marksByPerson(lead);
            const staying = grid.people.filter((person) => person.left === null);
            // The grid names each person in full, the register by the name
            // they go by (the walk of stage two's fixes, G10): the same
            // people, with the same marks.
            assert.deepEqual(staying.map((person) => person.name), shownIn(look, runId, name).map((first) => FULL[uidOf[first]]), `${label}: ${name}'s rows`);
            for (const person of staying) assert.deepEqual(person.marks, marks[FIRST_OF[person.name]] ?? [], `${label}: ${person.name}`);
            assert.deepEqual(
              grid.people.filter((person) => person.left !== null).map((person) => person.name),
              runId === RUN && name === "Group B" && AFTER_PUBLISH.indexOf(label) >= AFTER_PUBLISH.indexOf("Kofi removed") ? ["Kofi Mensah"] : [],
              `${label}: ${name}'s leavers`,
            );
          }
          // The Overview counts who is taking part as the Messages tab counts everyone.
          const everyone = Object.values(groups).flatMap((name) => shownIn(look, runId, name)).length;
          assert.equal(look[tabs].overview.people.takingPart, everyone, `${label}: taking part`);
        }
      }
    });

    test("each member reads the updates to everyone and to their own group, and their own finished marks; each facilitator the ones to them", () => {
      for (const label of AFTER_PUBLISH) {
        const look = lookAt(label);
        for (const { runId, groups } of RUNS) {
          for (const [key, name] of Object.entries(groups)) {
            const register = look.facilitators[`${look.staffing[key][0]} (${key})`].register;
            const finished = marksByPerson(register);
            for (const first of shownIn(look, runId, name)) {
              const uid = uidOf[first];
              assert.deepEqual(look.members[uid].updates.titles, meant(look, runId, ["everyone", key]), `${label}: ${uid}`);
              assert.deepEqual(
                look.members[uid].marks,
                (finished[first] ?? []).filter(([, , state]) => state === "finished").map(([week, status]) => [week, status]),
                `${label}: ${uid}'s marks`,
              );
            }
            for (const uid of look.staffing[key]) {
              const theirs = look.facilitators[`${uid} (${key})`];
              const groupsOfTheirs = Object.entries(look.staffing).filter(([, uids]) => uids.includes(uid)).map(([group]) => group);
              assert.deepEqual(theirs.updates.titles, meant(look, runId, ["everyone", "facilitators", ...groupsOfTheirs]), `${label}: ${uid} reads`);
              assert.deepEqual(theirs.page.updates.map(([title]) => title), meant(look, runId, ["everyone", "facilitators", key]), `${label}: ${uid}'s page for ${key}`);
            }
          }
          // The lead and an admin list every update on the run, each with who it was to.
          assert.deepEqual(look[RUNS.find((each) => each.runId === runId).tabs].messages.updates.map(([title]) => title), meant(look, runId, ["everyone", "facilitators", ...Object.keys(groups)]), `${label}: the Messages tab`);
        }
        // Nobody reads a run they are not on.
        for (const uid of POOLED) assert.deepEqual(look.members[uid], { programmes: [], updates: { refused: 403 }, marks: { refused: 403 } }, `${label}: ${uid}`);
        assert.deepEqual(look.others["yusuf on AGI Strategy"].titles, meant(look, RUN, ["everyone", "facilitators", "Group A", "Group B"]), `${label}: the track lead`);
        for (const other of ["tess on AGI Strategy", "claudia on the incubator", "amara on the incubator", "rahul on the incubator"]) {
          assert.deepEqual(look.others[other], { refused: 403 }, `${label}: ${other}`);
        }
      }
    });

    test("before Publish the facilitators read what is to them, and nobody placed reads anything", () => {
      const look = lookAt(BEFORE_PUBLISH);
      assert.deepEqual(look.facilitators["rahul (Group B)"].updates.titles, ["See you on Tuesday", "The facilitators’ guide for week 1", "Welcome to AGI Strategy"]);
      assert.deepEqual(look.facilitators["amelia (Group A)"].updates.titles, ["The facilitators’ guide for week 1", "Welcome to AGI Strategy"]);
      assert.deepEqual(look.others["tom on AGI Strategy"], { refused: 403 });
    });

    test("a member's Updates shows three, newest first, then Show older updates", () => {
      const amara = lookAt("the end of week 3").members.amara.updates;
      assert.deepEqual(amara.lines, [
        "Rahul · to Group B · Wed 28 Oct",
        "Claudia · to everyone on AGI Strategy · Wed 28 Oct",
        "Rahul · to Group B · Tue 27 Oct",
        "Claudia · to everyone on AGI Strategy · Tue 27 Oct",
      ]);
      assert.equal(
        amara.drawn,
        "Updates R Room C20 on Tuesday Rahul · to Group B · Wed 28 Oct It’s on the second floor. Come up the main stairs. C Week 1 readings are " +
          "up Claudia · to everyone on AGI Strategy · Wed 28 Oct The three readings take about 75 minutes. Bring one question to your session. " +
          "R See you on Tuesday Rahul · to Group B · Tue 27 Oct We meet in Room C20. Show older updates",
      );
    });

    // Updates to the facilitators counted and emailed every facilitator of a
    // live group. The incubator's one group is run by its lead, so her own tab
    // offered "The facilitators (1)", and an update to it emailed her (the
    // walk of stage two, G2), while Publish never writes to her as a
    // facilitator. The writer is now left out of their own update's email,
    // and is not offered the facilitators when they are the only one.
    test("on the incubator its lead is its one facilitator: she is not offered herself, and never emailed her own update", () => {
      for (const label of MOMENTS) {
        assert.deepEqual(
          lookAt(label).incubatorLead.messages.to.filter(([option]) => option.startsWith("The facilitators")),
          [],
          label,
        );
        assert.deepEqual(lookAt(label).staffing["the incubator's Group A"], ["tess"], label);
      }
      // Asked for anyway, the email has nobody to go to, and nothing is posted.
      assert.deepEqual(short(seen.weekOne.tessToFacilitators), [400, "Nobody it’s to can be emailed yet. Turn off Also email it to post it."]);
      assert.ok(!lookAt("the end of week 3").stored.some((update) => update.title === "Notes for Monday"));
      // AGI Strategy's lead runs no group, and is offered all its facilitators.
      assert.deepEqual(lookAt("the end of week 3").lead.messages.to.at(-1), ["The facilitators (4)", 4]);
    });

    test("a writer who is one facilitator among several is offered them all, and their email goes to the others", () => {
      const l = seen.leadFacilitates;
      assert.deepEqual(l.staffed.body, { ok: true, facilitatorUids: ["rahul", "sofia", "claudia"] });
      // Five read it, the lead among them; four are emailed.
      assert.deepEqual(l.offered, ["The facilitators (5)", 4]);
      assert.deepEqual([l.posted.counted, l.posted.answer.body.email], [4, { sent: 4, held: 0, suppressed: 0, failed: 0 }]);
      assert.deepEqual(l.posted.mail.map((mail) => mail.to).sort(), ["amelia", "rahul", "sofia", "tom"].map(address));
    });

    test("a writer who is in the group they write to, and on its list, is left out of its email", () => {
      const a = seen.adminInTheGroup;
      // Four read it, the writer among them; Joel stopped the list, and the writer is not emailed.
      assert.deepEqual(a.offered, ["Group A (4)", 2]);
      assert.deepEqual([a.posted.counted, a.posted.answer.body.email], [2, { sent: 2, held: 0, suppressed: 0, failed: 0 }]);
      assert.deepEqual(a.posted.mail.map((mail) => mail.to).sort(), [address("dev"), address("priya")]);
    });
  });
});
