/**
 * STAGE THREE OF THE COURSE HUB: one term from week 3 to after its end,
 * through leaving a placed run and who finished at once.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Two pieces were built beside each other, each with suites of its own on
 * sample documents shaped the way that piece expects: leaving a run the
 * application form placed you on (the confirmation, the page somebody reads
 * once they have left, the facilitators'
 * register listing a leaver read only, Remove recording the day, the place on
 * the form given back) and who finished (the rule on Settings, Who finished
 * on the Overview after the last session, the head's "Finished", every
 * member page asking the record, the run's destroy). What neither can see is
 * the seam between them and the pieces already there: a person one screen
 * calls left and another calls finished, a day one page writes and another
 * reads, a promise a page makes that the next press does not keep.
 *
 * So this file runs ONE term through the real route handlers and pages, on
 * one database, and at each moment asserts what every person is shown:
 *
 *  1. Decision day to Publish, made small (the stage one and two journeys
 *     assert it in full), then weeks 1 and 2, marked and finished by each
 *     group's facilitators, and the lead removing somebody after week 1.
 *  2. In week 3 a placed member leaves with a reason, behind the typed
 *     confirmation, and reads the page that says so and nothing else of the
 *     run, at its notes and reading list addresses too. The lead's
 *     Overview, Attendance and CSV, the
 *     facilitators' register and the lead's Applications agree about them;
 *     the place on the form is given back; the email is the leave's.
 *  3. A facilitator cancels a session through Change a session, and the
 *     weeks run to the last session. Before it, who finished cannot be said.
 *  4. After it: the head, Who finished with no rule, the rule set on Settings
 *     and moved across its edges, the lead's change kept and marked, the
 *     refusals.
 *  5. Each member's pages: finished, ended or left, and nothing claims a
 *     person finished who did not.
 *  6. Somebody who finished presses "Leave the programme" after the end.
 *  7. The run's destroy counts and drains the finishing rows.
 *
 * Where two pieces disagree today the test pins what is so and its comment
 * names the disagreement (H1 onwards, written up in the walk's notes), so a
 * change to either piece has to change this file on purpose.
 *
 * ## How it is laid out
 *
 * As the stage two journey: `tellTheStory()` makes every request once, in
 * order, and writes down what came back (`seen`); the tests read what was
 * written down. A request that goes wrong is recorded like any other and the
 * story carries on. The world has one signed-in user, so no two requests
 * are ever in flight.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route handler named below, the libraries behind them, the
 * access predicates, the email templates, the pages' loaders and the server
 * pages it draws (the programme's head, Overview, Attendance and Settings
 * tabs, the run's page, the leaving confirmation, the notes and the reading
 * list), the who finished section and the rule's card, and the member's run
 * home, card, programmes list and Home line drawn from the routes' own
 * answers. Stubbed: `server-only`, `next/server`, `next/link`,
 * `next/navigation`, the stylesheets, the Admin SDK's sentinels and handle,
 * the session, the view-as guard, the push mirrors, `sendEmail` (which
 * writes down what it was handed), and on the member's run home the parts
 * drawn around the words this file is about. No message can leave this
 * process. The clock is the runner's, set by the story.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "@react-email/render";
import { createLoader } from "./lib/tsLoader.mjs";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { courseView } from "./lib/courseRunStore.mjs";
import { walkSource } from "./lib/functionScan.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

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
  /** The course view with `count()` on its queries, for the destroy's manifest. */
  countingDb: null,
  /** True for the length of one request to a course route or one page drawn. */
  course: false,
  /** True while the destroy's routes run: they count with aggregate queries. */
  counting: false,
  user: null,
  /** Every message handed to the one mail door, in order. */
  mail: [],
  /** Every notification handed to a push mirror. */
  pushes: [],
  /** What the run's page hands the run home, while one is drawn. */
  runHome: null,
  /** What the member's run home is handed by its one fetch, while it is drawn. */
  overview: null,
  /** The selected tab under the programme's head. */
  segment: "overview",
};
globalThis.__stageThree = { world, h: createElement };
const W = "globalThis.__stageThree.world";
const H = "globalThis.__stageThree.h";

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
/** Every stylesheet any file under `src` imports, by the specifier it is imported by. */
function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}
const MAIL_DOOR =
  "export async function sendEmail(args) {\n" +
  `  ${W}.mail.push(args);\n` +
  "  return { messageId: 'm', delivered: [args.to], suppressed: [], held: [] };\n" +
  "}\n" +
  "export async function sendPushToUid() {\n" +
  "  return { sent: 0, pruned: 0, deferred: 0, failed: 0, retried: 0 };\n" +
  "}";
/** A component stood in by its name: the words around it are what is read. */
const QUIET = (name) => `export default function ${name}() { return ${H}('span', { 'data-stub': '${name}' }); }`;

const SERVER_STUBS = [
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
  [
    "@/lib/firebase/admin",
    `export function getAdminDb() { return ${W}.course ? (${W}.counting ? ${W}.countingDb : ${W}.courseDb) : ${W}.db; }\n` +
      "export function getAdminAuth() { return undefined; }\n" +
      "export function getAdminStorage() { return null; }",
  ],
  [
    "@/lib/firebase/session",
    `export async function getCurrentUser() { return ${W}.user; }\n` +
      `export async function getSessionUid() { const u = ${W}.user; return u ? { uid: u.uid, email: u.email } : null; }\n` +
      "export const SESSION_COOKIE = '__session';",
  ],
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
  ["@/lib/push/courseNotifications", `export async function mirrorCourseDecisionToPush(uid, note) { ${W}.pushes.push({ uid, ...note }); }`],
  ["@/lib/push/noticeNotifications", `export async function sendNoticePush(uid, note) { ${W}.pushes.push({ uid, ...note }); return false; }`],
  // The pages, drawn to HTML as the server sends them.
  [
    "next/link",
    "export default ({ href, className, children, scroll, prefetch, ...rest }) =>\n" +
      `  ${H}('a', { href, className, 'aria-current': rest['aria-current'] }, children);`,
  ],
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {}, back() {} }; }\n" +
      "export function usePathname() { return '/'; }\n" +
      "export function useSearchParams() { return new URLSearchParams(); }\n" +
      `export function useSelectedLayoutSegment() { return ${W}.segment; }`,
  ],
  // Before the page's script arrives, as the server draws it.
  ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
  // The run's page hands the run home what it decided: written down, drawn as its name.
  ["@/features/courses/RunHome", `export default function RunHome(props) { ${W}.runHome = props; return ${H}('div', null, '[RunHome]'); }`],
  // An admin's Course run panel on Settings: another job's, drawn as its name.
  ["@/features/applications/editor/RunHandOver", QUIET("RunHandOver")],
  [
    "@/lib/firebase/client",
    ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
      .map((name) => `export function ${name}() { throw new Error('no client SDK here'); }`)
      .join("\n"),
  ],
  // The group page's cards that read in the browser draw their own names.
  ["@/features/courses/SessionCard", QUIET("SessionCard")],
  ["@/features/courses/GroupRoster", QUIET("GroupRoster")],
  ["@/features/courses/AttendanceGrid", QUIET("AttendanceGrid")],
];
const STYLE_STUBS = stylesheets().map((specifier) => [specifier, CLASS_NAMES]);
const { loadTs } = createLoader({ stubs: new Map([...SERVER_STUBS, ...STYLE_STUBS]) });

/**
 * The member's own pages, with what is drawn around their words stood in:
 * the run home is handed the overview route's own answer to them.
 */
const { loadTs: loadMember } = createLoader({
  stubs: new Map([
    ...SERVER_STUBS.filter(([specifier]) => specifier !== "@/features/courses/RunHome"),
    ...STYLE_STUBS,
    ["./useRunOverview", `export function useRunOverview() { return { data: ${W}.overview, error: null, reload() {} }; }`],
    ["@/features/courses/useRunOverview", `export function useRunOverview() { return { data: ${W}.overview, error: null, reload() {} }; }`],
    ["./useSyncTasks", "export function useSyncTasks() {}\nexport function SyncTasksTrigger() { return null; }"],
    ["@/hooks/useMagneticPull", "export function useMagneticPull() { return { current: null }; }"],
    ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${H}('div', { className }, children); }`],
    ["@/components/motion/DigitRoll", `export default function DigitRoll({ value }) { return ${H}('span', null, value); }`],
    ["@/components/ui/Button", `export default function Button({ children }) { return ${H}('button', null, children); }`],
    ["@/components/ui/Card", `export default function Card({ children }) { return ${H}('section', null, children); }`],
    ["@/components/ui/Chip", `export default function Chip({ children }) { return ${H}('span', null, children); }`],
    ["@/components/ui/ProgressRing", "export default function ProgressRing() { return null; }"],
    ["@/components/ui/ProgressBar", "export default function ProgressBar() { return null; }"],
    ["@/components/ui/EmptyState", QUIET("EmptyState")],
    ["@/components/ui/Skeleton", QUIET("Skeleton")],
    [
      "@/components/ui/PageHead",
      `export default function PageHead({ title, description }) { return ${H}('header', null, ${H}('h1', null, title), description); }`,
    ],
    ["./FacilitatorGroupPanel", QUIET("FacilitatorGroupPanel")],
    ["./SessionCard", QUIET("SessionCard")],
    ["./sessionChange/SessionNotice", QUIET("SessionNotice")],
    [
      "./sessionChange/cardFacts",
      "export function cancelledIn() { return []; }\nexport function coversTitle() { return ''; }\n" +
        "export function nextSessionCard() { return null; }\nexport function ticketFacts() { return null; }",
    ],
    ["./updates/RunUpdates", QUIET("RunUpdates")],
    ["./WeekRail", QUIET("WeekRail")],
    ["@/features/courses/useRunProgress", "export function useRunProgress() { return { byItemId: new Map(), rows: [], loading: false }; }"],
    ["@/features/courses/useWeek", "export function useWeek() { return { data: null, loading: false, error: null }; }"],
    ["./NextSession", "export default function NextSession() { return null; }\nexport function sessionFacts() { return null; }"],
    ["./icons", "export const ArrowRight = () => null; export const Check = () => null; export const External = () => null;"],
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
  csv: await formRoute(R, "programmes", PG, "attendance", "export"),
  remind: await formRoute(R, "programmes", PG, "registers", "remind"),
  finishing: await formRoute(R, "programmes", PG, "finishing"),
  rule: await formRoute(R, "programmes", PG, "finishing", "rule"),
};
const courseRoutes = {
  runStatus: await courseRoute("runs", "[runId]", "status"),
  facilitators: await courseRoute("groups", "[groupId]", "facilitators"),
  board: await courseRoute("runs", "[runId]", "allocation"),
  allocate: await courseRoute("runs", "[runId]", "allocate"),
  publishTest: await courseRoute("runs", "[runId]", "allocation", "publish", "test"),
  publish: await courseRoute("runs", "[runId]", "allocation", "publish"),
  remove: await courseRoute("runs", "[runId]", "enrolments", "[uid]", "remove"),
  enrol: await courseRoute("runs", "[runId]", "enrol"),
  me: await courseRoute("me"),
  overview: await courseRoute("runs", "[runId]", "overview"),
  register: await courseRoute("groups", "[groupId]", "attendance"),
  finish: await courseRoute("groups", "[groupId]", "attendance", "push"),
  change: await courseRoute("groups", "[groupId]", "session", "change"),
  updates: await courseRoute("runs", "[runId]", "updates"),
  submit: await courseRoute("runs", "[runId]", "exercises", "[exerciseId]", "submit"),
  manifest: await courseRoute("runs", "[runId]", "destroy-manifest"),
  destroy: await courseRoute("runs", "[runId]", "destroy"),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const LEARN = join("app", "(app)", "learn", "[runId]");
const pages = {
  head: (await loadTs(join(TABS, "layout.tsx"))).default,
  overview: (await loadTs(join(TABS, "overview", "page.tsx"))).default,
  attendance: (await loadTs(join(TABS, "attendance", "page.tsx"))).default,
  setup: (await loadTs(join(TABS, "setup", "page.tsx"))).default,
  run: (await loadTs(join(LEARN, "page.tsx"))).default,
  runLayout: (await loadTs(join(LEARN, "layout.tsx"))).default,
  leave: (await loadTs(join(LEARN, "leave", "page.tsx"))).default,
  notes: (await loadTs(join(LEARN, "notes", "page.tsx"))).default,
  reading: (await loadTs(join(LEARN, "reading", "page.tsx"))).default,
  group: (await loadTs(join(LEARN, "group", "[groupId]", "page.tsx"))).default,
};
const member = {
  RunHome: (await loadMember(join("features", "courses", "RunHome.tsx"))).default,
  RunCard: (await loadMember(join("features", "courses", "RunCard.tsx"))).default,
  MyCoursesSummary: (await loadMember(join("features", "courses", "MyCoursesSummary.tsx"))).default,
  HomeProgramme: (await loadMember(join("app", "(app)", "dashboard", "HomeProgramme.tsx"))).default,
};
const { normalizeCourseRun, sessionKey } = await loadTs(join("lib", "firestore", "courses.ts"));

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
  /** Sat 24 Oct: the run is named while a draft, and moved on. */
  naming: "2026-10-24T10:00:00Z",
  /** Mon 26 Oct. */
  handingOver: "2026-10-26T10:00:00Z",
  placing: "2026-10-26T14:00:00Z",
  /** Tue 27 Oct, 5:38pm: the lead's test, then her Publish. */
  publishing: "2026-10-27T17:38:00Z",
  /** Wed 4 Nov, after each group's first session: the lead removes Joel. */
  removing: "2026-11-04T10:00:00Z",
  /** Fri 13 Nov, in week 3, after Group B's second session and before its third. */
  leaving: "2026-11-13T10:00:00Z",
  /** Wed 18 Nov: Rahul cancels Group B's session of Tue 24 Nov, keeping pace. */
  cancelling: "2026-11-18T10:00:00Z",
  /** Wed 25 Nov, 9am: the morning after the session that did not happen. */
  dayAfterTheCancelled: "2026-11-25T09:00:00Z",
  /** Tue 8 Dec at noon: the last session, Group B's, is at 6pm. */
  lastDay: "2026-12-08T12:00:00Z",
  /** Wed 9 Dec, 9am: the run's last session is over; its last week runs to tonight. */
  afterTheEnd: "2026-12-09T09:00:00Z",
  /** Wed 9 Dec, 10am: the lead sets the rule on Settings. */
  settingTheRule: "2026-12-09T10:00:00Z",
  /** Wed 9 Dec, 11am: the lead goes through the list. */
  deciding2: "2026-12-09T11:00:00Z",
  /** Thu 10 Dec, noon: every member's calendar is past its last week. */
  membersAfter: "2026-12-10T12:00:00Z",
  /** Thu 10 Dec, 1pm: somebody who finished presses Leave the programme. */
  leavingAfterTheEnd: "2026-12-10T13:00:00Z",
  /** Fri 11 Dec: an admin marks the run completed and destroys it. */
  destroying: "2026-12-11T10:00:00Z",
};
const at = (when) => mock.timers.setTime(new Date(WHEN[when] ?? when).getTime());
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
  // AGI Strategy's lead, and its reviewer.
  ["claudia", "Claudia Reyes", "committee", true],
  ["lloyd", "Lloyd Brandon", "committee", true],
  // The Research incubator's lead: another programme's.
  ["tess", "Tess Okoro", "committee", true],
  // Facilitators: Group A's, and Group B's two.
  ["amelia", "Amelia Hart", "member", false],
  ["rahul", "Rahul Mehta", "member", false],
  ["sofia", "Sofia Rossi", "member", false],
  // AGI Strategy's nine places.
  ["amara", "Amara Okafor", "member", false],
  ["dev", "Dev Patel", "member", false],
  ["farah", "Farah Hussain", "member", false],
  ["isaac", "Isaac Mensah", "member", false],
  ["joel", "Joel Adeyemi", "member", false],
  ["kofi", "Kofi Asante", "member", false],
  ["mei", "Mei Tanaka", "member", false],
  ["noah", "Noah Bennett", "member", false],
  ["sam", "Sam Whitfield", "member", false],
  // Pooled by AGI Strategy and told "No offer this time".
  ["hannah", "Hannah Brooks", "member", false],
];
const FULL = Object.fromEntries(CAST.map(([uid, name]) => [uid, name]));
const address = (uid) => `${uid}@example.com`;

function userDoc([uid, name, role, suRecognised]) {
  return {
    uid,
    email: address(uid),
    displayName: name,
    role,
    suRecognised,
    admissionsReviewer: uid === "claudia" || uid === "lloyd" || uid === "tess",
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

/** Something read for each person in turn, as `{ uid: answer }`: never two at once. */
async function eachOf(uids, read) {
  const out = {};
  for (const uid of uids) out[uid] = await read(uid);
  return out;
}

/** Everything the story writes down. `steps` is every request it depended on, with the status it expected. */
const seen = { crashed: null, steps: [], logged: [] };

async function step(name, expected, who, handler, params, options) {
  const response = await call(who, handler, params, options);
  seen.steps.push({ name, expected, status: response.status, error: response.body?.error ?? null });
  return response;
}
const courseStep = (name, expected, who, handler, params, options = {}) =>
  step(name, expected, who, handler, params, { ...options, course: true });

/** Let the work a route left running after its answer (an email) finish. */
async function settle() {
  for (let i = 0; i < 25; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** Text out of HTML, as somebody reads it: every tag is a gap, entities are read. */
function pageText(html) {
  return html
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
async function draw(Page, who, params, extra = {}) {
  world.user = sessionOf(who);
  world.course = true;
  world.runHome = null;
  try {
    const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve({}), ...extra });
    return { element, text: pageText(renderToStaticMarkup(element)), to: null, runHome: world.runHome };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") return { element: null, text: `[threw] ${err?.stack ?? err}`, to: null };
    return { element: null, text: "", to: err.to };
  } finally {
    world.course = false;
  }
}

/** Characters that take up no room on the page: a preview's padding, a button's hair spaces. */
const UNSEEN = /[\u00a0\u00ad\u034f\u200a-\u200f\u2060-\u2064\ufeff]/g;

/** Text out of an email's HTML, as somebody reads it: the tags inside a sentence go without a gap. */
function mailText(html) {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
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
const mailSince = (from) => world.mail.slice(from);

// ---------------------------------------------------------------------------
// The term's programme, course, run, groups, weeks and events
// ---------------------------------------------------------------------------

let ROUND = "";
/** Programme ids and question set ids, as the editor minted them. */
const P = { agi: "", inc: "" };
const SET = { fellowships: "", agi: "", incubator: "", facilitator: "" };
const Q = {};

const COURSE = "agi-strategy-fellowship__st3crs01";
const RUN = "agi-strategy-fellowship-autumn-2026__st3run01";
const COURSE_TITLE = "AGI Strategy Fellowship";
const GROUP = {
  /** Thursdays 6pm to 8pm, Room A13, Amelia. */
  A: "autumn-2026-group-a__st3grp0a",
  /** Tuesdays 6pm to 8pm, Room C20, Rahul and Sofia. */
  B: "autumn-2026-group-b__st3grp0b",
};
const FACILITATORS = { [GROUP.A]: ["amelia"], [GROUP.B]: ["rahul", "sofia"] };
const FACILITATOR_OF = { [GROUP.A]: "amelia", [GROUP.B]: "rahul" };
const IN_A = ["dev", "joel", "mei", "noah"];
const IN_B = ["amara", "farah", "isaac", "kofi", "sam"];
const AGI_PLACES = [...IN_A, ...IN_B].sort();
const POOLED = ["hannah"];
const MEMBERS = [...AGI_PLACES, ...POOLED];

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

/** Each week's three readings, as the week editor saves them: the first week's titles are the board's. */
function materials(n) {
  return [
    {
      id: `m_w${n}_reading`,
      type: "reading",
      title: n === 1 ? "Racing to the precipice" : `Week ${n} reading`,
      url: `https://example.com/readings/week-${n}`,
      estimatedMinutes: 25,
    },
    { id: `m_w${n}_talk`, type: "link", title: `Week ${n} talk`, url: `https://example.com/talks/week-${n}`, optional: true },
    { id: `m_w${n}_note`, type: "note", title: "Before the session", body: `Bring one question about week ${n}.` },
  ];
}
/** Each week sets one written exercise. */
const exerciseOf = (n) => ({ id: `x${n}`, prompt: `What would you change after week ${n}?`, responseType: "text", required: true, maxLength: 2000, peerVisible: false });
const WEEK_TITLES = [
  "What could go wrong, and how fast",
  "Who is building it, and why",
  "Who decides what AGI means",
  "Evaluations and standards",
  "International coordination",
  "What you would do next",
];

/** AGI Strategy's draft run of six weeks from Thu 29 Oct, week 1 published, and its two groups. */
function runSide() {
  const docs = {
    [`courses/${COURSE}`]: courseDoc(COURSE_TITLE, "Six weeks on how advanced AI could be governed.", "governance"),
    [`courseRuns/${RUN}`]: {
      courseId: COURSE,
      courseTitle: COURSE_TITLE,
      label: "Autumn 2026",
      academicYear: "2026/27",
      status: "draft",
      startDate: "2026-10-29",
      weekPlan: Array.from({ length: 6 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` })),
      applicationForm: [],
      applicationsOpenAt: null,
      applicationsCloseAt: null,
      applicationCap: null,
      admissionsReviewerUids: [],
      runFacilitatorUids: [],
      trackLeadUids: [],
      applicationCounts: { pending: 0, accepted: 0, rejected: 0, waitlisted: 0, withdrawn: 0 },
      groupCount: 2,
      enrolMode: "admissions",
      streams: [],
      enrolledCount: 0,
      channel: `cohort:${RUN}`,
      archived: false,
      authorUid: "zach",
      createdAt: MADE,
      updatedAt: MADE,
    },
  };
  for (let n = 1; n <= 6; n += 1) {
    docs[`courseRuns/${RUN}/weeks/w0${n}`] = {
      weekNumber: n,
      title: WEEK_TITLES[n - 1],
      summary: "",
      guideBlocks: [],
      materials: materials(n),
      exercises: [exerciseOf(n)],
      checklist: [],
      estimatedMinutes: 75,
      published: n === 1,
      updatedAt: MADE,
      updatedByUid: "claudia",
    };
  }
  const groupOn = (name, weekday, location, capacity) => ({
    runId: RUN,
    courseId: COURSE,
    name,
    facilitatorUids: [],
    capacity,
    memberCount: 0,
    session: { weekday, startTimeLocal: "18:00", durationMinutes: 120, location, meetingUrl: null, notes: "" },
    sessionOverrides: {},
    archived: false,
    createdAt: MADE,
    updatedAt: MADE,
  });
  docs[`courseGroups/${GROUP.A}`] = groupOn("Group A", 4, "Room A13", 4);
  docs[`courseGroups/${GROUP.B}`] = groupOn("Group B", 2, "Room C20", 5);
  return docs;
}

/** An event as the events editor and its routes leave one. */
function eventDoc(over) {
  return {
    title: "",
    blocks: [],
    location: "",
    locationHidden: false,
    locationPublicText: null,
    visibility: "public",
    capacity: null,
    waitlistEnabled: false,
    noSignup: true,
    signupForm: [],
    foodProvenance: "none",
    coverBranding: "none",
    archived: false,
    status: "published",
    authorUid: "zach",
    collaboratorUids: [],
    rsvpCountConfirmed: 0,
    rsvpCountPending: 0,
    ...over,
  };
}
/** The site's events: two to come after Sam leaves, and one that has gone. */
function eventSide() {
  return {
    "events/pizza": eventDoc({
      title: "Pizza and board games",
      startAt: new Date("2026-11-19T19:00:00Z"),
      endAt: new Date("2026-11-19T21:00:00Z"),
      location: "Hallward B12",
    }),
    "events/movie": eventDoc({
      title: "Movie night",
      startAt: new Date("2026-11-25T19:00:00Z"),
      endAt: new Date("2026-11-25T21:30:00Z"),
      location: "Flat 3, 21 Example Road",
      locationHidden: true,
      locationPublicText: "Somewhere in Lenton",
    }),
    "events/past": eventDoc({
      title: "Welcome social",
      startAt: new Date("2026-11-10T19:00:00Z"),
      endAt: new Date("2026-11-10T21:00:00Z"),
      location: "Portland A13",
    }),
  };
}

/** What Sam writes on week 1's readings before he leaves, as the week page writes it. */
function samsNotes() {
  const row = (itemId, over) => ({
    runId: RUN,
    uid: "sam",
    weekNumber: 1,
    itemKind: "material",
    itemId,
    completed: true,
    completedAt: new Date("2026-11-01T10:00:00Z"),
    hasPublicComment: false,
    updatedAt: new Date("2026-11-01T10:00:00Z"),
    ...over,
  });
  return {
    [`courseProgress/${RUN}__sam__m_w1_reading`]: row("m_w1_reading", {
      rating: 4,
      publicComment: "Clearer than I expected.",
      hasPublicComment: true,
      privateNote: "Reread section 3 before the session.",
    }),
    [`courseProgress/${RUN}__sam__m_w1_talk`]: row("m_w1_talk", { rating: 2 }),
    // Another person's note on the same reading: nobody else's words reach his page.
    [`courseProgress/${RUN}__amara__m_w1_reading`]: { ...row("m_w1_reading", { privateNote: "Amara's own note." }), uid: "amara" },
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

const params = () => ({ roundId: ROUND });
const of = (name) => ({ roundId: ROUND, programmeId: P[name] });

// ---------------------------------------------------------------------------
// 1. Decision day to Publish, made small
// ---------------------------------------------------------------------------

async function decisionDay() {
  at("building");
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
  await step("settings for AGI Strategy", 200, "zach", routes.programme.PATCH, of("agi"), {
    body: { places: 9, starts: "w/c 26 Oct", facts: "6 WEEKS", useScores: false },
  });
  await step("settings for the incubator", 200, "zach", routes.programme.PATCH, of("inc"), {
    body: { places: 4, starts: "w/c 2 Nov", facts: "7 WEEKS", useScores: false },
  });
  await step("AGI Strategy's lead and reviewer", 200, "zach", routes.roles.PUT, of("agi"), { body: { leadUid: "claudia", reviewerUids: ["lloyd"] } });
  await step("the incubator's lead", 200, "zach", routes.roles.PUT, of("inc"), { body: { leadUid: "tess", reviewerUids: [] } });
  for (const [path, data] of Object.entries(runSide())) world.db.seed(path, data);
  await step("the lead ties AGI Strategy to its course", 200, "claudia", routes.programme.PATCH, of("agi"), { body: { courseId: COURSE } });
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
  for (const who of MEMBERS) {
    later();
    const look = await call(who, routes.application.GET, params());
    const grid = look.body?.form?.availabilityGrid;
    const draft = {
      aboutYou: look.body?.account,
      rankedProgrammeIds: [P.agi],
      wantsToFacilitate: false,
      answers: {
        [SET.fellowships]: { [Q.fellowships.why]: "I want to understand it." },
        [SET.agi]: { [Q.agi.event]: "A new law came into force." },
      },
      availability: paint(grid, IN_A.includes(who) ? [THURSDAY_EVENING] : [TUESDAY_EVENING]),
      suMembership: "yes",
    };
    await step(`${who} saves`, 200, who, routes.application.PUT, params(), { body: { draft } });
    await step(`${who} sends`, 200, who, routes.applicationSend.POST, params(), { body: {} });
  }

  at("deciding");
  await step("the lead accepts nine", 200, "claudia", routes.list.POST, of("agi"), { body: { decision: "accept", uids: AGI_PLACES } });
  for (const who of POOLED) {
    await step(`she pools ${who}`, 200, "claudia", routes.decision.PUT, { roundId: ROUND, uid: who }, {
      body: { programmeId: P.agi, decision: "pool", poolReason: "capacity" },
    });
    await step(`no offer for ${who}`, 200, "zach", routes.pool.PUT, params(), { body: { uid: who, outcome: { kind: "no-offer" } } });
  }

  at("decisionDay");
  await step("the decision-day test", 200, "zach", routes.sendTest.POST, params(), { body: { kind: "accepted" } });
  const board = (await call("zach", routes.send.GET, params())).body?.board;
  const emails = board ? board.pending.emails + board.owed.people.length : -1;
  await step("the send", 200, "zach", routes.send.POST, params(), { body: { emails } });
}

async function namedHandedOverPublished() {
  at("naming");
  for (const [groupId, uids] of Object.entries(FACILITATORS)) {
    await courseStep(`${groupId}'s facilitators`, 200, "zach", courseRoutes.facilitators.POST, { groupId }, { body: { uids } });
  }
  await step("an admin names the run while it is a draft", 200, "zach", routes.run.PUT, of("agi"), { body: { runId: RUN } });
  await courseStep("an admin moves the run on from draft", 200, "zach", courseRoutes.runStatus.POST, { runId: RUN }, { body: { status: "applications-open" } });

  at("handingOver");
  await step("an admin hands over AGI Strategy's place holders", 200, "zach", routes.handOver.POST, of("agi"));

  at("placing");
  await courseStep("the lead puts the nine in groups", 200, "claudia", courseRoutes.allocate.POST, { runId: RUN }, {
    body: { placements: [...IN_A.map((uid) => ({ uid, groupId: GROUP.A })), ...IN_B.map((uid) => ({ uid, groupId: GROUP.B }))] },
  });

  at("publishing");
  const summary = async () => (await courseCall("claudia", courseRoutes.board.GET, { runId: RUN })).body?.publish ?? null;
  await courseStep("the lead's test of Publish", 200, "claudia", courseRoutes.publishTest.POST, { runId: RUN });
  const counted = await summary();
  const before = world.mail.length;
  seen.published = await courseStep("the lead presses Publish with the board's count", 200, "claudia", courseRoutes.publish.POST, { runId: RUN }, {
    body: { emails: counted?.emails ?? -1 },
  });
  seen.publishedMail = mailSince(before).map((mail) => mail.to).sort();
  for (const [path, data] of Object.entries(eventSide())) world.db.seed(path, data);
  for (const [path, data] of Object.entries(samsNotes())) world.db.seed(path, data);
}

// ---------------------------------------------------------------------------
// What everybody is shown, at one moment
// ---------------------------------------------------------------------------

const sessionsLib = await loadTs(join("lib", "courses", "sessions.ts"));
const { normalizeCourseGroup } = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const rosterRoute = await courseRoute("groups", "[groupId]", "roster");

/** Each week's first session of a group: its week, its day, when it ends, and whether it was cancelled. */
function sessionsOf(groupId) {
  const run = normalizeCourseRun(RUN, world.db.read(`courseRuns/${RUN}`));
  const group = normalizeCourseGroup(groupId, world.db.read(`courseGroups/${groupId}`));
  return sessionsLib
    .resolveSessions(run, group)
    .filter((session) => session.occurrence === 1)
    .map((session) => ({
      weekNumber: session.weekNumber,
      dateKey: session.dateKey,
      cancelled: session.cancelled,
      endsAt: sessionsLib.sessionInstants(session).endsAt,
    }));
}

/** A register as `who` reads it through its route: who is on it, every mark, and who left. */
async function registerOf(who, groupId) {
  const answer = await courseCall(who, courseRoutes.register.GET, { groupId });
  if (answer.status !== 200) return { refused: answer.status };
  const nameOf = new Map(answer.body.members.map((member) => [member.uid, member.displayName]));
  const weekOf = new Map(answer.body.sessions.map((session) => [session.sessionKey, session.weekNumber]));
  const marks = {};
  for (const session of answer.body.sessions) {
    const week = {};
    for (const [uid, status] of Object.entries(answer.body.records[session.sessionKey] ?? {})) week[nameOf.get(uid) ?? uid] = status;
    if (Object.keys(week).length) marks[`week ${session.weekNumber}`] = week;
  }
  return {
    members: answer.body.members.map((member) => member.displayName),
    /** Each column: its week, whether it was held, and whether its register is finished. */
    sessions: answer.body.sessions.map((session) => [session.weekNumber, session.held, session.pushedAt !== null]),
    marks,
    leavers: answer.body.leavers.map((leaver) => ({
      name: leaver.displayName,
      left: leaver.left,
      marks: Object.fromEntries(Object.entries(leaver.records).map(([key, status]) => [`week ${weekOf.get(key)}`, status])),
    })),
    /** The session the register's foot is about, and whether its register is finished. */
    focus: answer.body.ending.focus ? [answer.body.ending.focus.weekNumber, answer.body.ending.focus.finished] : null,
  };
}

/**
 * The lead's tabs as `who` (the lead, or an admin) is drawn them: the head,
 * the Overview (its model and who finished, as the page hands them to the
 * section), the Attendance grid, and the rule's card on Settings.
 */
async function tabsOf(who) {
  world.segment = "overview";
  world.user = sessionOf(who);
  world.course = true;
  let head;
  try {
    head = pageText(renderToStaticMarkup(await pages.head({ children: createElement("main", null, "[tab]"), params: Promise.resolve(of("agi")) })));
  } catch (err) {
    head = `[threw] ${err?.message ?? err}`;
  } finally {
    world.course = false;
  }
  const overviewPage = await draw(pages.overview, who, of("agi"));
  const [overview] = find(overviewPage.element, "ProgrammeOverview");
  const attendancePage = await draw(pages.attendance, who, of("agi"));
  const [grid] = find(attendancePage.element, "ProgrammeAttendance");
  world.segment = "setup";
  const settingsPage = await draw(pages.setup, who, of("agi"));
  const [setup] = find(settingsPage.element, "ProgrammeSetup");
  return {
    /** The head, from the programme's name to the first tab. */
    head: head.slice(0, head.indexOf(" Overview ") + " Overview".length),
    overview: overview
      ? {
          attention: overview.props.model.attention.map((item) => [item.kind, item.title, item.detail]),
          sessions: overview.props.model.sessions.map((session) => ({
            group: session.groupName,
            when: session.when,
            pill: session.pill,
            line: session.line,
            remind: session.remind ? [session.remind.label, session.remind.count, session.remind.sessionKey] : null,
          })),
          chart: overview.props.model.chart.weeks.map((week) => [week.label, week.percent, week.soFar]),
          people: overview.props.model.people,
          finishing: overview.props.finishing,
        }
      : { text: overviewPage.text.slice(0, 300) },
    overviewText: overviewPage.text,
    attendance: grid
      ? grid.props.model.groups.map((group) => ({
          name: group.name,
          people: group.people.map((person) => ({
            name: person.name,
            left: person.left,
            marks: person.cells.filter((cell) => cell.state === "mark").map((cell) => [cell.weekNumber, cell.mark]),
            after: person.cells.filter((cell) => cell.state === "after").map((cell) => cell.weekNumber),
            came: `${person.came} of ${person.of}`,
          })),
          weeks: group.weeks.map((week) => [week.weekNumber, week.dateLabel, week.tag]),
        }))
      : { text: attendancePage.text.slice(0, 300) },
    /** The rule's card: what the page hands it, and its words. */
    rule: setup ? setup.props.finishing : { text: settingsPage.text.slice(0, 300) },
    settingsText: settingsPage.text,
    /** The grid's "in a row" badges: [name, how many]. */
    inARow: grid
      ? grid.props.model.groups.flatMap((group) => group.people.filter((person) => person.absentInARow > 0).map((person) => [person.name, person.absentInARow]))
      : null,
  };
}

/** Who finished, as the section is handed it: the sentence, the counts, every row and who left. */
function whoFinished(tabs) {
  const model = tabs.overview.finishing;
  if (!model) return null;
  if (model.state !== "open") return model;
  return {
    sentence: model.sentence,
    counts: model.counts,
    rows: model.rows.map((row) => [row.name, row.groupName, row.came, row.exercises, row.line, row.finished, row.changed]),
    left: model.left.map((person) => [person.name, person.groupName, person.left]),
    notes: model.notes,
  };
}

/**
 * A member's own pages, in words: the run's page (what it decides for them),
 * the run home drawn from the overview route's own answer, the hub's card,
 * the programmes list and Home's line from the hub's route.
 */
async function memberPages(who) {
  const runPage = await draw(pages.run, who, { runId: RUN });
  const overview = await courseCall(who, courseRoutes.overview.GET, { runId: RUN });
  const me = await courseCall(who, courseRoutes.me.GET, {});
  const runs = me.body?.runs ?? [];
  const entry = runs.find((row) => row.runId === RUN) ?? null;
  const out = {
    runPage: runPage.to ? { sentTo: runPage.to } : runPage.runHome ? { runHome: { canLeave: runPage.runHome.canLeave } } : { text: runPage.text },
    overview: overview.status === 200 ? { finished: overview.body.finished } : { refused: overview.status },
    entry: entry ? { finished: entry.finished, membership: entry.membership } : null,
  };
  if (overview.status === 200) {
    world.overview = overview.body;
    out.home = pageText(renderToStaticMarkup(createElement(member.RunHome, { runId: RUN, isAdmin: false, canEmailCohort: false, pitching: null, canLeave: runPage.runHome?.canLeave ?? false })));
  }
  if (entry) {
    out.card = pageText(renderToStaticMarkup(createElement(member.RunCard, { entry })));
    out.list = pageText(renderToStaticMarkup(createElement(member.MyCoursesSummary, { runs, loading: false, error: null, featuredRunId: null })));
    out.homeLine = pageText(
      renderToStaticMarkup(createElement(member.HomeProgramme, { given: "You", invite: null, entry, comingUp: null, applications: null, more: null })),
    );
  }
  world.overview = null;
  return out;
}

/** What somebody who left reads: the run's page, their notes, the reading list, and where the cohort's pages send them. */
async function leftPagesOf(who) {
  const runPage = await draw(pages.run, who, { runId: RUN });
  const notes = await draw(pages.notes, who, { runId: RUN });
  const reading = await draw(pages.reading, who, { runId: RUN });
  const leave = await draw(pages.leave, who, { runId: RUN });
  const group = await draw(pages.group, who, { runId: RUN, groupId: GROUP.B });
  const layout = await draw(pages.runLayout, who, { runId: RUN }, { children: createElement("div", null, "[children]") });
  return {
    runPage: runPage.to ? { sentTo: runPage.to } : runPage.text,
    notes: notes.to ? { sentTo: notes.to } : notes.text,
    reading: reading.to ? { sentTo: reading.to } : reading.text,
    leave: leave.to ? { sentTo: leave.to } : leave.text,
    group: group.to ? { sentTo: group.to } : group.text.slice(0, 200),
    layout: layout.to ? { sentTo: layout.to } : "drawn",
    overview: (await courseCall(who, courseRoutes.overview.GET, { runId: RUN })).status,
    updates: (await courseCall(who, courseRoutes.updates.GET, { runId: RUN })).status,
    roster: (await courseCall(who, rosterRoute.GET, { groupId: GROUP.B })).status,
    hub: ((await courseCall(who, courseRoutes.me.GET, {})).body?.runs ?? []).map((row) => row.runId),
  };
}

/** The lead's Applications tab, as its route hands the board a person's row. */
async function applicationsRowOf(who, uid) {
  const answer = await call(who, routes.list.GET, of("agi"));
  if (answer.status !== 200) return { refused: answer.status };
  const row = (answer.body.board.rows ?? []).find((entry) => entry.uid === uid);
  return row ? { withdrawn: row.withdrawn, standing: row.standing, gaveBack: row.gaveBack } : null;
}

const { standingOf } = await loadTs(join("lib", "applications", "status", "standing.ts"));

/**
 * A person's own application, as it is stored, and what their application
 * page is drawn from: the standing its status card reads (`standingOf`).
 */
function ownApplicationOf(uid) {
  const stored = world.db.read(`admissionApplications/${ROUND}__${uid}`);
  if (!stored) return null;
  const standing = standingOf(stored);
  return {
    status: stored.status,
    attendance: stored.attendance?.answer ?? null,
    releaseReason: stored.releaseReason ?? null,
    standing: [standing.kind, standing.how ?? null],
  };
}

// ---------------------------------------------------------------------------
// The weeks: every register marked and finished, and the exercises sent
// ---------------------------------------------------------------------------

/** The registers, a letter a week: P present, L late, E excused, A absent, X left early, "-" no mark. Everybody else came. */
const STATUS = { P: "present", L: "late", E: "excused", A: "absent", X: "left-early" };
const MARKS = {
  [GROUP.A]: { dev: "LPPPPP", joel: "P-----", mei: "PEPAAP", noah: "PPAPAP" },
  [GROUP.B]: { amara: "PPP-PP", farah: "PLP-AA", isaac: "PPA-PP", kofi: "EPE-PP", sam: "PA----" },
};
/** The exercises each person sends, by week, the evening of their group's session. */
const ANSWERS = { amara: [1, 2, 3, 4, 5, 6], dev: [1, 2, 3, 4], isaac: [1, 2, 3], kofi: [1, 2, 3, 4, 5, 6], mei: [1], noah: [1, 2], sam: [1] };
/** Group B's session of week 4 (Tue 24 Nov) is cancelled by Rahul, keeping pace. */
const CANCELLED_WEEK = 4;

/**
 * One session of one group: its facilitator marks the register for the
 * people the register lists, then finishes it; then the people who answer
 * that week's exercise send it. What each finish emailed is written down.
 */
async function aSession(groupId, session) {
  const facilitator = FACILITATOR_OF[groupId];
  const week = session.weekNumber;
  mock.timers.setTime(session.endsAt.getTime() + 15 * 60_000);
  const listed = await courseCall(facilitator, courseRoutes.register.GET, { groupId });
  const marks = [];
  for (const member of listed.body?.members ?? []) {
    const letter = MARKS[groupId][member.uid]?.[week - 1] ?? "P";
    if (letter !== "-") marks.push({ uid: member.uid, status: STATUS[letter] });
  }
  const label = `${groupId === GROUP.A ? "Group A" : "Group B"} week ${week}`;
  await courseStep(`${label}: ${facilitator} marks`, 200, facilitator, courseRoutes.register.POST, { groupId }, { body: { weekNumber: week, marks } });
  later(30);
  const before = world.mail.length;
  await courseStep(`${label}: ${facilitator} finishes`, 200, facilitator, courseRoutes.finish.POST, { groupId }, { body: { weekNumber: week } });
  await settle();
  seen.finishMail[label] = mailSince(before).map((mail) => mail.to.split("@")[0]).sort();
  for (const uid of groupId === GROUP.A ? IN_A : IN_B) {
    if (!(ANSWERS[uid] ?? []).includes(week)) continue;
    later(5);
    await courseStep(`${uid} sends week ${week}'s exercise`, 200, uid, courseRoutes.submit.POST, { runId: RUN, exerciseId: `x${week}` }, {
      body: { weekId: `w0${week}`, text: `My answer for week ${week}.`, submit: true },
    });
  }
  // The week editor opens the next week once the first group to reach it has met.
  if (groupId === GROUP.A && week < 6) world.db.poke(`courseRuns/${RUN}/weeks/w0${week + 1}`, { published: true });
}

// ---------------------------------------------------------------------------
// 2. In week 3, a placed member leaves
// ---------------------------------------------------------------------------

/** What Sam types when he leaves: the board's words. */
const SAM_SAID = "Too much on this term.";

async function samLeaves() {
  at("leaving");
  const l = {};
  seen.leaving = l;
  // Before: his run home offers the way out, the confirmation opens for him
  // and for anybody else taking part, and for nobody else.
  l.runHomeBefore = (await draw(pages.run, "sam", { runId: RUN })).runHome;
  l.confirmation = (await draw(pages.leave, "sam", { runId: RUN })).text;
  l.confirmationFor = await eachOf(["amara", "rahul", "claudia", "zach", "hannah"], async (who) => {
    const drawn = await draw(pages.leave, who, { runId: RUN });
    return drawn.to ? { sentTo: drawn.to } : "drawn";
  });
  l.wrongTitle = await courseCall("sam", courseRoutes.enrol.DELETE, { runId: RUN }, { body: { confirmName: "AGI Strategy", reason: SAM_SAID } });
  const before = world.mail.length;
  l.answer = await courseStep("Sam leaves AGI Strategy", 200, "sam", courseRoutes.enrol.DELETE, { runId: RUN }, {
    body: { confirmName: COURSE_TITLE, reason: SAM_SAID },
  });
  await settle();
  l.mail = await Promise.all(mailSince(before).map(opened));
  l.again = await courseCall("sam", courseRoutes.enrol.DELETE, { runId: RUN }, { body: { confirmName: COURSE_TITLE, reason: SAM_SAID } });
  await settle();
  l.mailAfterAgain = world.mail.length - before;

  const stored = world.db.read(`courseEnrolments/${RUN}__sam`);
  l.enrolment = {
    status: stored.status,
    groupId: stored.groupId,
    told: stored.allocatedEmailAt instanceof Date,
    droppedOutAt: stored.droppedOutAt?.toISOString() ?? null,
    dropOutReason: stored.dropOutReason ?? null,
  };
  l.groupCount = world.db.read(`courseGroups/${GROUP.B}`).memberCount;
  l.onTheList = world.db.read(`subscriptions/sub_sam@example.com__cohort:${RUN}`)?.subscribed ?? null;
  l.application = ownApplicationOf("sam");
  // Joel, whom the lead removed on Wed 4 Nov: what his application says now.
  l.joelsApplication = ownApplicationOf("joel");
  l.formCounts = world.db.read(`admissionRounds/${ROUND}`).applicationCounts;
  l.applicationsRow = await applicationsRowOf("claudia", "sam");
  l.pages = await leftPagesOf("sam");
  l.lead = await tabsOf("claudia");
  l.admin = await tabsOf("zach");
  l.registers = { rahul: await registerOf("rahul", GROUP.B), claudia: await registerOf("claudia", GROUP.B), amelia: await registerOf("amelia", GROUP.A) };
  later();
  const csv = await step("the lead downloads the attendance CSV after Sam left", 200, "claudia", routes.csv.POST, of("agi"));
  l.csv = typeof csv.body === "string" ? csv.body : null;
  l.publish = (await courseCall("claudia", courseRoutes.board.GET, { runId: RUN })).body?.publish ?? null;
  const roster = await courseCall("amara", rosterRoute.GET, { groupId: GROUP.B });
  l.amarasRoster = roster.status === 200 ? roster.body.members.map((person) => person.displayName) : { refused: roster.status };
  // Rahul writes to Group B, emailed: the number on his button, and who it reaches.
  later();
  const page = await draw(pages.group, "rahul", { runId: RUN, groupId: GROUP.B });
  // Since board wk-fac-group, "Write to Group B (N)" and "Change a session"
  // are the head's two buttons, with the line under both: the button and its
  // line are read as they always were, around the second button.
  const write = /(Write to Group B \(\d+\)) Change a session ([^.]*\.(?: Replies go to \S+\.)?)/.exec(page.text);
  l.rahulsWriteLine = write ? `${write[1]} ${write[2]}` : null;
  const count = Number(/emails (\d+) (?:person|people)/.exec(page.text)?.[1] ?? -1);
  const beforeUpdate = world.mail.length;
  l.update = await courseStep("Rahul writes to Group B after Sam left, emailed", 200, "rahul", courseRoutes.updates.POST, { runId: RUN }, {
    body: { to: "group", groupId: GROUP.B, title: "Room C20 again on Tuesday", message: "Same time.", email: true, emailCount: count },
  });
  l.updateCount = count;
  l.updateMail = mailSince(beforeUpdate).map((mail) => mail.to.split("@")[0]).sort();
}

// ---------------------------------------------------------------------------
// 3. A session cancelled, and the weeks to the last session
// ---------------------------------------------------------------------------

async function cancelWeekFour() {
  at("cancelling");
  const session = sessionsOf(GROUP.B).find((entry) => entry.weekNumber === CANCELLED_WEEK);
  seen.cancel = await courseStep("Rahul cancels Group B's session of week 4, keeping pace", 200, "rahul", courseRoutes.change.POST, { groupId: GROUP.B }, {
    body: { week: CANCELLED_WEEK, dateKey: session.dateKey, kind: "cancel", reason: "The room is closed for an exam.", tell: false },
  });
  seen.cancelledOn = sessionsOf(GROUP.B).filter((entry) => entry.cancelled).map((entry) => [entry.weekNumber, entry.dateKey]);
}

/**
 * The morning after the cancelled session: what the lead's tabs, the
 * facilitators' register and a member's Home say of it, and what Remind
 * does when it is pressed for it.
 */
async function theDayAfterTheCancelled() {
  at("dayAfterTheCancelled");
  const c = {};
  seen.dayAfterTheCancelled = c;
  c.lead = await tabsOf("claudia");
  c.register = await registerOf("rahul", GROUP.B);
  const card = c.lead.overview.sessions?.find((session) => session.group === "Group B") ?? null;
  c.card = card;
  const before = world.mail.length;
  c.remind = await call("claudia", routes.remind.POST, of("agi"), {
    body: { groupId: GROUP.B, sessionKey: card?.remind?.[2] ?? sessionKey(CANCELLED_WEEK, 1), emails: card?.remind?.[1] ?? 2 },
  });
  c.remindMail = mailSince(before).map((mail) => [mail.to.split("@")[0], mail.subject]);
  // Rahul, on his register: a mark, the switch, a note, and the push, each
  // for the session he cancelled. What they wrote and sent is written down.
  const store = storeNow();
  const beforePresses = world.mail.length;
  const press = (method, body) =>
    courseCall("rahul", method, { groupId: GROUP.B }, { body: { weekNumber: CANCELLED_WEEK, ...body } }).then(short);
  c.presses = {
    mark: await press(courseRoutes.register.POST, { marks: [{ uid: "amara", status: "present" }] }),
    held: await press(courseRoutes.register.POST, { held: true }),
    note: await press(courseRoutes.register.POST, { notes: "The room was closed." }),
    push: await press(courseRoutes.finish.POST, {}),
  };
  c.pressesWrote = changedSince(store);
  c.pressesMail = world.mail.length - beforePresses;
}

// ---------------------------------------------------------------------------
// 4. Before and after the last session: who finished
// ---------------------------------------------------------------------------

async function beforeTheEnd() {
  at("lastDay");
  const b = {};
  seen.lastDay = b;
  b.lead = await tabsOf("claudia");
  b.switch = await call("claudia", routes.finishing.PUT, of("agi"), { body: { uid: "amara", finished: true } });
  b.amara = await memberPages("amara");
  b.finishing = world.db.paths().filter((path) => path.startsWith("courseFinishing/"));
}

/** The section and the rule's card after one press of the rule, as the lead is drawn them. */
async function withRule(atLeast) {
  later(2);
  const answer = await call("claudia", routes.rule.PUT, of("agi"), { body: { atLeast } });
  const tabs = await tabsOf("claudia");
  return { answer: [answer.status, answer.body?.error ?? answer.body?.rule ?? null], section: whoFinished(tabs), card: tabs.rule };
}

async function afterTheEnd() {
  at("afterTheEnd");
  const a = {};
  seen.afterTheEnd = a;
  a.lead = await tabsOf("claudia");
  a.admin = await tabsOf("zach");
  a.registers = { rahul: await registerOf("rahul", GROUP.B), amelia: await registerOf("amelia", GROUP.A) };
  // On the last day of the run's last week every member's page is still on week 6.
  a.amara = await memberPages("amara");

  at("settingTheRule");
  const r = {};
  seen.rules = r;
  r.four = await withRule(4);
  r.five = await withRule(5);
  r.six = await withRule(6);
  r.seven = await withRule(7);
  r.cleared = await withRule(null);
  r.back = await withRule(4);
  r.gates = await eachOf(["lloyd", "tess", "rahul", "amara", null], async (who) => {
    const answer = await call(who, routes.rule.PUT, of("agi"), { body: { atLeast: 2 } });
    return [answer.status, answer.body?.error ?? null];
  });
  r.stored = world.db.read(`courseFinishing/${RUN}`);

  at("deciding2");
  const d = {};
  seen.decisions = d;
  d.kofi = await step("the lead ticks Kofi", 200, "claudia", routes.finishing.PUT, of("agi"), { body: { uid: "kofi", finished: true } });
  later(2);
  d.farahOn = await step("the lead ticks Farah", 200, "claudia", routes.finishing.PUT, of("agi"), { body: { uid: "farah", finished: true } });
  later(2);
  d.farahBack = await step("and puts Farah's switch back", 200, "claudia", routes.finishing.PUT, of("agi"), { body: { uid: "farah", finished: false } });
  later(2);
  d.refused = {};
  for (const [label, who, uid] of [
    ["Sam, who left", "claudia", "sam"],
    ["Joel, whom she removed", "claudia", "joel"],
    ["Hannah, who was never on it", "claudia", "hannah"],
    ["by the reviewer", "lloyd", "kofi"],
    ["by another programme's lead", "tess", "kofi"],
    ["by a facilitator", "rahul", "kofi"],
    ["by a member", "amara", "amara"],
    ["signed out", null, "kofi"],
  ]) {
    const answer = await call(who, routes.finishing.PUT, of("agi"), { body: { uid, finished: true } });
    d.refused[label] = [answer.status, answer.body?.error ?? null];
  }
  d.stored = world.db
    .paths()
    .filter((path) => path.startsWith("courseFinishing/"))
    .sort()
    .map((path) => {
      const row = world.db.read(path);
      return row.kind === "rule" ? ["rule", row.atLeast] : ["person", row.uid, row.finished, row.byUid];
    });
  d.lead = await tabsOf("claudia");
  d.admin = await tabsOf("zach");
}

// ---------------------------------------------------------------------------
// 5. Every member's pages, once their calendar is past its last week
// ---------------------------------------------------------------------------

async function membersAfter() {
  at("membersAfter");
  seen.members = await eachOf(AGI_PLACES.filter((uid) => uid !== "sam"), memberPages);
  seen.samAfter = await leftPagesOf("sam");
  seen.hannahAfter = await memberPages("hannah");
  seen.lead = await tabsOf("claudia");
}

// ---------------------------------------------------------------------------
// 6. Somebody who finished presses "Leave the programme" after the end
// ---------------------------------------------------------------------------

/** Every document in the store, by path, as it stands. */
const storeNow = () => new Map(world.db.paths().map((path) => [path, JSON.stringify(world.db.read(path))]));

/** The paths that changed, appeared or went since `before`. */
function changedSince(before) {
  const after = storeNow();
  return [...new Set([...before.keys(), ...after.keys()])].filter((path) => before.get(path) !== after.get(path)).sort();
}

/**
 * The day after the end, as somebody who finished would try it: her run home,
 * the confirmation's address, and the press itself (sent as the confirmation
 * sends it, title typed right), with what the press wrote and sent, and what
 * her own pages and the lead's list say of her afterwards.
 */
async function leavingAfterTheEnd() {
  at("leavingAfterTheEnd");
  const e = {};
  seen.lateLeave = e;
  e.runHome = (await draw(pages.run, "amara", { runId: RUN })).runHome;
  const confirmation = await draw(pages.leave, "amara", { runId: RUN });
  e.confirmation = confirmation.to ? { sentTo: confirmation.to } : confirmation.text;
  e.applicationBefore = ownApplicationOf("amara");
  const store = storeNow();
  const before = world.mail.length;
  e.answer = await call("amara", courseRoutes.enrol.DELETE, { runId: RUN }, { body: { confirmName: COURSE_TITLE, reason: null } });
  await settle();
  e.mail = await Promise.all(mailSince(before).map(opened));
  e.changed = changedSince(store);
  e.application = ownApplicationOf("amara");
  e.member = await memberPages("amara");
  e.section = whoFinished(await tabsOf("claudia"));
}

// ---------------------------------------------------------------------------
// 7. The run's destroy
// ---------------------------------------------------------------------------

/**
 * The store, with `count()` on every query it hands out, answered by counting
 * what the query returns: the destroy's manifest counts with aggregates.
 */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

async function destroyTheRun() {
  at("destroying");
  const x = {};
  seen.destroy = x;
  x.finishingBefore = world.db.paths().filter((path) => path.startsWith("courseFinishing/")).length;
  for (const status of ["running", "completed"]) {
    await courseStep(`an admin moves the run to ${status}`, 200, "zach", courseRoutes.runStatus.POST, { runId: RUN }, { body: { status } });
  }
  world.counting = true;
  try {
    const manifest = await courseCall("zach", courseRoutes.manifest.GET, { runId: RUN });
    x.manifest = manifest.status === 200 ? { finishing: manifest.body.counts.finishing, blockers: manifest.body.blockers } : manifest;
    x.passes = [];
    for (let pass = 0; pass < 20; pass += 1) {
      const answer = await courseCall("zach", courseRoutes.destroy.POST, { runId: RUN }, { body: { confirmName: "Autumn 2026" } });
      x.passes.push([answer.status, answer.body?.deleted?.finishing ?? null, answer.body?.complete ?? null, answer.body?.error ?? null]);
      if (answer.status !== 200 || answer.body.complete) break;
    }
  } finally {
    world.counting = false;
  }
  x.finishingAfter = world.db.paths().filter((path) => path.startsWith("courseFinishing/"));
  x.runAfter = world.db.read(`courseRuns/${RUN}`) ?? null;
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
  // The Admin SDK's sweep of a document and what is under it: nothing a leave deletes has anything under it here.
  world.courseDb.recursiveDelete = async (ref) => ref.delete();
  world.countingDb = counting(world.courseDb);
  seen.finishMail = {};
  try {
    await decisionDay();
    await namedHandedOverPublished();
    // Every session of both groups, in the order they happen, with what
    // happens between them. Group B's week 4 is cancelled before it comes.
    const sessions = [GROUP.A, GROUP.B]
      .flatMap((groupId) => sessionsOf(groupId).map((session) => ({ groupId, session })))
      .filter(({ groupId, session }) => !(groupId === GROUP.B && session.weekNumber === CANCELLED_WEEK))
      .sort((a, b) => a.session.endsAt.getTime() - b.session.endsAt.getTime());
    const between = [
      ["removing", async () => {
        at("removing");
        seen.removed = await courseStep("the lead removes Joel", 200, "claudia", courseRoutes.remove.POST, { runId: RUN, uid: "joel" });
      }],
      ["leaving", samLeaves],
      ["cancelling", cancelWeekFour],
      ["dayAfterTheCancelled", theDayAfterTheCancelled],
      ["lastDay", beforeTheEnd],
    ];
    for (const { groupId, session } of sessions) {
      while (between.length && new Date(WHEN[between[0][0]]).getTime() < session.endsAt.getTime()) await between.shift()[1]();
      await aSession(groupId, session);
    }
    for (const [, act] of between) await act();
    await afterTheEnd();
    await membersAfter();
    await leavingAfterTheEnd();
    await destroyTheRun();
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
const short = (response) => [response.status, response.body?.error ?? null];
const HOME = `/learn/${RUN}`;
/** The run's head, as the lead's tabs draw it once the last session is over (en-finish v21: "stayed to the end", was "took part"). */
const HEAD_AFTER = (n) => `Programmes AGI Strategy Fellowship Finished · Tue 8 Dec C Lead: Claudia · ${n} stayed to the end Overview`;
const RULE_SENTENCE = (n) =>
  `We’ve ticked everyone who came to at least ${n} of 6 sessions. Change any you disagree with. Only you and admins see this rule.`;
const NO_RULE =
  "There’s no rule for who finished yet, so we haven’t ticked anybody. Set one in Settings, or tick people yourself. Only you and admins see this.";
const NOTE = "Group B met 5 times. Its session on Tue 24 Nov was cancelled, and it doesn’t count against anyone.";
/**
 * Each person's row of Who finished, as the rule and the registers make it:
 * [name, group, came to, exercises, line]. Who finished is read by the lead
 * and admins, who are on the committee, so every name is the account's full
 * name (`nameForViewer`); a facilitator who is not on it reads the name each
 * goes by on their own pages.
 */
const ROWS = {
  farah: ["Farah Hussain", "Group B", "3 of 5", "0 of 6", "Missed weeks 5 and 6"],
  kofi: ["Kofi Asante", "Group B", "3 of 5", "5 of 6", "Excused in weeks 1 and 3"],
  mei: ["Mei Tanaka", "Group A", "3 of 6", "1 of 6", "Excused in week 2. Missed weeks 4 and 5."],
  isaac: ["Isaac Mensah", "Group B", "4 of 5", "3 of 6", "Missed week 3"],
  noah: ["Noah Bennett", "Group A", "4 of 6", "2 of 6", "Missed weeks 3 and 5"],
  amara: ["Amara Okafor", "Group B", "5 of 5", "5 of 6", null],
  dev: ["Dev Patel", "Group A", "6 of 6", "4 of 6", null],
};
/** The list as drawn, fewest sessions first: each row with whether it is ticked and who changed it. */
const listOf = (ticked, changed = {}) =>
  ["farah", "kofi", "mei", "isaac", "noah", "amara", "dev"].map((uid) => [...ROWS[uid], ticked.includes(uid), changed[uid] ?? null]);
const LEFT = [
  ["Joel Adeyemi", "Group A", "Left Wed 4 Nov"],
  ["Sam Whitfield", "Group B", "Left Fri 13 Nov"],
];
/** What the Overview says of the two who left, as the lead and an admin read it: each card by the full name, its sentences by the name each goes by. */
const LEFT_ATTENTION = [
  ["left", "Sam Whitfield left on Fri 13 Nov", "Sam said: “Too much on this term.” Sam’s off Group B’s register from week 3."],
  ["left", "Joel Adeyemi left on Wed 4 Nov", "Joel’s off Group A’s register from week 2."],
];
/**
 * The page Sam reads once Sam has left, at the run's address and at its notes
 * and reading list addresses alike: that Sam left and when, and nothing else.
 */
const SAM_LEFT_PAGE =
  "My programmes AGI Strategy You left AGI Strategy That was on Fri 13 Nov. Thanks for coming along. " +
  "Changed your mind? Email ai-safety@uonsu.com and we’ll see what we can do.";
const THE_LEAVING_EMAIL = (first) =>
  `You've left AGI Strategy Fellowship You've left AGI Strategy Fellowship That's you off the list, ${first} You're no longer on ` +
  "AGI Strategy Fellowship (Autumn 2026), and your place has gone back to the group. The weekly emails will stop. Thanks for giving " +
  "it a go. If you'd like to join a future cohort, keep an eye on the courses page: applying again is welcome and counts for nothing " +
  `against you. Nothing else is needed from you. ${FOOTER}`;

/**
 * Every member's own pages after the end, word for word: the run home (since
 * boards en-after-phone and en-after-nofinish-phone: the programme's name in
 * the heading their finished record gives them, the term and their group,
 * with its facilitators for somebody who finished and after the thanks for
 * everybody else, what they keep, then the weeks, each Done only when all it
 * counts is done (nobody here ticked a reading, so every week that met says
 * Not done beside "0 of 2", finished or not), and no way
 * out: leaving closed at the run's last session, H1; the boards draw no marks
 * once it is over, and the marks are held on the last day of the last week in
 * tests/course-hub-member-pages.test.mjs), the hub's card, and Home's line,
 * which is drawn with no session to come. Group B's week 4 reads as cancelled
 * in the run home's weeks, from the run's own record of the cancellation
 * (until the walk of stage three Home's strip read it as "not marked yet",
 * from the register alone: H2); Home draws no marks since the restyle
 * (wk-home-phone).
 */
const MEMBER_PAGES = {
  amara: {
    home: "My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group B · with Rahul and Sofia What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Tue 3 Nov · Not done 0 of 2 Week 2 Who is building it, and why Tue 10 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Tue 17 Nov · Not done 0 of 2 Week 4 Evaluations and standards Tue 24 Nov · Cancelled 0 of 2 Week 5 International coordination Tue 1 Dec · Not done 0 of 2 Week 6 What you would do next Tue 8 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Finished Group B",
    homeLine: "AGI Strategy · finished Hi You. AGI Strategy Fellowship · Group B · finished No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group B",
  },
  dev: {
    home: "My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group A · with Amelia What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Thu 29 Oct · Not done 0 of 2 Week 2 Who is building it, and why Thu 5 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Thu 12 Nov · Not done 0 of 2 Week 4 Evaluations and standards Thu 19 Nov · Not done 0 of 2 Week 5 International coordination Thu 26 Nov · Not done 0 of 2 Week 6 What you would do next Thu 3 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Finished Group A",
    homeLine: "AGI Strategy · finished Hi You. AGI Strategy Fellowship · Group A · finished No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group A",
  },
  farah: {
    home: "My programmes AGI Strategy AGI Strategy has ended. Thanks for being part of it. Autumn 2026 · Group B. What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Tue 3 Nov · Not done 0 of 2 Week 2 Who is building it, and why Tue 10 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Tue 17 Nov · Not done 0 of 2 Week 4 Evaluations and standards Tue 24 Nov · Cancelled 0 of 2 Week 5 International coordination Tue 1 Dec · Not done 0 of 2 Week 6 What you would do next Tue 8 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Ended Group B",
    homeLine: "AGI Strategy · ended Hi You. AGI Strategy Fellowship · Group B · ended No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group B",
  },
  isaac: {
    home: "My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group B · with Rahul and Sofia What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Tue 3 Nov · Not done 0 of 2 Week 2 Who is building it, and why Tue 10 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Tue 17 Nov · Not done 0 of 2 Week 4 Evaluations and standards Tue 24 Nov · Cancelled 0 of 2 Week 5 International coordination Tue 1 Dec · Not done 0 of 2 Week 6 What you would do next Tue 8 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Finished Group B",
    homeLine: "AGI Strategy · finished Hi You. AGI Strategy Fellowship · Group B · finished No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group B",
  },
  kofi: {
    home: "My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group B · with Rahul and Sofia What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Tue 3 Nov · Not done 0 of 2 Week 2 Who is building it, and why Tue 10 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Tue 17 Nov · Not done 0 of 2 Week 4 Evaluations and standards Tue 24 Nov · Cancelled 0 of 2 Week 5 International coordination Tue 1 Dec · Not done 0 of 2 Week 6 What you would do next Tue 8 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Finished Group B",
    homeLine: "AGI Strategy · finished Hi You. AGI Strategy Fellowship · Group B · finished No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group B",
  },
  mei: {
    home: "My programmes AGI Strategy AGI Strategy has ended. Thanks for being part of it. Autumn 2026 · Group A. What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Thu 29 Oct · Not done 0 of 2 Week 2 Who is building it, and why Thu 5 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Thu 12 Nov · Not done 0 of 2 Week 4 Evaluations and standards Thu 19 Nov · Not done 0 of 2 Week 5 International coordination Thu 26 Nov · Not done 0 of 2 Week 6 What you would do next Thu 3 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Ended Group A",
    homeLine: "AGI Strategy · ended Hi You. AGI Strategy Fellowship · Group A · ended No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group A",
  },
  noah: {
    home: "My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group A · with Amelia What you keep The reading list for all 6 weeks The 6 weeks Week 1 What could go wrong, and how fast Thu 29 Oct · Not done 0 of 2 Week 2 Who is building it, and why Thu 5 Nov · Not done 0 of 2 Week 3 Who decides what AGI means Thu 12 Nov · Not done 0 of 2 Week 4 Evaluations and standards Thu 19 Nov · Not done 0 of 2 Week 5 International coordination Thu 26 Nov · Not done 0 of 2 Week 6 What you would do next Thu 3 Dec · Not done 0 of 2 See your progress week by week →",
    card: "AGI Strategy Fellowship Autumn 2026 · 2026/27 Learner Finished Group A",
    homeLine: "AGI Strategy · finished Hi You. AGI Strategy Fellowship · Group A · finished No more sessions are planned for your group. Open AGI Strategy Fellowship Your group Group A",
  },
};

describe("stage three of the course hub, one term from week 3 to after its end", () => {
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

  test("the lead's Publish told the nine and the three facilitators, once each", () => {
    assert.deepEqual(seen.published.body.report.people, { sent: 9, held: 0, suppressed: 0 });
    assert.deepEqual(seen.published.body.report.facilitators, { sent: 3, held: 0, suppressed: 0 });
    assert.deepEqual(seen.publishedMail, [...AGI_PLACES, "amelia", "rahul", "sofia"].map(address).sort());
  });

  // -------------------------------------------------------------------------
  describe("1. in week 3 a placed member leaves, with a reason", () => {
    const l = () => seen.leaving;

    test("before, his run home offers the way out, and the confirmation opens for somebody taking part and nobody else", () => {
      assert.equal(l().runHomeBefore.canLeave, true);
      assert.equal(
        l().confirmation,
        "AGI Strategy Leave the programme Leave AGI Strategy? You’ll leave Group B straight away and give your place back. " +
          // CHANGED ON PURPOSE (somebody who leaves keeps nothing, and the
          // group keeps their notes): this line said Sam keeps the notes and the
          // reading list, which the page that says Sam left no longer shows.
          "Your marks so far stay on your group’s register, and the notes you shared stay with the group. After you leave, " +
          "your programme’s page shows only that you left. The weekly emails stop. You can’t undo this " +
          "yourself. If you change your mind, email ai-safety@uonsu.com and we’ll see what we can do. Why are you leaving? " +
          "(optional) Only Claudia, who leads AGI Strategy, and admins read this. Type AGI Strategy Fellowship to confirm " +
          "Leave AGI Strategy Stay",
      );
      assert.deepEqual(l().confirmationFor, {
        amara: "drawn",
        rahul: { sentTo: HOME },
        claudia: { sentTo: HOME },
        zach: { sentTo: HOME },
        hannah: { sentTo: HOME },
      });
    });

    test("a title typed wrong is refused; the press takes him off once, and a second press changes and sends nothing", () => {
      assert.deepEqual(short(l().wrongTitle), [400, "That doesn't match the course title. Type it exactly to confirm."]);
      assert.deepEqual([l().answer.status, l().answer.body], [200, { ok: true, feedbackUrl: "" }]);
      assert.deepEqual([l().again.status, l().mailAfterAgain], [200, 1]);
    });

    test("what is written: the day and the reason on his row, his group kept, his seat given up, the cohort list left", () => {
      assert.deepEqual(l().enrolment, {
        status: "withdrawn",
        groupId: GROUP.B,
        told: true,
        droppedOutAt: "2026-11-13T10:00:00.000Z",
        dropOutReason: SAM_SAID,
      });
      assert.equal(l().groupCount, 4);
      assert.equal(l().onTheList, false);
    });

    // His place on the form goes back as "I can’t make it" does, and the
    // reason he typed stays on the run's row. The lead's Applications tab
    // says he said "I can’t make it", with no reason given, while the
    // programme's page says he left and the Overview quotes his reason; after
    // week 1 nobody can take the place. (His own application page, which the
    // walk of stage three found drawn from a place given back, its H4, now
    // says he left the programme and when: held in
    // `tests/course-hub-cant-make-it-after-placement.test.mjs`.)
    // The form's count is of the term's nine places: Sam's has gone back, and
    // so has Joel's, which the lead's Remove gave back on Wed 4 Nov. (Until
    // Remove gave the place on the form back, in the follow-ups to Publish of
    // October 2026, Joel still held a place: 8 accepted and 1 withdrawn here.)
    test("his place on the form is given back, and the form's places and the lead's Applications tab say so", () => {
      assert.deepEqual(l().application, { status: "withdrawn", attendance: "cant-make-it", releaseReason: null, standing: ["released", "cant-make-it"] });
      assert.equal(l().formCounts.accepted, 7);
      assert.equal(l().formCounts.withdrawn, 2);
      assert.deepEqual(l().applicationsRow, { withdrawn: true, standing: "accepted", gaveBack: { said: "I can’t make it", reason: null } });
    });

    // Remove gives the place on the form back, as leaving does, with no
    // reason (H5, the owner's yes, in the follow-ups to Publish of October
    // 2026). Joel, removed by the lead on Wed 4 Nov, no longer holds a place,
    // and Joel's application page says Taken off the programme (the page
    // of somebody removed is drawn, word for word, in
    // `tests/course-hub-cant-make-it-after-placement.test.mjs` and
    // `tests/course-publish-follow-ups.test.mjs`). Until then this test, under
    // its old title, pinned a place still held: accepted, no attendance, a
    // standing of place.
    test("Joel, whom the lead removed, no longer holds a place on the form: given back, with no reason", () => {
      assert.deepEqual(l().joelsApplication, { status: "withdrawn", attendance: "cant-make-it", releaseReason: null, standing: ["released", "cant-make-it"] });
    });

    // The leave's email, unchanged by leaving a placed run: it links to
    // nothing (not the page that says he left, his notes or the reading
    // list, and "the courses page" is not a link), and says the place went
    // back "to the group" (H6).
    test("the email is the leave's, to him alone, word for word, and links to nothing", () => {
      assert.deepEqual(
        l().mail.map((mail) => [mail.to, mail.subject, mail.kind, mail.links]),
        [[address("sam"), "You've left AGI Strategy Fellowship", "course-enrolment", []]],
      );
      assert.equal(l().mail[0].text, THE_LEAVING_EMAIL("Sam"));
    });

    // CHANGED ON PURPOSE (somebody who leaves keeps nothing): the page that
    // says Sam left listed what stayed Sam's (notes and reflections, the
    // reading list for weeks 1 to 4, the marks) and the site's events, and
    // the notes and reading list pages showed them to Sam. Now all three
    // addresses show Sam one page, which says Sam left and when, word for word.
    test("Sam reads the page that says Sam left, at each of its three addresses, and nothing else of the run", () => {
      const pages = l().pages;
      assert.equal(pages.runPage, SAM_LEFT_PAGE);
      assert.equal(pages.notes, SAM_LEFT_PAGE);
      assert.equal(pages.reading, SAM_LEFT_PAGE);
      assert.deepEqual(
        [pages.leave, pages.group, pages.layout, pages.overview, pages.updates, pages.roster],
        [{ sentTo: HOME }, { sentTo: HOME }, "drawn", 403, 403, 403],
      );
      // The list of runs still leaves out a run somebody left. My programmes
      // draws a card for it from its own page's read of the runs they left,
      // which tests/course-hub-leaving.test.mjs runs as every kind of caller.
      assert.deepEqual(pages.hub, []);
    });

    test("the lead's and an admin's Overview, Attendance and CSV, and the facilitators' register, all say he left on Fri 13 Nov with the marks he had", () => {
      for (const tabs of [l().lead, l().admin]) {
        assert.deepEqual(tabs.overview.attention, LEFT_ATTENTION);
        assert.deepEqual(tabs.overview.people, { takingPart: 7, left: 2, line: "2 left. Places can’t be offered after week 1." });
        const sam = tabs.attendance.find((group) => group.name === "Group B").people.find((person) => person.name === "Sam Whitfield");
        assert.deepEqual(sam, { name: "Sam Whitfield", left: "Left Fri 13 Nov", marks: [[1, "present"], [2, "absent"]], after: [3, 4, 5, 6], came: "1 of 2" });
        const joel = tabs.attendance.find((group) => group.name === "Group A").people.find((person) => person.name === "Joel Adeyemi");
        assert.deepEqual(joel, { name: "Joel Adeyemi", left: "Left Wed 4 Nov", marks: [[1, "present"]], after: [2, 3, 4, 5, 6], came: "1 of 1" });
      }
      assert.equal(
        l().csv,
        `${BOM}Group,Name,Week 1,Week 2,Week 3,Week 4,Week 5,Week 6,Came,Of,Left\n` +
          "Group B,Amara Okafor,Present,Present,,,,,2,2,\n" +
          "Group B,Farah Hussain,Present,Late,,,,,2,2,\n" +
          "Group B,Isaac Mensah,Present,Present,,,,,2,2,\n" +
          "Group B,Kofi Asante,Excused,Present,,,,,1,2,\n" +
          "Group B,Sam Whitfield,Present,Absent,,,,,1,2,2026-11-13\n" +
          "Group A,Dev Patel,Late,Present,Present,,,,3,3,\n" +
          "Group A,Joel Adeyemi,Present,,,,,,1,1,2026-11-04\n" +
          "Group A,Mei Tanaka,Present,Excused,Present,,,,2,3,\n" +
          "Group A,Noah Bennett,Present,Present,Absent,,,,2,3,",
      );
      // The register names the people in the group, and somebody who left,
      // by the names rule for its reader, as the grid and the group page do
      // (until the walk of stage three somebody who left was named apart:
      // H8): Rahul, a facilitator who is not on the committee, by the name
      // each goes by; Claudia, the lead on the committee, by the full name.
      for (const [who, members, sam] of [
        ["rahul", ["Amara", "Farah", "Isaac", "Kofi"], "Sam"],
        ["claudia", ["Amara Okafor", "Farah Hussain", "Isaac Mensah", "Kofi Asante"], "Sam Whitfield"],
      ]) {
        const register = l().registers[who];
        assert.deepEqual(register.members, members, who);
        assert.deepEqual(register.leavers, [{ name: sam, left: "Left Fri 13 Nov", marks: { "week 1": "present", "week 2": "absent" } }], who);
      }
      assert.deepEqual(l().registers.amelia.leavers, [{ name: "Joel", left: "Left Wed 4 Nov", marks: { "week 1": "present" } }]);
    });

    test("his group goes on without him: Publish owes nothing, his group's roster and Rahul's update leave him out", () => {
      assert.deepEqual([l().publish.emails, l().publish.people, l().publish.refusals], [0, 0, []]);
      assert.deepEqual(l().amarasRoster, ["Amara", "Farah", "Isaac", "Kofi"]);
      assert.equal(l().rahulsWriteLine, "Write to Group B (4) Posts an update to the group and emails 4 people. Replies go to ai-safety@uonsu.com.");
      assert.deepEqual([l().updateCount, l().update.body.email.sent, l().updateMail], [4, 4, ["amara", "farah", "isaac", "kofi"]]);
    });

    test("the weekly emails stop, as the confirmation promised: Group B's later registers email the four who stayed", () => {
      assert.deepEqual(seen.finishMail, {
        "Group A week 1": [],
        "Group B week 1": ["amara", "farah", "isaac", "kofi", "sam"],
        "Group A week 2": [],
        "Group B week 2": ["amara", "farah", "isaac", "kofi", "sam"],
        "Group A week 3": [],
        "Group B week 3": ["amara", "farah", "isaac", "kofi"],
        "Group A week 4": [],
        "Group A week 5": [],
        "Group B week 5": ["amara", "farah", "isaac", "kofi"],
        "Group A week 6": [],
        "Group B week 6": [],
      });
    });
  });

  // -------------------------------------------------------------------------
  describe("2. a session cancelled through Change a session", () => {
    const c = () => seen.dayAfterTheCancelled;

    test("Rahul cancels Group B's Tue 24 Nov, keeping pace, and the calendar says so", () => {
      assert.deepEqual(seen.cancel.body.change, { kind: "cancel", weekNumber: 4, dateKey: "2026-11-24", newDateKey: null });
      assert.deepEqual(seen.cancelledOn, [[4, "2026-11-24"]]);
    });

    // Until the walk of stage three the lead's tabs read a cancelled session
    // as a register not finished: the card said "Register not pushed" and
    // offered "Remind Rahul and Sofia", whose press emailed them both about
    // a session Rahul had cancelled; Needs attention promised a task the job
    // never makes (it skips cancelled sessions); the chart held week 4 "so
    // far" for ever; and the grid said "Not finished" over it (H2).
    test("the morning after, the lead's Overview reads it as not held: no chase, no Remind, and Remind refuses it", () => {
      assert.deepEqual(c().lead.overview.sessions, [
        { group: "Group A", when: "Thu 19 Nov · 6pm", pill: "Register pushed", line: "2 of 3 came", remind: null },
        { group: "Group B", when: "Tue 24 Nov · 6pm", pill: "Not held", line: null, remind: null },
      ]);
      assert.deepEqual(c().lead.overview.attention, LEFT_ATTENTION);
      assert.deepEqual(c().lead.overview.chart.find(([label]) => label === "W4"), ["W4", 67, false]);
      assert.deepEqual(short(c().remind), [409, "Group B’s session on Tue 24 Nov didn’t happen, so its register needs nothing."]);
      assert.deepEqual(c().remindMail, []);
    });

    // Until the walk of stage three the facilitators' register listed the
    // cancelled week as a session held and not finished, its foot offered to
    // finish it and promised a task, and the member's Home read its week as
    // "not marked yet": both asked the register only (H2). The register now
    // reads it as not held, its foot is about the last session that met, and
    // every press of its register is refused in the register's own words for
    // a session that did not happen, writing and sending nothing.
    test("the facilitators' register reads week 4 as not held, its foot leaves it, and its register needs nothing", () => {
      assert.deepEqual(c().register.sessions, [[1, true, true], [2, true, true], [3, true, true], [4, false, false]]);
      assert.deepEqual(c().register.focus, [3, true]);
      const refused = [409, "Group B’s session on Tue 24 Nov didn’t happen, so its register needs nothing."];
      assert.deepEqual(c().presses, { mark: refused, held: refused, note: refused, push: refused });
      assert.deepEqual([c().pressesWrote, c().pressesMail], [[], 0]);
    });
  });

  // -------------------------------------------------------------------------
  describe("3. before the last session is over", () => {
    const b = () => seen.lastDay;

    test("the Overview says when who finished can be said and offers the way to set a rule; the switch refuses", () => {
      assert.deepEqual(b().lead.overview.finishing, {
        state: "not-yet",
        line: "You can say who finished once the last session is over, on Tue 8 Dec.",
        needsRule: true,
      });
      assert.match(
        b().lead.overviewText,
        /People 7 taking part 2 left\. Places can’t be offered after week 1\. You can say who finished once the last session is over, on Tue 8 Dec\. Set who counts as finished /,
      );
      assert.deepEqual(short(b().switch), [409, "Who finished can be said once the last session is over, on Tue 8 Dec."]);
      assert.deepEqual(b().finishing, []);
      assert.equal(b().lead.head, "Programmes AGI Strategy Fellowship Running · week 6 of 6 C Lead: Claudia · 7 taking part in 2 groups · Last sessions Tue 8 Dec Overview");
    });

    test("a member's pages are on week 6 and claim nothing", () => {
      const amara = b().amara;
      assert.deepEqual([amara.overview, amara.entry], [{ finished: false }, { finished: false, membership: "enrolled" }]);
      // The head since the restyle (board wk-programme): the bar, the kind and
      // term, the title with this week's chip.
      assert.match(amara.home, /^My programmes AGI Strategy Fellowship · Autumn 2026 AGI Strategy Fellowship Week 6 of 6 /);
      assert.doesNotMatch([amara.home, amara.card, amara.list, amara.homeLine].join(" "), /You finished|has ended|Finished|Ended|· finished|· ended/);
    });
  });

  // -------------------------------------------------------------------------
  describe("4. after the last session: who finished", () => {
    const a = () => seen.afterTheEnd;

    test("the head says Finished and how many stayed to the end; with no rule nobody is ticked, and both who left are listed as left", () => {
      for (const tabs of [a().lead, a().admin]) {
        assert.equal(tabs.head, HEAD_AFTER(7));
        assert.deepEqual(whoFinished(tabs), { sentence: NO_RULE, counts: "0 finished · 7 not", rows: listOf([]), left: LEFT, notes: [NOTE] });
      }
    });

    test("the Attendance grid reads the cancelled session as not held, and the registers keep both who left", () => {
      const groupB = a().lead.attendance.find((group) => group.name === "Group B");
      assert.deepEqual(groupB.weeks, [[1, "3 Nov", null], [2, "10 Nov", null], [3, "17 Nov", null], [4, "24 Nov", "not-held"], [5, "1 Dec", null], [6, "8 Dec", null]]);
      assert.deepEqual(
        groupB.people.map((person) => [person.name, person.came]),
        [["Amara Okafor", "5 of 5"], ["Farah Hussain", "3 of 5"], ["Isaac Mensah", "4 of 5"], ["Kofi Asante", "3 of 5"], ["Sam Whitfield", "1 of 2"]],
      );
      // Until the walk of stage three Needs attention went on chasing Farah's
      // two absences in a row after the run's last session, and the grid drew
      // her "2 in a row" (H9). There is no session left to come to, so neither
      // chases anybody once the run is over.
      assert.deepEqual(a().lead.overview.attention.map(([kind]) => kind), ["left", "left"]);
      assert.deepEqual([a().lead.inARow, a().admin.inARow], [[], []]);
      assert.deepEqual(a().registers.rahul.leavers.map((leaver) => [leaver.name, leaver.left]), [["Sam", "Left Fri 13 Nov"]]);
      assert.deepEqual(a().registers.amelia.leavers.map((leaver) => [leaver.name, leaver.left]), [["Joel", "Left Wed 4 Nov"]]);
    });

    test("the members' own calendars still run to tonight: their pages are on week 6 and claim nothing yet", () => {
      assert.deepEqual([a().amara.overview, a().amara.entry.finished], [{ finished: false }, false]);
      assert.match(a().amara.home, /Week 6 of 6/);
    });
  });

  // -------------------------------------------------------------------------
  describe("5. the rule on Settings, across its edges", () => {
    const r = () => seen.rules;

    test("at least 4: Isaac and Noah, who came to 4, are ticked; Farah, Kofi and Mei, who came to 3, are not", () => {
      assert.deepEqual(r().four.answer, [200, { atLeast: 4, sessions: 6 }]);
      assert.deepEqual(r().four.card, { atLeast: 4 });
      assert.deepEqual(r().four.section, { sentence: RULE_SENTENCE(4), counts: "4 finished · 3 not", rows: listOf(["isaac", "noah", "amara", "dev"]), left: LEFT, notes: [NOTE] });
    });

    test("at least 5: the two who came to 4 are not ticked any more", () => {
      assert.deepEqual(r().five.section.rows, listOf(["amara", "dev"]));
      assert.equal(r().five.section.counts, "2 finished · 5 not");
    });

    // The rule is a number of sessions, the same for every group, while a
    // group that had a session cancelled held fewer. Until the walk of stage
    // three, at "at least 6 of 6" Amara, who came to every one of the 5
    // sessions her group held, was not ticked, though the card's hint and the
    // note under the list say a cancelled session "doesn’t count against
    // anyone" (H3). Coming to every session one's group held now meets the
    // rule when the group held fewer, as the hint promises; the rule's
    // ceiling is still the most sessions any group is due to hold (7, below).
    test("at least 6: Dev, at all six of Group A's, and Amara, at all five Group B held, are ticked; Isaac, at four of them, is not", () => {
      assert.deepEqual(r().six.answer, [200, { atLeast: 6, sessions: 6 }]);
      assert.deepEqual(r().six.section.rows, listOf(["amara", "dev"]));
      assert.equal(r().six.section.counts, "2 finished · 5 not");
    });

    test("7 is refused with a sentence and changes nothing; an empty box clears the rule; 4 again", () => {
      assert.deepEqual(r().seven.answer, [409, "This programme’s groups meet 6 times, so nobody can come to more sessions than that."]);
      assert.deepEqual([r().seven.card, r().seven.section.rows], [{ atLeast: 6 }, listOf(["amara", "dev"])]);
      assert.deepEqual([r().cleared.answer, r().cleared.card, r().cleared.section.sentence], [[200, { atLeast: null, sessions: 6 }], { atLeast: null }, NO_RULE]);
      assert.deepEqual(r().back.section, r().four.section);
      assert.deepEqual([r().stored.kind, r().stored.atLeast], ["rule", 4]);
    });

    test("only the programme's lead and admins may set it", () => {
      assert.deepEqual(r().gates, {
        lloyd: [403, "Only the programme’s lead and admins can say who finished."],
        tess: [404, "That programme is not on this form."],
        rahul: [404, "That programme is not on this form."],
        amara: [404, "That programme is not on this form."],
        null: [401, "Not signed in"],
      });
    });
  });

  // -------------------------------------------------------------------------
  describe("6. the lead's changes", () => {
    const d = () => seen.decisions;

    test("ticking Kofi is kept and marked, to her as hers and to an admin as hers; a switch put back stores nothing", () => {
      assert.deepEqual(d().stored, [["rule", 4], ["person", "kofi", true, "claudia"]]);
      assert.deepEqual(whoFinished(d().lead), {
        sentence: RULE_SENTENCE(4),
        counts: "5 finished · 2 not",
        rows: listOf(["kofi", "isaac", "noah", "amara", "dev"], { kofi: "Changed by you" }),
        left: LEFT,
        notes: [NOTE],
      });
      assert.deepEqual(whoFinished(d().admin).rows, listOf(["kofi", "isaac", "noah", "amara", "dev"], { kofi: "Changed by Claudia" }));
      assert.deepEqual(d().farahBack.body.model.rows.find((row) => row.uid === "farah"), {
        uid: "farah",
        name: "Farah Hussain",
        groupName: "Group B",
        came: "3 of 5",
        exercises: "0 of 6",
        line: "Missed weeks 5 and 6",
        finished: false,
        changed: null,
      });
    });

    // Somebody the lead removed is refused in the same words as somebody
    // who left by themselves (H7).
    test("nobody who left, nobody not taking part, and nobody but the lead and admins can be switched", () => {
      assert.deepEqual(d().refused, {
        "Sam, who left": [409, "Sam Whitfield left the programme, so they aren’t on the list of who finished."],
        "Joel, whom she removed": [409, "Joel Adeyemi left the programme, so they aren’t on the list of who finished."],
        "Hannah, who was never on it": [404, "That person isn’t taking part in this programme."],
        "by the reviewer": [403, "Only the programme’s lead and admins can say who finished."],
        "by another programme's lead": [404, "That programme is not on this form."],
        "by a facilitator": [404, "That programme is not on this form."],
        "by a member": [404, "That programme is not on this form."],
        "signed out": [401, "Not signed in"],
      });
    });

    test("the head's count of who stayed to the end is the list's", () => {
      const model = d().lead.overview.finishing;
      assert.equal(d().lead.head, HEAD_AFTER(model.finished + model.not));
    });
  });

  // -------------------------------------------------------------------------
  describe("7. every member's pages, once their calendar is past its last week", () => {
    const pagesOf = (uid) => seen.members[uid];
    const words = (pages) => [pages.home, pages.card, pages.list, pages.homeLine].join(" \n ");

    for (const [uid, why] of [
      ["amara", "came to every session"],
      ["dev", "came to six"],
      ["isaac", "came to exactly as many as the rule asks"],
      ["noah", "came to exactly as many as the rule asks"],
      ["kofi", "came to fewer, and the lead ticked him"],
    ]) {
      test(`${FULL[uid]}, who ${why}, is told they finished, on every page`, () => {
        const pages = pagesOf(uid);
        assert.deepEqual([pages.overview, pages.entry], [{ finished: true }, { finished: true, membership: "enrolled" }]);
        assert.equal(pages.home, MEMBER_PAGES[uid].home);
        // The head is the programme's, as board en-after-phone draws it: the
        // heading, then the term, the group and its facilitators.
        assert.ok(pages.home.startsWith("My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group B · with Rahul and Sofia What you keep ") ||
          pages.home.startsWith("My programmes AGI Strategy You finished AGI Strategy. Autumn 2026 · Group A · with Amelia What you keep "));
        assert.equal(pages.card, MEMBER_PAGES[uid].card);
        assert.equal(pages.list, "Your programmes My programmes AGI Strategy Fellowship Finished");
        assert.equal(pages.homeLine, MEMBER_PAGES[uid].homeLine);
      });
    }

    for (const uid of ["farah", "mei"]) {
      test(`${FULL[uid]}, who did not finish, is told it has ended, and nothing claims more`, () => {
        const pages = pagesOf(uid);
        assert.deepEqual([pages.overview, pages.entry], [{ finished: false }, { finished: false, membership: "enrolled" }]);
        assert.equal(pages.home, MEMBER_PAGES[uid].home);
        // The head is the programme's, as board en-after-nofinish-phone draws
        // it: the heading, the thanks, the term and the group, and nothing
        // about finishing.
        assert.match(pages.home, /^My programmes AGI Strategy AGI Strategy has ended\. Thanks for being part of it\. Autumn 2026 · Group [AB]\. What you keep /);
        assert.equal(pages.card, MEMBER_PAGES[uid].card);
        assert.equal(pages.list, "Your programmes My programmes AGI Strategy Fellowship Ended");
        assert.equal(pages.homeLine, MEMBER_PAGES[uid].homeLine);
        assert.doesNotMatch(words(pages), /You finished|Finished|· finished|finished it|Course complete|Completed|cohort has finished/);
        assert.doesNotMatch(words(pages), /didn’t finish|did not finish|not finished|at least \d/i);
      });
    }

    // CHANGED ON PURPOSE, as in section 1: after the end the page listed the
    // reading list for all 6 weeks and Sam's marks, and the reading list's page
    // showed every week. Every week published and the run over change nothing
    // on the page Sam is shown, at either address.
    test("Sam, who left, reads the same page after the end, and every week published changes nothing on it", () => {
      assert.equal(seen.samAfter.runPage, SAM_LEFT_PAGE);
      assert.equal(seen.samAfter.reading, SAM_LEFT_PAGE);
      assert.deepEqual(seen.samAfter.hub, []);
    });

    test("Joel, whom the lead removed, and Hannah, who was never placed, are shown nothing of the run", () => {
      assert.deepEqual(pagesOf("joel"), { runPage: { sentTo: "/learn" }, overview: { refused: 403 }, entry: null });
      assert.deepEqual(seen.hannahAfter, { runPage: { sentTo: "/learn" }, overview: { refused: 403 }, entry: null });
    });

    test("nothing claims a person finished who did not, and no member is sent the rule", () => {
      const finished = new Set(seen.lead.overview.finishing.rows.filter((row) => row.finished).map((row) => row.uid));
      assert.deepEqual([...finished].sort(), ["amara", "dev", "isaac", "kofi", "noah"]);
      for (const [uid, pages] of Object.entries(seen.members)) {
        if (!pages.entry) continue;
        assert.equal(pages.overview.finished, finished.has(uid), uid);
        assert.equal(pages.entry.finished, finished.has(uid), uid);
        if (!finished.has(uid)) assert.doesNotMatch(words(pages), /You finished|Finished|· finished/, uid);
        // The rule's own words ("at least 4 of 6") are the lead's and admins' only.
        assert.doesNotMatch(words(pages), /at least \d/, uid);
      }
    });

    // Until the walk of stage three the run home after the end still drew
    // "Leave the programme" at its foot for everybody taking part, and a
    // press took a finished record (H1). Leaving now closes at the run's last
    // session, the moment who finished opens, so no run home draws it. Since
    // the restyle (board wk-programme) the page ends with the group, and the
    // person's marks carry no count of their sessions at all (C26): the board's
    // line where "N of M sessions in full so far" used to be.
    test("no run home after the end offers Leave the programme", () => {
      for (const uid of ["amara", "dev", "farah", "isaac", "kofi", "mei", "noah"]) {
        assert.deepEqual(pagesOf(uid).runPage, { runHome: { canLeave: false } }, uid);
        // The page once it is over (en-after-phone) ends with the weeks and
        // their way to the progress page, and has no way out.
        assert.match(pagesOf(uid).home, / The 6 weeks .* See your progress week by week →$/, uid);
        assert.ok(!pagesOf(uid).home.includes("Leave the programme"), uid);
        assert.doesNotMatch(pagesOf(uid).home, /in full|so far|\d+ of \d+ sessions/, uid);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Until the walk of stage three leaving was open until the run was gone,
  // and who finished from the last session on, so the two overlapped for
  // good: somebody who finished could still leave, and leaving took their
  // finished record, gave their place on the form back after the term and
  // emailed them that the weekly emails would stop (H1). Leaving now closes
  // at the run's last session, the moment who finished opens, in the one
  // function the run home, the confirmation and the route ask.
  describe("8. somebody who finished presses Leave the programme after the end", () => {
    const e = () => seen.lateLeave;

    test("there is no way out: no link, the confirmation sends her to the run's home, and the press is refused with a sentence", () => {
      assert.equal(e().runHome.canLeave, false);
      assert.deepEqual(e().confirmation, { sentTo: HOME });
      assert.deepEqual(short(e().answer), [
        409,
        "AGI Strategy Fellowship has ended, so there’s nothing to leave. If you need something changed, email ai-safety@uonsu.com.",
      ]);
    });

    test("the press writes nothing and sends nothing", () => {
      assert.deepEqual(e().changed, []);
      assert.deepEqual(e().mail, []);
    });

    test("she keeps her finished record, her pages and her place on the form", () => {
      assert.equal(e().section.counts, "5 finished · 2 not");
      assert.deepEqual(e().section.left, LEFT);
      assert.ok(e().section.rows.some(([name, , , , , finished]) => name === "Amara Okafor" && finished === true));
      assert.deepEqual([e().member.overview, e().member.entry], [{ finished: true }, { finished: true, membership: "enrolled" }]);
      assert.equal(e().member.home, MEMBER_PAGES.amara.home);
      assert.deepEqual(e().application, e().applicationBefore);
      assert.deepEqual(e().application, { status: "accepted", attendance: null, releaseReason: null, standing: ["place", null] });
    });
  });

  // -------------------------------------------------------------------------
  describe("9. the run's destroy", () => {
    test("its manifest counts the rule and the lead's decision, and the destroy drains both with the run", () => {
      const x = seen.destroy;
      assert.equal(x.finishingBefore, 2);
      assert.deepEqual(x.manifest, { finishing: 2, blockers: [] });
      assert.deepEqual(x.passes, [[200, 2, true, null]]);
      assert.deepEqual(x.finishingAfter, []);
      assert.equal(x.runAfter, null);
    });
  });

  // -------------------------------------------------------------------------
  test("no email or page this term carried an en or em dash", async () => {
    const dash = new RegExp(`[${EN_DASH}${EM_DASH}]`);
    for (const mail of world.mail) {
      const text = (await opened(mail)).text;
      if (mail.subject.startsWith("[TEST]")) continue;
      assert.doesNotMatch(`${mail.subject} ${text}`, dash, `${mail.to}: ${mail.subject}`);
    }
    for (const text of [
      seen.leaving.confirmation,
      seen.leaving.pages.runPage,
      seen.leaving.pages.notes,
      seen.leaving.pages.reading,
      seen.lead.overviewText,
      seen.lead.settingsText,
    ]) {
      assert.doesNotMatch(text, dash);
    }
  });
});

