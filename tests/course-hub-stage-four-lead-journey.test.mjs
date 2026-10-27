/**
 * STAGE FOUR OF THE COURSE HUB, AS ITS LEAD AND NAISI'S ADMINS USE IT: one
 * term from the week groups go out to the day after its last session, through
 * every piece the lead and admins press, on one store.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Each piece was built with suites of its own, on sample documents shaped
 * the way that piece expects: the Weeks tab, Get ready for week 1, Publish's
 * own page and its emails, the People tab, the programme surveys, a survey
 * after an event, check-in, public numbers, the Kairos report and This term
 * in numbers. What none of them can see is the seam between two: a number
 * one page shows and another page shows differently, a button that says how
 * many it emails and a press that emails another number, a page that says
 * who reads something and a reader the page did not name.
 *
 * So this file runs ONE term through the real route handlers and pages, on
 * one database, and holds every number two pages show to each other:
 *
 *  A. Before groups go out (Mon 26 Oct 2026). An admin hands AGI Strategy's
 *     people over; its lead sets the day groups go out, places people,
 *     pastes week 1 on the Weeks tab (a week with no page: the paste makes
 *     it), reads it, previews it as a fellow and marks it ready. The Weeks
 *     tab, the Overview's Get ready for week 1 and Publish's own page say the
 *     same about week 1; the People tab and the checklist count the same
 *     people; Remind emails the number on its button.
 *  B. Publish (Tue 27 Oct). The emails Publish's page counts are the emails
 *     a press sends, to the people the People tab holds.
 *  C. The before survey (Thu 29 Oct to Tue 3 Nov) and the leaving survey. An
 *     admin makes the before survey, tests it, sends it, reminds and closes
 *     it. Its Send tab's count, its Results, Who answered, the logged
 *     download and one person's answers agree; the lead reads its totals
 *     and comments with no name, as the box at its top says. Sam leaves
 *     before Group B first meets and answers the leaving survey, which the
 *     lead reads without a name.
 *  D. An event (Sun 1 Nov). Sign-ups checked in on the door list and by the
 *     QR code, a member who did not sign up by the code, two walk-ins at the
 *     door; its survey opened at the event and emailed to who came. The
 *     Check-in tab, the organiser's tab and the survey's Results agree, and
 *     each reader reads what the policy says.
 *  E. The weeks and after the end (to Fri 11 Dec). Every register typed and
 *     finished by its facilitator in its own week, Callum taken off after
 *     week 2, the survey at the end sent and answered (Kofi saying no to
 *     sharing with Kairos on its form), the rule for who finished set, each
 *     group's fellows rated. Who finished, the head, the Kairos report and
 *     its file, public numbers (published and taken down), This term in
 *     numbers and certificates say the same numbers, each with the base it
 *     rests on.
 *
 * Where two pieces disagree today the test pins what is so and its comment
 * names the disagreement (L1 onwards, most serious first, written up in the
 * walk's notes), so a change to either piece has to change this file on
 * purpose.
 *
 * ## How it is laid out
 *
 * As the earlier journeys: `tellTheStory()` makes every request once, in
 * the order the term happens (`upTo` types the registers that fall before
 * each step, at their own times), and writes down what came back (`seen`);
 * the tests read what was written down. A request that goes wrong is
 * recorded like any other and the story carries on. The world has one
 * signed-in user, so no two requests are ever in flight.
 *
 * ## What is real and what is stubbed
 *
 * Real: every route handler and page named below, the libraries behind them,
 * the access predicates, the email templates, the QR library. Stubbed (the
 * hand-over world's): `server-only`, `next/server`, the Admin SDK's
 * sentinels and handle (an in-memory store), the session, the view-as guard
 * and the one mail door, which writes down what it was handed and sends
 * nothing; and here Next's navigation and link, the hydration hook (reads
 * "not yet", as a page first arrives), the browser SDK (no page may reach it
 * while it is drawn), the rate limiter and the stylesheets. The clock is the
 * runner's, set by the story. Every address is `example.com`.
 */
import { before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { checkInSeed, EVENT_ID, RSVP } from "./lib/checkInWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { COURSE, loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, ROUND, RUN } from "./lib/leadWorld.mjs";
import { termSeed } from "./lib/peopleWorld.mjs";
import { syntheticGuideMarkdown } from "./lib/weekBlocksFixture.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

// ---------------------------------------------------------------------------
// The world: one database, one mail door, one clock
// ---------------------------------------------------------------------------

/** Mon 26 Oct 2026, noon in London (GMT from Sun 25 Oct): the week groups go out. */
const MONDAY = new Date("2026-10-26T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: MONDAY });

const KEY = "__stageFourLead";
const handle = `globalThis[${JSON.stringify(KEY)}]`;

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

/** The Firestore module as the routes import it, with the `FieldPath` the account sweep names. */
const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { constructor(...parts) { this.parts = parts; } static documentId() { return '__name__'; } }",
);

const made = makeWorld(KEY, [
  ["firebase-admin/firestore", FIRESTORE],
  // The admissions tree's page gate imports the session by its own path.
  ["./session", `export async function getCurrentUser() { return ${handle}.user; }`],
  ["@/lib/rateLimit", "export function rateLimit() { return { ok: true, retryAfterSeconds: 0 }; }\nexport function clientIp() { return '10.0.0.1'; }"],
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
      "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
      "export function usePathname() { return '/admin'; }\n" +
      "export function useSearchParams() { return new URLSearchParams(); }\n" +
      `export function useSelectedLayoutSegment() { return ${handle}.segment ?? null; }`,
  ],
  [
    "next/link",
    "export default ({ href, className, children, scroll, prefetch, onClick, ...rest }) =>\n" +
      `  ${handle}.h('a', { href, className, ...rest }, children);`,
  ],
  ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
  ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${handle}.h('div', { className }, children); }`],
  [
    "@/lib/firebase/client",
    ["getFirebaseApp", "getClientAuth", "getClientDb", "getClientStorage"]
      .map((name) => `export function ${name}() { throw new Error('no browser SDK while a page is drawn'); }`)
      .join("\n"),
  ],
  ["@/auth/signInWithGoogle", "export async function signOut() {}"],
  ["@/lib/navigation/hardNavigate", "export function hardNavigate() {}"],
  ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
]);
const { world, loadTs, call } = made;
world.h = createElement;
world.segment = null;
const join_ = await loadJoin(made);

/** Move every clock the routes and the store read. */
const at = (when) => mock.timers.setTime(new Date(when).getTime());

/** The words of some markup: tags gone, entities read, space folded. */
function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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
  const children = element.props?.children;
  if (children !== undefined) find(children, name, out);
  return out;
}

/** The session a page is drawn for: the stored account, with the reviewer flag the admissions gate reads. */
function sessionFor(uid) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

/**
 * A server page as `who`: its element, HTML and words, or where it sent them,
 * and whether drawing it wrote anything.
 */
async function draw(Page, who, params, { searchParams = {}, segment = null } = {}) {
  world.user = who === null ? null : sessionFor(who);
  world.course = true;
  world.segment = segment;
  const before = made.everything();
  try {
    const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });
    const html = renderToStaticMarkup(element);
    return { element, html, text: textOf(html), to: null, wrote: made.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { element: null, html: "", text: "", to: err.to, wrote: made.everything() !== before };
  } finally {
    world.course = false;
  }
}

/** A module under `src/`, loaded once. */
const loaded = new Map();
async function load(path) {
  if (!loaded.has(path)) loaded.set(path, await loadTs(path));
  return loaded.get(path);
}
const route = (path) => load(`app/api/${path}/route.ts`);
const TABS = "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)";
const tabPage = async (path) => (await load(`${TABS}/${path}/page.tsx`)).default;
const adminSurveyPage = async (path) => (await load(`app/(app)/admin/(admin-only)/surveys/${path}page.tsx`)).default;

const PARAMS = { roundId: ROUND, programmeId: AGI };

/** Every message the mail door was handed, read as the person it went to would read it. */
const mailText = (messages = world.mail) =>
  messages.map((message) => ({
    to: message.to,
    subject: message.subject,
    kind: message.kind,
    surface: message.surface ?? null,
    text: textOf(renderToStaticMarkup(message.react)),
  }));

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

/**
 * The term after decision day (`tests/lib/peopleWorld.mjs`'s `termSeed`):
 * AGI Strategy names its run (six weeks from Thu 29 Oct, Groups B on
 * Tuesdays at 6pm with Rahul and Sofia, A on Thursdays at 6pm with Sofia, C
 * on Wednesdays at 1pm with Tom), Claudia leads it, Lloyd reviews it, Yusuf
 * is its track lead. Holding a place: Amara, Bea, Callum, Dev, Kofi, Sam,
 * Tariq and Zach, the admin, who applied too. Nina gave a place back; Ines and
 * Sana were invited from Technical AI Safety's pool (Sana said no); Ruth
 * was offered a freed place. Nobody is on the run's list yet.
 *
 * On top, an event of the term (`tests/lib/checkInWorld.mjs`): VR GAMES
 * NIGHT, Sun 1 Nov from 2pm to 5pm, run by Iris (committee the SU does not
 * recognise) with Cal; Sue is SU-recognised committee and runs the door.
 * Sign-ups: Kofi and Chloe (members), Gwen (a guest), Wren (waiting list),
 * Pat (not decided), Cora (cancelled), Dina (refused) and a test sign-up.
 */
function journeySeed() {
  const seed = termSeed();
  for (const [path, doc] of Object.entries(checkInSeed())) {
    if (path.startsWith("users/") && seed[path]) continue;
    seed[path] = doc;
  }
  return seed;
}

made.reset(journeySeed(), { now: () => new Date() });
for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });

/** What every request and page answered, in the order they were made. */
const seen = {};

// ---------------------------------------------------------------------------
// Short ways to ask
// ---------------------------------------------------------------------------

const R = {};
async function loadRoutes() {
  R.groupsGoOut = await route("admissions/forms/[roundId]/programmes/[programmeId]/groups-go-out");
  R.remindFree = await route("admissions/forms/[roundId]/programmes/[programmeId]/when-free/remind");
  R.blocks = await route("courses/runs/[runId]/weeks/[weekId]/blocks");
  R.ready = await route("courses/runs/[runId]/weeks/[weekId]/ready");
  R.preview = await route("courses/runs/[runId]/allocation/publish/preview");
  R.enrol = await route("courses/runs/[runId]/enrol");
  R.surveys = await route("surveys");
  R.surveyQuestions = await route("surveys/[surveyId]/questions");
  R.surveyTest = await route("surveys/[surveyId]/test");
  R.surveySend = await route("surveys/[surveyId]/send");
  R.surveyRemind = await route("surveys/[surveyId]/remind");
  R.surveyClose = await route("surveys/[surveyId]/close");
  R.surveyOpen = await route("surveys/[surveyId]/open");
  R.surveyExport = await route("surveys/[surveyId]/export");
  R.surveyPerson = await route("surveys/[surveyId]/people/[who]");
  R.answerByLink = await route("surveys/answer");
  R.answerSignedIn = await route("surveys/[surveyId]/answer");
  R.openAtEvent = await route("surveys/[surveyId]/open-at-event");
  R.doorCode = await route("events/[id]/door-code");
  R.checkIns = await route("events/[id]/check-ins");
  R.selfCheckIn = await route("events/[id]/check-in");
  R.remove = await route("courses/runs/[runId]/enrolments/[uid]/remove");
  R.register = await route("courses/groups/[groupId]/attendance");
  R.registerPush = await route("courses/groups/[groupId]/attendance/push");
  R.rule = await route("admissions/forms/[roundId]/programmes/[programmeId]/finishing/rule");
  R.certificates = await route("admissions/forms/[roundId]/programmes/[programmeId]/certificates");
  R.certificatesTest = await route("admissions/forms/[roundId]/programmes/[programmeId]/certificates/test");
  R.publicNumbers = await route("surveys/public-numbers");
  R.takeDown = await route("surveys/public-numbers/take-down");
  R.termTotals = await route("surveys/term/totals");
  R.ratings = await route("courses/groups/[groupId]/ratings");
  R.kairosExport = await route("kairos/export");
}
const P = {};
async function loadPages() {
  P.weeks = await tabPage("weeks");
  P.week = await tabPage("weeks/[weekId]");
  P.weekPreview = await tabPage("weeks/[weekId]/preview");
  P.overview = await tabPage("overview");
  P.publish = await tabPage("groups/publish");
  P.people = await tabPage("people");
  P.leadSurvey = await tabPage("surveys/[surveyId]");
  P.leadTab = await tabPage("surveys");
  P.surveyList = await adminSurveyPage("");
  P.surveySend = await adminSurveyPage("[surveyId]/send/");
  P.surveyResults = await adminSurveyPage("[surveyId]/results/");
  P.surveyAnswered = await adminSurveyPage("[surveyId]/answered/");
  P.surveyPerson = await adminSurveyPage("[surveyId]/answered/[who]/");
  P.term = await adminSurveyPage("term/");
  P.publicNumbers = await adminSurveyPage("public-numbers/");
  P.kairos = await adminSurveyPage("kairos/[roundId]/[programmeId]/");
  P.checkInTab = (await load("app/(app)/events/manage/[id]/check-in/page.tsx")).default;
  P.surveyTab = (await load("app/(app)/events/manage/[id]/survey/page.tsx")).default;
  P.door = (await load("app/(app)/events/manage/[id]/door/page.tsx")).default;
  P.fetchLastTerm = (await load("lib/publicNumbers/fetch.ts")).fetchLastTerm;
  P.LastTermBlock = (await load("features/publicNumbers/LastTermBlock.tsx")).default;
  P.certificates = await tabPage("overview/certificates");
  P.answerLink = (await load("app/survey/[token]/page.tsx")).default;
}

/** The people rows and answers of one survey, as stored. */
const docsUnder = (prefix) =>
  world.db
    .paths()
    .filter((path) => path.startsWith(prefix))
    .map((path) => ({ path, ...world.db.read(path) }));
const surveyPeople = (id) => docsUnder("surveyPeople/").filter((row) => row.surveyId === id);
const tokenOf = (id, uid) => surveyPeople(id).find((row) => row.respondent?.uid === uid)?.token ?? null;
const choice = (optionId) => ({ type: "choice", optionId });
const scale = (value) => ({ type: "scale", value });
const words = (text, quote = false) => (quote ? { type: "text", text, quote: true } : { type: "text", text });

/** The week's Markdown as the guide's export pastes it, for week `n`. */
const weekMarkdown = (n) => syntheticGuideMarkdown().replace("# Week 3: How sure are you?", `# Week ${n}: How sure are you?`);

const weekParams = (weekId) => ({ runId: RUN.agi, weekId });
const paste = (who, weekId, markdown, extra = {}) =>
  call(who, R.blocks.PUT, weekParams(weekId), { body: { markdown, ...extra }, course: true });
const readIt = (who, weekId, markdown) => call(who, R.blocks.POST, weekParams(weekId), { body: { markdown }, course: true });
const markReady = (who, weekId, ready = true) => call(who, R.ready.PUT, weekParams(weekId), { body: { ready }, course: true });

/** The Overview's checklist model as `who` reads it, with the page's words. */
async function overview(who) {
  const drawn = await draw(P.overview, who, PARAMS, { segment: "overview" });
  const [frame] = drawn.element ? find(drawn.element, "ProgrammeOverview") : [];
  return { ...drawn, getReady: frame?.props.getReady ?? null };
}
/** Publish's own page as `who`: its readiness model and its words. */
async function publishPage(who) {
  const drawn = await draw(P.publish, who, PARAMS, { segment: "groups" });
  const [readiness] = drawn.element ? find(drawn.element, "PublishReadiness") : [];
  return { ...drawn, readiness: readiness?.props.model ?? null };
}
/** The People tab as `who`: the view its table is handed, and its words. */
async function peoplePage(who) {
  const drawn = await draw(P.people, who, PARAMS, { segment: "people" });
  const visit = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }
    if (node.props?.view && Array.isArray(node.props.view.rows)) return node.props.view;
    return visit(node.props?.children);
  };
  return { ...drawn, view: drawn.element ? visit(drawn.element) : null };
}

/**
 * The course page's "Last term" block as a visitor reads it: the page's own
 * fetcher, signed out, and the block it draws; null when there is none.
 */
async function lastTerm() {
  world.user = null;
  const data = await P.fetchLastTerm(COURSE.agi);
  if (!data) return null;
  const html = renderToStaticMarkup(createElement(P.LastTermBlock, { ...data, headingId: "last-term-heading", ground: "floor" }));
  return { data, html, text: textOf(html) };
}

/**
 * Every group's sessions, in order, and who types each register: Group A on
 * Thursdays at 6pm (Sofia), Group B on Tuesdays at 6pm (Rahul), Group C on
 * Wednesdays at 1pm (Tom), each typed twenty minutes after the session ends.
 */
const SESSIONS = {
  A: ["2026-10-29", "2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"].map((day) => `${day}T20:20:00Z`),
  B: ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01", "2026-12-08"].map((day) => `${day}T20:20:00Z`),
  C: ["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25", "2026-12-02", "2026-12-09"].map((day) => `${day}T15:20:00Z`),
};
const GROUP_ID = { A, B, C };
const TYPIST = { A: "sofia", B: "rahul", C: "tom" };
/** Who came: Tariq misses weeks 2 to 4, Kofi is excused in week 2, Bea misses week 5, Dev weeks 5 and 6. */
const markOf = (uid, week) =>
  uid === "tariq" && week >= 2 && week <= 4
    ? "absent"
    : uid === "kofi" && week === 2
      ? "excused"
      : uid === "bea" && week === 5
        ? "absent"
        : uid === "dev" && week >= 5
          ? "absent"
          : "present";

/** Every session still to be typed, earliest first. */
const toType = Object.entries(SESSIONS)
  .flatMap(([tag, days]) => days.map((when, i) => ({ tag, week: i + 1, when })))
  .sort((x, y) => x.when.localeCompare(y.when));

/**
 * Move the clock to `when`, typing and finishing every register that falls
 * before it on the way, each at its own time and through its own routes, by
 * the group's facilitator, for the people taking part in the group then.
 */
async function upTo(when) {
  while (toType.length > 0 && toType[0].when <= new Date(when).toISOString()) {
    const { tag, week, when: typed } = toType.shift();
    at(typed);
    const groupId = GROUP_ID[tag];
    const people = docsUnder("courseEnrolments/")
      .filter((seat) => seat.runId === RUN.agi && seat.role !== "facilitator" && seat.groupId === groupId && seat.status === "active")
      .map((seat) => seat.uid)
      .sort();
    const marks = people.map((uid) => ({ uid, status: markOf(uid, week) }));
    const saved = await call(TYPIST[tag], R.register.POST, { groupId }, { body: { weekNumber: week, marks }, course: true });
    const pushed = await call(TYPIST[tag], R.registerPush.POST, { groupId }, { body: { weekNumber: week }, course: true });
    seen.registers.push([tag, week, saved.status, pushed.status, people.join(" ")]);
  }
  at(when);
}

/** The programme's head as `who` reads it: the tabs' layout, drawn around nothing. */
async function head(who) {
  const Layout = (await load(`${TABS}/layout.tsx`)).default;
  world.user = sessionFor(who);
  world.course = true;
  try {
    const element = await Layout({ children: null, params: Promise.resolve(PARAMS) });
    return textOf(renderToStaticMarkup(element));
  } finally {
    world.course = false;
  }
}

/** The story, in the order the term happens. Each request once; what came back written into `seen`. */
async function tellTheStory() {
  await loadRoutes();
  await loadPages();
  seen.registers = [];

  // ---- A. Before groups go out: Mon 26 Oct ---------------------------------
  at(MONDAY);
  seen.handOver = await join_.press("zach");
  seen.goOut = await call("claudia", R.groupsGoOut.PUT, PARAMS, { body: { on: "2026-10-28" } });
  seen.placed = await join_.place("claudia", [
    { uid: "amara", groupId: B },
    { uid: "kofi", groupId: B },
    { uid: "sam", groupId: B },
    { uid: "callum", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "zach", groupId: A },
  ]);
  // Week 1 has no page yet.
  seen.weeksBefore = await draw(P.weeks, "claudia", PARAMS, { segment: "weeks" });
  seen.week1Before = await draw(P.week, "claudia", { ...PARAMS, weekId: "w01" }, { segment: "weeks" });
  seen.overviewBefore = await overview("claudia");
  seen.publishBefore = await publishPage("claudia");
  seen.readW1 = await readIt("claudia", "w01", weekMarkdown(1));
  seen.pasteW1 = await paste("claudia", "w01", weekMarkdown(1));
  seen.weeksPasted = await draw(P.weeks, "claudia", PARAMS, { segment: "weeks" });
  seen.overviewPasted = await overview("claudia");
  seen.publishPasted = await publishPage("claudia");
  seen.previewW1 = await draw(P.weekPreview, "claudia", { ...PARAMS, weekId: "w01" }, { segment: "weeks" });
  seen.readyW1 = await markReady("claudia", "w01");
  seen.weeksReady = await draw(P.weeks, "claudia", PARAMS, { segment: "weeks" });
  seen.week1Ready = await draw(P.week, "claudia", { ...PARAMS, weekId: "w01" }, { segment: "weeks" });
  seen.overviewReady = await overview("claudia");
  seen.publishReady = await publishPage("claudia");
  seen.peopleLead = await peoplePage("claudia");
  seen.peopleAdmin = await peoplePage("zach");
  seen.overviewAdmin = await overview("zach");

  // ---- B. Remind, place the rest, Publish: Tue 27 Oct ---------------------------
  at("2026-10-27T10:00:00Z");
  world.mail.length = 0;
  seen.remindShown = seen.overviewReady.getReady?.model?.notSaid?.remind ?? null;
  seen.remindFree = await call("claudia", R.remindFree.POST, PARAMS, { body: { emails: seen.remindShown?.count ?? 0 } });
  seen.remindMail = mailText();
  seen.placedRest = await join_.place("claudia", [
    { uid: "dev", groupId: C },
    { uid: "tariq", groupId: B },
  ]);
  seen.overviewPlaced = await overview("claudia");
  seen.publishPlaced = await publishPage("claudia");
  seen.previewPlaced = await call("claudia", R.preview.GET, { runId: RUN.agi }, { course: true });
  seen.board = await join_.board("claudia");
  world.mail.length = 0;
  seen.groupsPublished = await join_.publish("claudia");
  seen.publishMail = world.mail.map((message) => ({ to: message.to, subject: message.subject, kind: message.kind }));
  seen.overviewPublished = await overview("claudia");
  seen.publishAfter = await publishPage("claudia");
  seen.peopleAfter = await peoplePage("claudia");

  // ---- C. The before survey: made, tested and sent on Thu 29 Oct -------------------
  at("2026-10-29T09:00:00Z");
  world.mail.length = 0;
  seen.surveyMade = await call("zach", R.surveys.POST, {}, {
    body: { roundId: ROUND, programmeId: AGI, stage: "before", closesOn: "2026-11-04" },
  });
  const before = seen.surveyMade.body?.survey?.id ?? null;
  seen.beforeId = before;
  seen.sendDraft = await draw(P.surveySend, "zach", { surveyId: before });
  seen.surveyTested = await call("zach", R.surveyTest.POST, { surveyId: before }, { body: { email: "survey" } });
  seen.sendTested = await draw(P.surveySend, "zach", { surveyId: before });
  seen.testMail = mailText();
  world.mail.length = 0;
  seen.sendWrongCount = await call("zach", R.surveySend.POST, { surveyId: before }, { body: { to: "everyone", emails: 0 } });
  seen.surveySent = await call("zach", R.surveySend.POST, { surveyId: before }, {
    body: { to: "everyone", emails: seen.sendWrongCount.body?.emails ?? -1 },
  });
  seen.sentMail = mailText();
  seen.sentPeople = surveyPeople(before).map((row) => row.respondent?.uid).sort();
  // What a fellow reads at the top of it, opened from the email, signed out.
  seen.answerPageBefore = await draw(P.answerLink, null, { token: tokenOf(before, "tariq") });

  // The leaving survey, made and opened the same morning: it reaches each person as they leave.
  at("2026-10-29T09:30:00Z");
  seen.leavingMade = await call("zach", R.surveys.POST, {}, { body: { roundId: ROUND, programmeId: AGI, stage: "leaving" } });
  seen.leavingId = seen.leavingMade.body?.survey?.id ?? null;
  seen.leavingOpened = await call("zach", R.surveyOpen.POST, { surveyId: seen.leavingId }, { body: {} });
  const leaving = seen.leavingId;

  // Answers by each person's own link: Amara (Group B, first meets Tue 3 Nov)
  // and Bea (Group A, meeting since 6pm) during Group A's first session.
  at("2026-10-29T19:00:00Z");
  seen.answers = {};
  seen.answers.amara = await call(null, R.answerByLink.POST, {}, {
    body: { token: tokenOf(before, "amara"), answers: { q_c1: choice("o_stage1"), q_c4: scale(3), q_p6: words("Meet people who think about this.") } },
  });
  seen.answers.bea = await call(null, R.answerByLink.POST, {}, {
    body: { token: tokenOf(before, "bea"), answers: { q_c1: choice("o_stage0"), q_c4: scale(2) } },
  });
  await upTo("2026-10-30T09:00:00Z");
  seen.answers.dev = await call(null, R.answerByLink.POST, {}, {
    body: { token: tokenOf(before, "dev"), answers: { q_c1: choice("o_stage2"), q_c4: scale(4) } },
  });

  // The admins' pages and the lead's.
  seen.resultsBefore = await draw(P.surveyResults, "zach", { surveyId: before });
  seen.answeredBefore = await draw(P.surveyAnswered, "zach", { surveyId: before });
  seen.leadBefore = await draw(P.leadSurvey, "claudia", { ...PARAMS, surveyId: before }, { segment: "surveys" });
  seen.listMid = await draw(P.surveyList, "zach", {});

  // The spreadsheet with names, recorded first.
  const exportsBefore = docsUnder("dataExports/").length;
  world.user = sessionFor("zach");
  const exported = await R.surveyExport.POST(new Request("https://naisi.invalid/api", { method: "POST" }), {
    params: Promise.resolve({ surveyId: before }),
  });
  seen.export = { status: exported.status, text: await exported.text(), headers: Object.fromEntries(exported.headers) };
  seen.exportRecords = docsUnder("dataExports/").slice(exportsBefore);
  seen.exportByLead = await call("claudia", R.surveyExport.POST, { surveyId: before }, {});

  // One person's answers: the page reads nothing, the press opens and records.
  const openingsBefore = docsUnder("recordOpenings/").length;
  seen.personPage = await draw(P.surveyPerson, "zach", { surveyId: before, who: "amara" });
  seen.personPageWrote = docsUnder("recordOpenings/").length - openingsBefore;
  seen.personOpened = await call("zach", R.surveyPerson.POST, { surveyId: before, who: "amara" }, {});
  seen.openings = docsUnder("recordOpenings/").slice(openingsBefore);
  seen.personByLead = await call("claudia", R.surveyPerson.POST, { surveyId: before, who: "amara" }, {});

  // ---- Sam leaves on Sun 1 Nov, before Group B has met, and answers the leaving survey.
  at("2026-11-01T10:00:00Z");
  seen.samLeaves = await call("sam", R.enrol.DELETE, { runId: RUN.agi }, {
    body: { confirmName: "AGI Strategy Fellowship", reason: "Too much on this term." },
    course: true,
  });
  seen.overviewSamLeft = await overview("claudia");
  seen.peopleSamLeft = await peoplePage("claudia");
  seen.headSamLeft = await head("claudia");
  at("2026-11-01T10:30:00Z");
  seen.samAnswersLeaving = await call("sam", R.answerSignedIn.POST, { surveyId: leaving }, {
    body: {
      answers: {
        q_leave_why: { type: "choices", optionIds: ["o_time"] },
        q_leave_stay: words("Shorter readings in the busy weeks."),
        q_leave_again: choice("o_maybe"),
      },
    },
  });
  seen.leadLeaving = await draw(P.leadSurvey, "claudia", { ...PARAMS, surveyId: leaving }, { segment: "surveys" });
  seen.facilitatorLeaving = await draw(P.leadSurvey, "rahul", { ...PARAMS, surveyId: leaving }, { segment: "surveys" });
  seen.reviewerLeaving = await draw(P.leadSurvey, "lloyd", { ...PARAMS, surveyId: leaving }, { segment: "surveys" });
  seen.adminLeavingResults = await draw(P.surveyResults, "zach", { surveyId: leaving });

  // ---- D. VR games night: Sun 1 Nov ----------------------------------------------
  at("2026-11-01T12:00:00Z");
  world.mail.length = 0;
  seen.eventSurveyMade = await call("zach", R.surveys.POST, {}, {
    body: { template: "event", eventId: EVENT_ID, audience: "came", closesOn: "2026-11-08" },
  });
  const night = seen.eventSurveyMade.body?.survey?.id ?? null;
  seen.nightId = night;
  seen.doorCodeByIris = await call("iris", R.doorCode.POST, { id: EVENT_ID }, { body: {} });
  seen.doorCode = await call("sue", R.doorCode.POST, { id: EVENT_ID }, { body: {} });
  at("2026-11-01T14:05:00Z");
  seen.kofiSelf = await call("kofi", R.selfCheckIn.POST, { id: EVENT_ID }, {});
  at("2026-11-01T14:10:00Z");
  seen.gwenDoor = await call("sue", R.checkIns.POST, { id: EVENT_ID }, { body: { rsvpId: RSVP.gwen, from: "door" } });
  seen.wrenDoor = await call("sue", R.checkIns.POST, { id: EVENT_ID }, { body: { rsvpId: RSVP.wren, from: "door" } });
  seen.moSelf = await call("mo", R.selfCheckIn.POST, { id: EVENT_ID }, {});
  seen.rosaWalkIn = await call("sue", R.checkIns.POST, { id: EVENT_ID }, {
    body: { walkIn: { name: "Rosa Martinez", email: "rosa@example.com" }, from: "door" },
  });
  seen.danWalkIn = await call("sue", R.checkIns.POST, { id: EVENT_ID }, { body: { walkIn: { name: "Dan Fitzgerald" }, from: "door" } });
  seen.irisTicks = await call("iris", R.checkIns.POST, { id: EVENT_ID }, { body: { rsvpId: RSVP.chloe, from: "door" } });
  seen.checkInSue = await draw(P.checkInTab, "sue", { id: EVENT_ID });
  seen.checkInIris = await draw(P.checkInTab, "iris", { id: EVENT_ID });
  seen.doorIris = await draw(P.door, "iris", { id: EVENT_ID });
  at("2026-11-01T16:30:00Z");
  seen.openedAtEvent = await call("zach", R.openAtEvent.POST, { surveyId: night }, { body: {} });
  seen.kofiAnswersNight = await call("kofi", R.answerSignedIn.POST, { surveyId: night }, {
    body: { answers: { q_ev_how: { type: "rating", value: 5 }, q_ev_again: choice("o_ev_yes") } },
  });

  // ---- C, again. The before survey's reminder: Mon 2 Nov --------------------------
  at("2026-11-02T09:00:00Z");
  seen.listBeforeRemind = await draw(P.surveyList, "zach", {});
  world.mail.length = 0;
  seen.sendBeforeRemind = await draw(P.surveySend, "zach", { surveyId: before });
  seen.remindTest = await call("zach", R.surveyTest.POST, { surveyId: before }, { body: { email: "reminder" } });
  seen.remindWrongCount = await call("zach", R.surveyRemind.POST, { surveyId: before }, { body: { emails: 0 } });
  world.mail.length = 0;
  seen.reminded = await call("zach", R.surveyRemind.POST, { surveyId: before }, {
    body: { emails: seen.remindWrongCount.body?.emails ?? -1 },
  });
  seen.remindMailSurvey = mailText();
  seen.listAfterRemind = await draw(P.surveyList, "zach", {});

  // ---- D, again. The night's survey emailed to who came: Mon 2 Nov --------------------
  at("2026-11-02T10:00:00Z");
  world.mail.length = 0;
  seen.nightSendPage = await draw(P.surveySend, "zach", { surveyId: night });
  seen.nightTest = await call("zach", R.surveyTest.POST, { surveyId: night }, { body: { email: "survey" } });
  seen.nightWrongCount = await call("zach", R.surveySend.POST, { surveyId: night }, { body: { to: "everyone", emails: 0 } });
  world.mail.length = 0;
  seen.nightSent = await call("zach", R.surveySend.POST, { surveyId: night }, {
    body: { to: "everyone", emails: seen.nightWrongCount.body?.emails ?? -1 },
  });
  seen.nightMail = mailText();
  at("2026-11-02T18:00:00Z");
  const rosaMessage = world.mail.find((each) => each.to === "rosa@example.com");
  const rosaLink = rosaMessage ? renderToStaticMarkup(rosaMessage.react).match(/https:\/\/naisi\.invalid\/survey\/([A-Za-z0-9_-]{43})/) : null;
  seen.rosaAnswers = await call(null, R.answerByLink.POST, {}, {
    body: { token: rosaLink ? rosaLink[1] : null, answers: { q_ev_how: { type: "rating", value: 4 }, q_ev_change: words("More games, fewer speeches.") } },
  });
  seen.nightResults = await draw(P.surveyResults, "zach", { surveyId: night });
  seen.nightAnswered = await draw(P.surveyAnswered, "zach", { surveyId: night });
  seen.surveyTabIris = await draw(P.surveyTab, "iris", { id: EVENT_ID });
  seen.surveyTabSue = await draw(P.surveyTab, "sue", { id: EVENT_ID });
  seen.surveyTabZach = await draw(P.surveyTab, "zach", { id: EVENT_ID });
  seen.checkInAfter = await draw(P.checkInTab, "sue", { id: EVENT_ID });

  // ---- C, last. The before survey closed by hand on Tue 3 Nov, a day early ---------------
  at("2026-11-03T09:00:00Z");
  seen.closed = await call("zach", R.surveyClose.POST, { surveyId: before }, { body: {} });
  seen.lateAnswer = await call(null, R.answerByLink.POST, {}, {
    body: { token: tokenOf(before, "tariq"), answers: { q_c1: choice("o_stage1") } },
  });
  seen.resultsClosed = await draw(P.surveyResults, "zach", { surveyId: before });
  seen.listClosed = await draw(P.surveyList, "zach", {});

  // ---- E. The weeks run; Callum is taken off after Group B's week 2 ------------------
  await upTo("2026-11-11T09:00:00Z");
  seen.overviewBeforeRemove = await overview("claudia");
  seen.callumRemoved = await call("claudia", R.remove.POST, { runId: RUN.agi, uid: "callum" }, { course: true });
  seen.overviewAfterRemove = await overview("claudia");
  seen.peopleMid = await peoplePage("claudia");
  seen.headMid = await head("claudia");

  // The survey at the end: made, tested and sent on Thu 3 Dec.
  await upTo("2026-12-03T09:00:00Z");
  world.mail.length = 0;
  seen.afterMade = await call("zach", R.surveys.POST, {}, {
    body: { roundId: ROUND, programmeId: AGI, stage: "after", closesOn: "2026-12-13" },
  });
  const after = seen.afterMade.body?.survey?.id ?? null;
  seen.afterId = after;
  seen.afterTest = await call("zach", R.surveyTest.POST, { surveyId: after }, { body: { email: "survey" } });
  seen.afterWrongCount = await call("zach", R.surveySend.POST, { surveyId: after }, { body: { to: "everyone", emails: 0 } });
  world.mail.length = 0;
  seen.afterSent = await call("zach", R.surveySend.POST, { surveyId: after }, {
    body: { to: "everyone", emails: seen.afterWrongCount.body?.emails ?? -1 },
  });
  seen.afterMail = mailText().map((message) => message.to).sort();
  seen.answerPageAfter = await draw(P.answerLink, null, { token: tokenOf(after, "tariq") });
  seen.leadAfter = await draw(P.leadSurvey, "claudia", { ...PARAMS, surveyId: after }, { segment: "surveys" });
  await upTo("2026-12-09T20:00:00Z");
  const answerAfter = (uid, answers, extra = {}) => call(null, R.answerByLink.POST, {}, { body: { token: tokenOf(after, uid), answers, ...extra } });
  // Dev skips the first question at the end; Kofi answered nothing at the start.
  seen.afterAnswers = {
    amara: await answerAfter("amara", {
      q_c1: choice("o_stage3"), q_q1: scale(10), q_q3: scale(4), q_c4: scale(6), q_a1: choice("o_towards"),
      q_c7: { type: "lines", values: { l_next: 5, l_contribute: 4 } },
      q_c9: { type: "choices", optionIds: ["o_applied"] },
      q_a5: words("None. It made my plans clearer.", true),
    }),
    bea: await answerAfter("bea", {
      q_c1: choice("o_stage1"), q_q1: scale(9), q_q3: scale(3), q_c4: scale(4), q_a1: choice("o_clarified"),
      q_c7: { type: "lines", values: { l_next: 3 } },
      q_c9: { type: "choices", optionIds: ["o_none"] },
    }),
    dev: await answerAfter("dev", { q_q1: scale(6), q_q3: scale(5), q_c4: scale(5), q_a1: choice("o_sped") }),
    kofi: await answerAfter("kofi", { q_c1: choice("o_stage4"), q_q1: scale(8), q_a5: words("I dropped a module for it.", true) }, { kairos: false }),
  };

  // ---- After the end: Thu 10 Dec ---------------------------------------------------
  await upTo("2026-12-10T12:00:00Z");
  seen.afterClosed = await call("zach", R.surveyClose.POST, { surveyId: after }, { body: {} });
  seen.ruleSet = await call("claudia", R.rule.PUT, PARAMS, { body: { atLeast: 4 } });
  seen.overviewAfterEnd = await overview("claudia");
  seen.peopleAfterEnd = await peoplePage("claudia");
  seen.headAfterEnd = await head("claudia");
  const adminOnly = (await load("app/(app)/admin/(admin-only)/layout.tsx")).default;
  seen.adminOnlyGate = {};
  for (const who of ["zach", "claudia", "sue", "iris", "rahul", "amara", null]) {
    world.user = who === null ? null : sessionFor(who);
    try {
      await adminOnly({ children: null });
      seen.adminOnlyGate[String(who)] = "drawn";
    } catch (err) {
      seen.adminOnlyGate[String(who)] = err?.message === "NEXT_REDIRECT" ? `sent to ${err.to}` : String(err);
    }
  }
  seen.afterResults = await draw(P.surveyResults, "zach", { surveyId: after });
  // The lead's Surveys tab once the survey at the end has closed (L2): each number on it is the one its own page shows.
  seen.leadTab = await draw(P.leadTab, "claudia", PARAMS, { segment: "surveys" });
  seen.leadTabByReviewer = await draw(P.leadTab, "lloyd", PARAMS, { segment: "surveys" });
  // Ratings at the end: each group's facilitators rate its fellows; the lead rates one too.
  const rate = (who, groupId, uid, answers) => call(who, R.ratings.POST, { groupId }, { body: { uid, answers }, course: true });
  seen.ratings = {
    rahulAmara: await rate("rahul", B, "amara", { f2: 5, f5: "strongYes" }),
    sofiaKofi: await rate("sofia", B, "kofi", { f2: 4, f5: "strongYes" }),
    claudiaBea: await rate("claudia", A, "bea", { f5: "yes" }),
    tomDev: await rate("tom", C, "dev", { f5: "maybe" }),
    rahulOwnGroupOnly: await rate("rahul", A, "bea", { f5: "no" }),
  };
  seen.kairos = await draw(P.kairos, "zach", { roundId: ROUND, programmeId: AGI });
  const exportsBeforeKairos = docsUnder("dataExports/").length;
  world.user = sessionFor("zach");
  const kairosFile = await R.kairosExport.POST(
    new Request("https://naisi.invalid/api/kairos/export", { method: "POST", body: JSON.stringify({ roundId: ROUND, programmeId: AGI }) }),
    { params: Promise.resolve({}) },
  );
  seen.kairosFile = { status: kairosFile.status, text: await kairosFile.text() };
  seen.kairosFileRecords = docsUnder("dataExports/").slice(exportsBeforeKairos);
  seen.kairosFileByLead = await call("claudia", R.kairosExport.POST, {}, { body: { roundId: ROUND, programmeId: AGI } });
  const programmeKey = { programme: `${ROUND}.${AGI}` };
  seen.publicNumbersPage = await draw(P.publicNumbers, "zach", {}, { searchParams: programmeKey });
  const [editor] = seen.publicNumbersPage.element ? find(seen.publicNumbersPage.element, "PublicNumbersEditor") : [];
  seen.offer = editor?.props?.offer ?? null;
  seen.term = await draw(P.term, "zach", {});
  world.user = sessionFor("zach");
  const totals = await R.termTotals.GET(new Request("https://naisi.invalid/api/surveys/term/totals"), { params: Promise.resolve({}) });
  seen.termCsv = { status: totals.status, text: await totals.text() };
  seen.coursePageBefore = await lastTerm();
  const quoteIds = (seen.offer?.quotes ?? []).map((quote) => quote.id);
  seen.numbersPublished = await call("zach", R.publicNumbers.POST, {}, {
    body: { roundId: ROUND, programmeId: AGI, numbers: ["recommend", "stage"], quotes: quoteIds.slice(0, 1) },
  });
  seen.numbersByLead = await call("claudia", R.publicNumbers.POST, {}, {
    body: { roundId: ROUND, programmeId: AGI, numbers: ["recommend"], quotes: [] },
  });
  seen.coursePagePublished = await lastTerm();
  seen.takenDown = await call("zach", R.takeDown.POST, {}, { body: { roundId: ROUND, programmeId: AGI } });
  seen.coursePageTakenDown = await lastTerm();

  // Certificates, from the Overview's own section: Fri 11 Dec.
  at("2026-12-11T10:00:00Z");
  world.mail.length = 0;
  seen.certificatesTest = await call("claudia", R.certificatesTest.POST, PARAMS, { body: {} });
  seen.certificatesTestMail = mailText().map((message) => [message.to, message.subject]);
  const owed = seen.certificatesTest.body?.model?.owed ?? { certificates: -1, emails: -1 };
  seen.certificatesWrongCount = await call("claudia", R.certificates.POST, PARAMS, {
    body: { certificates: owed.certificates + 1, emails: owed.emails },
    course: true,
  });
  world.mail.length = 0;
  seen.certificatesSent = await call("claudia", R.certificates.POST, PARAMS, { body: owed, course: true });
  seen.certificatesMail = mailText().map((message) => [message.to, message.subject]);
  seen.overviewCertificates = await overview("claudia");
}

before(tellTheStory);


// ---------------------------------------------------------------------------
// What the story saw, held page against page
// ---------------------------------------------------------------------------

/** The step of the Overview's checklist with this key, as `who` was shown it at one moment. */
const stepOf = (drawn, key) => drawn.getReady?.model?.steps.find((step) => step.key === key) ?? null;
/** The readiness item of Publish's own page with this key. */
const readyItem = (drawn, key) =>
  [...(drawn.readiness?.needed ?? []), ...(drawn.readiness?.worth ?? [])].find((item) => item.key === key) ?? null;
/** "6 hold a place; ..." and the People tab's own counts. */
const peopleSaid = (drawn) => ({ sentence: drawn.view?.sentence ?? null, counts: drawn.view?.counts ?? null });
/** The People tab's rows as `[name, category, group, status kind]`. */
const peopleRows = (drawn) => (drawn.view?.rows ?? []).map((row) => [row.name, row.category, row.group, row.status.kind]);
/** True when every word in `parts` appears in `text`, in this order. */
function inOrder(text, parts) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    assert.ok(at >= 0, `missing, in order: ${JSON.stringify(part)}\nin: ${text.slice(from, from + 600)}`);
    from = at + part.length;
  }
}

describe("A. Before groups go out: the Weeks tab, Get ready for week 1 and Publish's own page say the same about week 1", () => {
  test("a week with no page: the Weeks tab says Empty, the checklist and Publish both send the lead to paste it", () => {
    inOrder(seen.weeksBefore.text, [
      "Week 1 opens to everyone holding a place once it’s marked ready.",
      "Week 1 Empty First session Thu 29 Oct Ready by Thu 22 Oct",
      "Week 2 Empty First session Thu 5 Nov Ready by Thu 29 Oct",
    ]);
    assert.ok(seen.week1Before.text.includes("Week 1 has no page on this run yet: saving its Markdown here makes it."));
    const step = stepOf(seen.overviewBefore, "week-one");
    assert.deepEqual([step.state, step.line, step.link?.label], [
      "todo",
      "Week 1 has no page yet. Paste its Markdown on the Weeks tab, then mark it ready.",
      "Open week 1",
    ]);
    const item = readyItem(seen.publishBefore, "week-one");
    assert.deepEqual([item.state, item.detail, item.link?.label], ["check", step.line, "Open week 1"]);
  });

  test("the paste makes the page: read first, saved as read; Draft on the tab, Mark ready on the checklist and on Publish", () => {
    assert.equal(seen.readW1.status, 200);
    assert.deepEqual(
      [seen.readW1.body.title, seen.readW1.body.blockCount, seen.readW1.body.minted, seen.readW1.body.answers],
      ["How sure are you?", 11, 28, 0],
    );
    assert.deepEqual(seen.pasteW1, { status: 200, body: { saved: true, blockCount: 11, kept: 0, minted: 28, removed: 0, answers: 0 } });
    assert.ok(seen.weeksPasted.text.includes("Week 1 Draft First session Thu 29 Oct Ready by Thu 22 Oct"));
    const step = stepOf(seen.overviewPasted, "week-one");
    const item = readyItem(seen.publishPasted, "week-one");
    const words = "Week 1 isn’t published yet: marking it ready publishes it, and everyone holding a place can open it.";
    assert.deepEqual([step.state, step.line, step.markReady], ["doing", words, { runId: RUN.agi, weekId: "w01" }]);
    assert.deepEqual([item.state, item.detail, item.markReady], ["check", words, { runId: RUN.agi, weekId: "w01" }]);
  });

  test("the preview is the fellow's page and says it is a preview; its time is the one Publish quotes", () => {
    inOrder(seen.previewW1.text, [
      "Week 1 as a fellow reads it. This is a preview: nothing here can be ticked or sent, and nobody’s answers are shown.",
      "How sure are you?",
      "This week 0 of 3 done",
      "In all: About 2 hours",
    ]);
    assert.equal(seen.previewW1.wrote, false, "the preview writes nothing");
    assert.equal(readyItem(seen.publishReady, "week-one").detail, "Its reading takes about 2 hours.");
  });

  test("marked ready: Ready on the tab and the week, Ready on the checklist, written on Publish", () => {
    assert.equal(seen.readyW1.status, 200);
    assert.deepEqual(seen.readyW1.body.week, { weekId: "w01", weekNumber: 1, ready: true, readyAt: "2026-10-26T12:00:00.000Z" });
    assert.ok(seen.weeksReady.text.includes("Week 1 Ready First session Thu 29 Oct Ready by Thu 22 Oct"));
    assert.ok(seen.week1Ready.text.includes("Ready: everyone holding a place can open week 1."));
    const step = stepOf(seen.overviewReady, "week-one");
    assert.deepEqual([step.state, step.line], ["done", "Ready. Weeks 2 to 6 aren’t ready yet."]);
    assert.equal(readyItem(seen.publishReady, "week-one").state, "done");
  });
});

describe("A. The People tab and the checklist count the same people; Remind emails the number on its button", () => {
  test("the lead's People tab and the lead's Overview: 8 holding, 4 coming, 4 not said, 1 gave back, 1 invited, Bea not said when free", () => {
    assert.deepEqual(peopleSaid(seen.peopleLead), {
      sentence: "8 hold a place; 1 gave theirs back.",
      counts: { everyone: 9, coming: 4, "havent-said": 4, "not-said-free": 1, "gave-back": 1, invited: 1 },
    });
    const { places, notSaid } = seen.overviewReady.getReady.model;
    assert.deepEqual(
      [places.held, places.coming, places.haventSaid, places.gaveBack, places.gaveBackRows.map((row) => row.name), notSaid.names],
      [8, 4, 4, 1, ["Nina Petrova"], ["Bea Lindqvist"]],
    );
    assert.equal(places.freed.title, "1 freed place");
  });

  test("an admin reads two more rows on both pages alike: Sana's no and Ines's invitation from another programme's pool", () => {
    assert.deepEqual(peopleSaid(seen.peopleAdmin), {
      sentence: "8 hold a place; 2 gave theirs back.",
      counts: { everyone: 10, coming: 4, "havent-said": 4, "not-said-free": 1, "gave-back": 2, invited: 2 },
    });
    const { places } = seen.overviewAdmin.getReady.model;
    assert.deepEqual([places.held, places.gaveBack, places.freed.title], [8, 2, "2 freed places"]);
  });

  test("placing: 6 of 8 on the checklist and on Publish, and the same two named", () => {
    assert.equal(stepOf(seen.overviewReady, "people").line, "6 of 8 placed. 2 to place.");
    assert.equal(readyItem(seen.publishReady, "placed").detail, "6 of 8. Dev and Tariq have no group yet.");
    assert.equal(stepOf(seen.overviewPlaced, "people").line, "8 of 8 placed.");
    assert.equal(seen.publishPlaced.readiness.ready, true);
  });

  test("Remind 1 person, Emails 1 person, and one email, to Bea", () => {
    assert.deepEqual(seen.remindShown, {
      count: 1,
      label: "Remind 1 person",
      countLine: "Emails 1 person",
      confirm: "Remind Bea to say when they’re free? This emails 1 person.",
    });
    assert.deepEqual(seen.remindFree, { status: 200, body: { emailed: 1, failed: 0, names: ["Bea"] } });
    assert.deepEqual(seen.remindMail.map((message) => [message.to, message.subject]), [
      ["bea@example.com", "Tell us when you’re free for AGI Strategy"],
    ]);
    assert.ok(seen.remindMail[0].text.includes("You can add it on your application until we email your group on Wed 28 Oct."));
  });
});

describe("B. Publish: the number on its button is the emails a press sends, to the people the People tab holds", () => {
  test("the board's count is Publish's preview: 8 people and 4 facilitators' emails (Sofia runs two groups)", () => {
    const { people, facilitators } = seen.previewPlaced.body;
    assert.equal(people.emails, 8);
    assert.deepEqual(people.names.map((each) => each.uid), ["amara", "bea", "callum", "dev", "kofi", "sam", "tariq", "zach"]);
    assert.equal(people.emails, seen.peopleLead.view.counts.everyone - seen.peopleLead.view.counts["gave-back"]);
    assert.deepEqual([facilitators.emails, facilitators.names.map((each) => each.uid)], [4, ["rahul", "sofia", "tom"]]);
    const board = seen.board.body.publish;
    assert.deepEqual([board.emails, board.people, board.facilitators], [12, 8, 4]);
  });

  test("the press sends the lead's two tests, then the 12, each person their own group's day", () => {
    assert.deepEqual(seen.groupsPublished, {
      status: 200,
      body: {
        ok: true,
        report: { people: { sent: 8, held: 0, suppressed: 0 }, facilitators: { sent: 4, held: 0, suppressed: 0 }, alreadyTold: 0, more: 0, failed: [], noAddress: [] },
        unplaced: [],
      },
    });
    assert.deepEqual(seen.publishMail.map((message) => [message.to, message.subject]), [
      ["claudia@example.com", "[TEST] Your AGI Strategy group: Tuesdays at 6pm"],
      ["claudia@example.com", "[TEST] You’re facilitating Group B: Tuesdays at 6pm"],
      ["amara@example.com", "Your AGI Strategy group: Tuesdays at 6pm"],
      ["bea@example.com", "Your AGI Strategy group: Thursdays at 6pm"],
      ["callum@example.com", "Your AGI Strategy group: Tuesdays at 6pm"],
      ["dev@example.com", "Your AGI Strategy group: Wednesdays at 1pm"],
      ["kofi@example.com", "Your AGI Strategy group: Tuesdays at 6pm"],
      ["sam@example.com", "Your AGI Strategy group: Tuesdays at 6pm"],
      ["tariq@example.com", "Your AGI Strategy group: Tuesdays at 6pm"],
      ["zach@example.com", "Your AGI Strategy group: Thursdays at 6pm"],
      ["rahul@example.com", "You’re facilitating Group B: Tuesdays at 6pm"],
      ["sofia@example.com", "You’re facilitating Group B: Tuesdays at 6pm"],
      ["sofia@example.com", "You’re facilitating Group A: Thursdays at 6pm"],
      ["tom@example.com", "You’re facilitating Group C: Wednesdays at 1pm"],
    ]);
  });

  test("after the press the checklist says Published; Publish's own Ready card still reads Ready to publish (L7)", () => {
    assert.equal(stepOf(seen.overviewPublished, "publish").line, "Published Tue 27 Oct, 10am.");
    // Publish's readiness card is built without the run's published stamp
    // (`buildReadiness` never reads `facts.published`), so the page a lead
    // opens from "Publish groups…" after publishing still says it is ready to.
    assert.ok(seen.publishAfter.text.startsWith("People in groups Publish AGI Strategy’s groups Ready? Ready to publish"));
    assert.equal(seen.publishAfter.readiness.ready, true);
  });
});

describe("C. The before survey: Send, Results, Who answered, the download and one person's answers agree", () => {
  test("Send says 8, the wrong number is refused with the right one, and the press emails the 8 the People tab holds", () => {
    assert.ok(seen.sendDraft.text.includes("To 8 people"));
    assert.ok(seen.sendDraft.text.includes("Who Everyone holding a place on AGI Strategy (8)"));
    assert.ok(seen.sendDraft.text.includes("Send yourself a test of this email first. The button waits for it."));
    assert.deepEqual(seen.surveyTested, { status: 200, body: { ok: true, delivery: "sent", recorded: true } });
    assert.ok(seen.sendTested.text.includes("Test sent to you at 9am"));
    assert.deepEqual(seen.testMail.map((message) => [message.to, message.subject, message.kind]), [
      ["zach@example.com", "[TEST] Before you start: 14 questions for AGI Strategy", "course-test"],
    ]);
    assert.deepEqual(seen.sendWrongCount, {
      status: 409,
      body: { error: "Nothing was sent: the number of people this reaches is now 8. Check the list and press again.", emails: 8 },
    });
    assert.deepEqual(seen.surveySent, { status: 200, body: { ok: true, sent: 8, held: 0, suppressed: 0, failed: 0, noAddress: 0 } });
    assert.deepEqual(
      seen.sentMail.map((message) => [message.to, message.kind, message.surface]),
      ["amara", "bea", "callum", "dev", "kofi", "sam", "tariq", "zach"].map((uid) => [`${uid}@example.com`, "notice", "course-survey"]),
    );
    assert.deepEqual(seen.sentPeople, ["amara", "bea", "callum", "dev", "kofi", "sam", "tariq", "zach"]);
    for (const message of seen.sentMail) {
      assert.ok(message.text.includes("It’s confidential: only NAISI’s admins can see who said what, and your facilitators never see it."));
    }
  });

  test("three answers: Results, Who answered and the list all say 3 of 8, and Bea's, sent during Group A's first session, is labelled", () => {
    assert.ok(seen.resultsBefore.text.includes("3 answers from the 8 people it was sent to (38%)."));
    assert.ok(seen.answeredBefore.text.includes("3 of 8 have answered"));
    inOrder(seen.answeredBefore.text, [
      "Amara Okafor Thu 29 Oct, 9am Thu 29 Oct, 7pm Personal link",
      "Bea Lindqvist Thu 29 Oct, 9am Thu 29 Oct, 7pm Personal link After their first session",
      "Dev Patel Thu 29 Oct, 9am Fri 30 Oct, 9am Personal link",
    ]);
    assert.ok(seen.listMid.text.includes("AGI Strategy: before Confidential Fellowship: AGI Strategy 3 of 8 Closes Wed 4 Nov Remind 5 haven’t answered"));
  });

  test("the download with names is recorded first, with its row count, and refused to the lead", () => {
    assert.equal(seen.export.status, 200);
    assert.equal(seen.export.headers["content-disposition"], 'attachment; filename="agi-strategy-before-answers-2026-10-30.csv"');
    assert.equal(seen.export.text.split("\n").filter((line) => line.trim()).length, 1 + 3, "a header and the three who answered");
    assert.deepEqual(
      seen.exportRecords.map(({ kind, actorUid, rowCount, filename, viaImpersonation }) => ({ kind, actorUid, rowCount, filename, viaImpersonation })),
      [{ kind: "survey-answers", actorUid: "zach", rowCount: 3, filename: "agi-strategy-before-answers-2026-10-30.csv", viaImpersonation: false }],
    );
    assert.deepEqual(seen.exportByLead, { status: 403, body: { error: "Only an admin can do this with a survey." } });
  });

  test("one person's answers: the page reads nothing, the press records the opening before it answers, and the lead is refused", () => {
    assert.equal(seen.personPageWrote, 0);
    assert.ok(seen.personPage.text.endsWith("Opening the answers…"));
    assert.equal(seen.personOpened.status, 200);
    assert.equal(seen.personOpened.body.person.name, "Amara Okafor");
    assert.equal(seen.personOpened.body.person.notice, "Only admins can open one person’s answers, and each opening is logged. You opened this at 9am.");
    assert.deepEqual(
      seen.openings.map(({ kind, actorUid, subjectUid, surveyIds }) => ({ kind, actorUid, subjectUid, surveyIds })),
      [{ kind: "survey-answers", actorUid: "zach", subjectUid: "amara", surveyIds: [seen.beforeId, seen.leavingId] }],
    );
    assert.deepEqual(seen.personByLead, { status: 403, body: { error: "Only an admin can do this with a survey." } });
  });

  test("the lead reads the before survey under the programme as the admins' Results count it, never a name, and the survey at the end from when it is sent (L2)", () => {
    // CHANGED ON PURPOSE (L2, made true): this pinned the lead's results page
    // answering "That survey isn’t one of this programme’s." of both surveys,
    // since it read the leaving survey alone. The lead now reads every survey
    // of the programme (`LEAD_READS`, Q49 A), from the first answer: the same
    // counts as the admins' Results, the comments by their words, and nothing
    // that names anybody or opens the admins' own pages.
    inOrder(seen.leadBefore.text, [
      "AGI Strategy: before Totals and comments, never a name, from the first answer. Only the programme’s lead and NAISI’s admins see them; facilitators never do.",
      "3 answers from the 8 people it was sent to (38%).",
      "5. Which best describes you right now? 3 answered, 38% of the 8 it was sent to",
      "8. How well could you explain why some researchers think advanced AI could be catastrophically dangerous, and the main objections? 3 answered, 38% of the 8 it was sent to",
      "14. What do you most want to get out of this programme? 1 wrote something, 13% of the 8 it was sent to Meet people who think about this.",
    ]);
    assert.ok(seen.resultsBefore.text.includes("3 answers from the 8 people it was sent to (38%)."), "the admins' Results count it the same");
    for (const uid of seen.sentPeople) {
      const account = world.db.read(`users/${uid}`);
      assert.doesNotMatch(seen.leadBefore.html, new RegExp(`\\b${uid}\\b`), `the lead's page holds ${uid}'s uid`);
      for (const said of [account.displayName, account.email].filter(Boolean)) {
        assert.ok(!seen.leadBefore.html.includes(said), `the lead's page names ${said}`);
      }
    }
    assert.ok(!seen.leadBefore.html.includes("/admin/surveys/"), "the lead's page links an admins' page");
    assert.equal(
      seen.leadAfter.text,
      "AGI Strategy: after Totals and comments, never a name, from the first answer. Only the programme’s lead and NAISI’s admins see them; facilitators never do. " +
        "No answers yet from the 6 people it was sent to. Compared, person by person, with AGI Strategy: before (3 answers). " +
        "Consent 0 said yes, 0% of the 6 it was sent to: Contact me at 6 and 12 months with a short follow-up survey.",
    );
  });

  test("the lead's Surveys tab, after the end, shows each number its own page shows, links the three pages that had no way in, and names nobody (L2)", () => {
    // Board sv-programme, built for L2. The tab is drawn once the survey at
    // the end has closed; its numbers are held here to the pages that show
    // them already: public numbers (considering it, and C4's averages), the
    // Results of each survey and the Kairos report (net promoter score).
    inOrder(seen.leadTab.text, [
      "What changed 3 answered both the before and the after. Only they are compared. See before and after",
      "Career plans Considering, planning or already doing it 0 → 1 of 2 2 moved up a stage, 0 stayed, 0 moved down.",
      "Confidence and knowledge Explaining the case that advanced AI could be catastrophic, and the main objections 3.0 → 5.0 out of 7 3 of 3 moved up.",
      "Beliefs about AI What people think about AI Beliefs are reported, never targets: the fellowship doesn’t aim to move them one way. See them at the start and the end",
      "This programme’s surveys Results show as answers come in, never with a name.",
      "AGI Strategy: before See results 3 of 8 answered · closed Tue 3 Nov",
      "AGI Strategy: after See results 4 of 6 answered · closed Thu 10 Dec",
      "AGI Strategy: leaving See results 1 of 1 answered · no closing date",
      "Ratings See ratings",
      "What to keep, change and drop See answers",
      "How it went 4 answers How likely are you to recommend this programme to a friend with similar interests? 8.3 Average, out of 10 · 4 answers",
      "Net promoter score +25, from 4 answers: the share at 9 or 10 less the share at 0 to 6.",
      "Did you get what you wanted from it? 4.0 Average, out of 5 · 3 answers",
      "Your facilitators Only you and admins Your facilitators don’t see this. Pass on the gist in your own words, never fellows’ words or the numbers.",
      "In their words 4 answers Did the programme have any negative effect on you or your plans? 2 of 2 I dropped a module for it. None. It made my plans clearer.",
    ]);
    const measure = (id) => seen.offer?.numbers.find((number) => number.id === id)?.figure ?? null;
    assert.deepEqual(measure("stage"), { kind: "pair", start: "0 of 2", end: "1 of 2" }, "public numbers counts considering it the same");
    assert.deepEqual(measure("explain"), { kind: "pair", start: "3.0 out of 7", end: "5.0" }, "public numbers averages C4 the same");
    assert.ok(seen.resultsClosed.text.includes("3 answers from the 8 people it was sent to (38%)."));
    assert.ok(seen.afterResults.text.includes("4 answers from the 6 people it was sent to (67%)."));
    assert.ok(seen.adminLeavingResults.text.includes("1 answer from the 1 person it reached (100%)."));
    assert.ok(seen.kairos.text.includes("Satisfaction Net promoter score +25 n = 4"));
    // The three pages that were reached from nowhere: each survey's results, Ratings and the anonymous form's answers.
    for (const path of [`surveys/${seen.beforeId}`, `surveys/${seen.afterId}`, `surveys/${seen.leavingId}`, "ratings", "anonymous-feedback"]) {
      assert.ok(seen.leadTab.html.includes(`href="/admin/admissions/forms/${ROUND}/programmes/${AGI}/${path}"`), `the tab does not link ${path}`);
    }
    assert.equal(seen.leadTab.wrote, false);
    for (const uid of seen.sentPeople) {
      const account = world.db.read(`users/${uid}`);
      assert.doesNotMatch(seen.leadTab.html, new RegExp(`\\b${uid}\\b`), `the tab holds ${uid}'s uid`);
      for (const said of [account.displayName, account.email].filter(Boolean)) assert.ok(!seen.leadTab.html.includes(said), `the tab names ${said}`);
    }
    assert.equal(
      seen.leadTabByReviewer.text,
      "Only the programme’s lead and admins can open Surveys Surveys shows the totals and comments of the programme’s surveys, so only the programme’s lead or an admin can open it. Go to applications",
    );
  });

  test("and the box at the top of both surveys says so: the lead sees totals and comments, never names (L2)", () => {
    // `confidentialPoints` (src/lib/surveys/words.ts) names the lead on every
    // programme survey, and the lead now reads every programme survey's
    // totals and comments (the test above). The words are sv-privacy's, as
    // approved, unchanged.
    for (const page of [seen.answerPageBefore, seen.answerPageAfter]) {
      assert.ok(
        page.text.includes("Confidential Only NAISI’s admins can see who said what. Claudia sees totals and comments, never names. Rahul and Sofia never see your answers."),
        page.text.slice(0, 400),
      );
    }
  });

  test("closed by hand a day early: an answer after it is refused, and every page says Closed Tue 3 Nov", () => {
    assert.deepEqual(seen.closed, { status: 200, body: { ok: true } });
    assert.deepEqual(seen.lateAnswer, { status: 409, body: { error: "This survey has closed, so it takes no more answers." } });
    assert.ok(seen.resultsClosed.text.includes("AGI Strategy: before Closed Confidential Fellowship: AGI Strategy Closed Tue 3 Nov"));
    assert.ok(seen.resultsClosed.text.includes("3 answers from the 8 people it was sent to (38%)."));
    assert.ok(seen.listClosed.text.includes("Closed 1 AGI Strategy: before Confidential Fellowship: AGI Strategy 3 of 8 Closed Tue 3 Nov Results"));
  });
});

describe("C. After somebody leaves: the survey list's Remind count and the Send tab's disagree (L4)", () => {
  test("the list says Remind 5 haven't answered; the Send tab it opens says 4, its button emails 4, and the press sends 4", () => {
    // Sam left on Sun 1 Nov. The list counts everybody sent it and not
    // answered (`rowOf` in src/lib/surveys/adminView.ts); the Send tab and
    // the press count only people still holding a place (`readSendPlan`).
    assert.ok(seen.listBeforeRemind.text.includes("3 of 8 Closes Wed 4 Nov Remind 5 haven’t answered"));
    inOrder(seen.sendBeforeRemind.text, [
      "3 of 8 have answered. It closes on Wed 4 Nov.",
      "Remind 4 haven’t answered. Nothing goes until you press the button.",
      "To 4 people",
      "Email 4 people",
      "Who Everyone holding a place on AGI Strategy (7)",
    ]);
    assert.deepEqual(seen.remindTest, { status: 200, body: { ok: true, delivery: "sent", recorded: true } });
    assert.deepEqual(seen.remindWrongCount.body.emails, 4);
    assert.deepEqual(seen.reminded, { status: 200, body: { ok: true, sent: 4, held: 0, suppressed: 0, failed: 0, noAddress: 0 } });
    assert.deepEqual(seen.remindMailSurvey.map((message) => message.to), ["callum", "kofi", "tariq", "zach"].map((uid) => `${uid}@example.com`));
    assert.ok(seen.remindMailSurvey.every((message) => message.subject === "A reminder: 14 questions for AGI Strategy, by Wed 4 Nov"));
    // After the press, still 5 on the list.
    assert.ok(seen.listAfterRemind.text.includes("3 of 8 Closes Wed 4 Nov Remind 5 haven’t answered"));
  });
});

describe("C. Sam leaves before Group B first meets: People, the leaving survey and the Overview (L1)", () => {
  test("leaving is accepted, and People lists Sam as Left the programme, under Gave their place back", () => {
    assert.deepEqual(seen.samLeaves, { status: 200, body: { ok: true, feedbackUrl: "" } });
    assert.deepEqual(peopleSaid(seen.peopleSamLeft).sentence, "7 hold a place; 2 gave theirs back.");
    assert.deepEqual(
      peopleRows(seen.peopleSamLeft).find((row) => row[0] === "Sam Whitfield"),
      ["Sam Whitfield", "gave-back", null, "left"],
    );
  });

  test("the leaving survey reaches Sam and counts the answer; the lead reads its totals without a name", () => {
    assert.deepEqual(seen.samAnswersLeaving, { status: 200, body: { ok: true } });
    inOrder(seen.leadLeaving.text, [
      "AGI Strategy: leaving",
      "Totals and comments, never a name, from the first answer. Only the programme’s lead and NAISI’s admins see them; facilitators never do.",
      "1 answer from the 1 person it reached (100%).",
      "Shorter readings in the busy weeks.",
    ]);
    assert.ok(!seen.leadLeaving.html.includes("Sam"), "no name on the lead's page");
    assert.ok(seen.adminLeavingResults.text.includes("1 answer from the 1 person it reached (100%)."));
    assert.equal(seen.facilitatorLeaving.to, "/dashboard");
    assert.equal(seen.reviewerLeaving.text, "Only the programme’s lead and admins read its survey results.");
  });

  test("the Overview says Nobody has left and never shows Sam, the day Sam left or the reason Sam gave", () => {
    // The Overview's people line and its "left" cards count leavers only where
    // a register marked them (`isListed` in src/lib/courses/programmeAttendance.ts),
    // and Group B had not met. People names the Overview as the one reader of a
    // leaver's reason, so "Too much on this term." reaches the lead nowhere.
    assert.ok(seen.overviewSamLeft.text.includes("People 7 taking part Nobody has left."));
    assert.ok(!seen.overviewSamLeft.text.includes("Sam"));
    assert.ok(!seen.overviewSamLeft.text.includes("Too much on this term."));
    // Later in the term the same Overview counts Callum, taken off after a
    // register marked Callum, and never Sam.
    assert.ok(seen.overviewAfterRemove.text.includes("Callum Price left on Wed 11 Nov Callum’s off Group B’s register from week 3."));
    assert.ok(seen.overviewAfterRemove.text.includes("People 6 taking part 1 left."));
    assert.ok(!seen.overviewAfterEnd.text.includes("Sam"));
  });

  test("People says 3 gave their place back after Callum is taken off: Nina gave a place back, Sam left, Callum was taken off (L6)", () => {
    assert.deepEqual(peopleSaid(seen.peopleMid), {
      sentence: "6 hold a place; 3 gave theirs back.",
      counts: { everyone: 9, coming: 3, "havent-said": 3, "not-said-free": 1, "gave-back": 3, invited: 1 },
    });
    assert.deepEqual(
      (seen.peopleMid.view.rows ?? []).filter((row) => row.category === "gave-back").map((row) => [row.name, row.status]),
      [
        ["Callum Price", { kind: "left", on: "Wed 11 Nov", by: "staff" }],
        ["Nina Petrova", { kind: "gave-back", reason: "The times don’t work for me", on: "Fri 23 Oct" }],
        ["Sam Whitfield", { kind: "left", on: "Sun 1 Nov", by: "themselves" }],
      ],
    );
  });
});

describe("D. VR games night: Check-in, the organiser's tab and the night's survey agree on who came", () => {
  test("the door code is SU-recognised committee's and admins', never the organiser's", () => {
    assert.deepEqual(seen.doorCodeByIris, { status: 403, body: { error: "Only admins and SU-recognised committee members run check-in." } });
    assert.deepEqual(seen.doorCode, { status: 201, body: { made: true, slug: "vr-in", active: true } });
    assert.deepEqual(seen.irisTicks.status, 403);
    assert.equal(seen.doorIris.to, `/events/manage/${EVENT_ID}`);
  });

  test("six came: three sign-ups and three walk-ins, on Sue's Check-in tab and as counts alone on Iris's", () => {
    const counts = "6 came 3 of 4 who signed up, and 3 walk-ins 1 checked themselves in With the QR code at the door 2 at the door list Plus the 3 walk-ins 1 still to come";
    assert.ok(seen.checkInSue.text.includes(counts));
    assert.ok(seen.checkInIris.text.includes(counts));
    assert.ok(seen.checkInIris.text.endsWith("Only NAISI’s admins and the committee members the Students’ Union recognises see who came, as they see who signed up."));
    for (const name of ["Kofi", "Gwen", "Wren", "Rosa", "Dan", "Mo Rahman", "Chloe"]) assert.ok(!seen.checkInIris.html.includes(name), name);
    inOrder(seen.checkInSue.text, [
      "KA Kofi Asante QR at the door 2:05pm",
      "GP Gwen Price Door list 2:10pm",
      "WH Wren Hale Door list 2:10pm",
      "DF Dan Fitzgerald No email Walk-in 2:10pm",
      "MR Mo Rahman No email Walk-in 2:10pm",
      "RM Rosa Martinez Email kept for the survey until Sun 8 Nov Walk-in 2:10pm",
      "Still to come 1 CN Chloe Nguyen",
    ]);
    assert.ok(seen.checkInAfter.text.includes("Didn’t come 1 CN Chloe Nguyen"));
  });

  test("Mo checked in with the code, signed in: Check-in says No email and Walk-in; the survey counts Mo as a walk-in who left an email and emails Mo (L5)", () => {
    assert.deepEqual(seen.moSelf.status, 201);
    // Check-in draws "No email" under every walk-in with no stored address
    // (`view` in src/lib/events/checkInView.ts, `WhoCame`), an account
    // included, and leaves a code check-in by an account out of "checked
    // themselves in" (`byQr` counts sign-ups only).
    assert.ok(seen.checkInSue.text.includes("MR Mo Rahman No email Walk-in 2:10pm"));
    // The survey reads the account's address (src/lib/surveys/events/audience.ts)
    // and words Mo as a walk-in who left one.
    assert.ok(seen.nightSendPage.text.includes("Everyone who came, with an email: 5 3 who signed up and checked in, and 2 walk-ins who left an email"));
    assert.ok(seen.nightMail.some((message) => message.to === "mo@example.com"));
  });

  test("Sign-ups says 3 and the survey's Everyone who signed up says 3; Check-in says of 4, counting Wren, let in from the waiting list (L9)", () => {
    assert.ok(seen.checkInSue.text.includes("Details Sign-ups 3 Check-in"));
    assert.ok(seen.nightSendPage.text.includes("Everyone who signed up: 3"));
    assert.ok(seen.checkInSue.text.includes("6 came 3 of 4 who signed up"));
  });

  test("the survey closes at 11:59pm a week on, while a walk-in's email and Add someone who came end at the event's hour that day (L8)", () => {
    // `walkInEmailGoesAt` (src/lib/events/checkIns.ts) keeps whichever comes
    // first, and a survey closing on its day at 11:59pm never does, so
    // Check-in never says "Until the survey closes" and the emails go first.
    assert.equal(seen.rosaWalkIn.body.row.checkIn.emailGoesAt, "2026-11-08T17:00:00.000Z");
    assert.ok(seen.nightSendPage.text.includes("Closes Sun 8 Nov, 23:59"));
    assert.ok(seen.checkInAfter.text.includes("Who came 6 Until Sun 8 Nov, a week after the event Add someone who came"));
  });

  test("the night's survey: opened at the event, Kofi answers signed in, the email skips Kofi and goes to the 4 the page names", () => {
    assert.deepEqual(seen.openedAtEvent, { status: 200, body: { ok: true } });
    assert.deepEqual(seen.kofiAnswersNight, { status: 200, body: { ok: true } });
    inOrder(seen.nightSendPage.text, [
      "1 person already answered at the event while signed in, so they won’t get the email. Emails 4 people.",
      "Up since Sun 1 Nov, 4:30pm · 1 answer",
      "To 4 people",
      "Email 4 people",
      "Results Admins only. Iris, the organiser, sees how many came, not the results.",
    ]);
    assert.deepEqual(seen.nightWrongCount.body.emails, 4);
    assert.deepEqual(seen.nightSent, { status: 200, body: { ok: true, sent: 4, held: 0, suppressed: 0, failed: 0, noAddress: 0 } });
    assert.deepEqual(seen.nightMail.map((message) => [message.to, message.kind, message.surface]), [
      ["gwen@example.com", "notice", "event-survey"],
      ["mo@example.com", "notice", "event-survey"],
      ["rosa@example.com", "notice", "event-survey"],
      ["wren@example.com", "notice", "event-survey"],
    ]);
    assert.deepEqual(seen.rosaAnswers, { status: 200, body: { ok: true } });
  });

  test("Results and Who answered say what Check-in says: 6 came, 3 who signed up and 3 walk-ins; 2 answers", () => {
    inOrder(seen.nightResults.text, [
      "2 Answers 1 with the QR code, 1 by email",
      "6 Came 3 who signed up, 3 walk-ins",
      "1 of 4 Answered the email Sent Mon 2 Nov, 10am",
      "Mean 4.5",
      "More games, fewer speeches.",
      "Who sees this Admins only. Iris, the organiser, sees how many came, not the results: send Iris the summary.",
    ]);
    assert.ok(seen.nightAnswered.text.includes("2 have answered: 1 with the QR code before any email, and 1 of the 4 it was emailed to"));
  });

  test("the organiser and SU-recognised committee read that it went and when, never its results; an admin reads them on the same tab", () => {
    const went = "The survey after After VR games night: Zach emailed it to 4 people on Mon 2 Nov at 10am. Results go to admins. Ask Zach for the summary.";
    assert.ok(seen.surveyTabIris.text.endsWith(went));
    // SU-recognised committee run check-in, so while the survey takes answers
    // the tab gives them its code to show at the event, and nothing more.
    assert.ok(
      seen.surveyTabSue.text.endsWith(`${went} At the event: the QR code naisi.invalid/q/vr-survey Download PNG Show full screen`),
    );
    assert.ok(
      seen.surveyTabZach.text.includes(
        `${went} Open the survey At the event: the QR code naisi.invalid/q/vr-survey Download PNG Show full screen 2 Answers 1 with the QR code, 1 by email 6 Came`,
      ),
    );
    for (const drawn of [seen.surveyTabIris, seen.surveyTabSue]) assert.ok(!drawn.text.includes("More games"));
  });
});

describe("E. The term's end: registers, Who finished, the head, the Kairos report and This term in numbers count the same people", () => {
  test("every register typed and finished by its facilitator, for the people taking part that week", () => {
    assert.equal(seen.registers.length, 18);
    assert.ok(seen.registers.every(([, , saved, pushed]) => saved === 200 && pushed === 200), JSON.stringify(seen.registers));
    assert.deepEqual(
      seen.registers.filter(([tag]) => tag === "B").map(([, week, , , people]) => [week, people]),
      [
        [1, "amara callum kofi tariq"],
        [2, "amara callum kofi tariq"],
        [3, "amara kofi tariq"],
        [4, "amara kofi tariq"],
        [5, "amara kofi tariq"],
        [6, "amara kofi tariq"],
      ],
    );
  });

  test("Who finished: 5 finished and 1 not, of the 6 who stayed; the head says 6 stayed to the end", () => {
    inOrder(seen.overviewAfterEnd.text, [
      "Who finished We’ve ticked everyone who came to at least 4 of 6 sessions.",
      "5 finished · 1 not",
      "TM Tariq Mensah Missed weeks 2, 3 and 4 Group B 3 of 6",
      "DP Dev Patel Missed weeks 5 and 6 Group C 4 of 6",
      "BL Bea Lindqvist Missed week 5 Group A 5 of 6",
      "KA Kofi Asante Excused in week 2 Group B 5 of 6",
      "AO Amara Okafor Group B 6 of 6",
      "ZL Zach Levin Group A 6 of 6",
      "Left the programme CP Callum Price Group B Left Wed 11 Nov",
    ]);
    assert.ok(seen.overviewAfterEnd.text.includes("People 6 taking part 1 left."));
    assert.ok(seen.headAfterEnd.includes("Finished · Wed 9 Dec C Lead: Claudia · 6 stayed to the end"));
    assert.ok(seen.headAfterEnd.includes("People 6"));
  });

  test("the head says 7, then 6, taking part as the Overview does; in 3 groups, beside a Groups tab that says 4 (L10)", () => {
    assert.ok(seen.headSamLeft.includes("Running · week 1 of 6 C Lead: Claudia · 7 taking part in 3 groups"));
    assert.ok(seen.overviewSamLeft.text.includes("People 7 taking part"));
    assert.ok(seen.headMid.includes("Running · week 2 of 6 C Lead: Claudia · 6 taking part in 3 groups"));
    assert.ok(seen.overviewAfterRemove.text.includes("People 6 taking part"));
    // The tab's count is the form's planned number of groups (`groupCount`).
    for (const strip of [seen.headSamLeft, seen.headMid, seen.headAfterEnd]) assert.ok(strip.includes("Groups 4"), strip);
    assert.equal(stepOf(seen.overviewReady, "times").line, "3 groups: Tue 6pm, Wed 1pm, Thu 6pm");
  });

  test("the Kairos report's funnel is the Overview's: 7 started (Callum among them, Sam not), 5 finished", () => {
    inOrder(seen.kairos.text, [
      "Started 7 88% of the 8 who applied",
      "Finished 5 71% of the 7 who started",
      "Before the programme 3 answers n = 3 · 43% of the 7 who started · sent to 8",
      "At the end 4 answers n = 4 · 57% of the 7 who started · sent to 6",
      "Satisfaction Net promoter score +25 n = 4",
    ]);
  });

  test("This term in numbers says the same 7 and 5, the night's 6 and 2 answers, and the after survey's 4 of 6, page and file alike", () => {
    inOrder(seen.term.text, [
      "Autumn 2026 · 1 event and 2 programmes",
      "6 Check-ins At 1 event 6 Different people 0 Came to 2 or more",
      "Sun 1 Nov VR games night 6 2 4.5",
      "AGI Strategy Fellowship 7 5 3 1 → 1 of 3 Closed Thu 10 Dec: 4 of 6",
    ]);
    assert.equal(seen.termCsv.status, 200);
    assert.ok(seen.termCsv.text.includes("Sun 1 Nov,VR games night,6,2,4.5,"));
    assert.ok(seen.termCsv.text.includes("AGI Strategy Fellowship,7,5,3,1,1,Closed Thu 10 Dec: 4 of 6"));
    // The after survey's own Results say the same 4 of 6.
    assert.ok(seen.afterResults.text.includes("4 answers from the 6 people it was sent to (67%)."));
    assert.deepEqual(seen.afterMail, ["amara", "bea", "dev", "kofi", "tariq", "zach"].map((uid) => `${uid}@example.com`));
  });
});

describe("E. Kairos: the ratings at the end, a no said on the survey's form, the report and the file agree", () => {
  test("each group's facilitators rate its fellows and the lead rates one; a facilitator is refused another group's", () => {
    for (const key of ["rahulAmara", "sofiaKofi", "claudiaBea", "tomDev"]) assert.equal(seen.ratings[key].status, 200, key);
    assert.deepEqual(seen.ratings.rahulOwnGroupOnly, { status: 403, body: { error: "You can rate the fellows of a group you facilitate." } });
  });

  test("the report: 2 strong yes of the 4 rated, of the 6 on it at the end; 1 of the 2 sharing, Kofi having said no", () => {
    assert.ok(seen.kairos.text.includes("Rated strong yes for a more demanding next step 2 of 4 (50%) n = 4 rated of the 6 on it at the end"));
    assert.ok(seen.kairos.text.includes("Of those, sharing their details with Kairos 1 of 2 (50%) n = 2"));
    assert.deepEqual(seen.afterAnswers.kofi, { status: 200, body: { ok: true } });
  });

  test("the file: one row for each of the 6 on it at the end who did not say no (Kofi left out), the same marks Who finished shows", () => {
    assert.equal(seen.kairosFile.status, 200);
    assert.deepEqual(seen.kairosFile.text.trim().split("\n"), [
      "Name,Programme,Sessions attended,Of,Finished,Ratings,Engagement (1 to 5),Grasp (1 to 5),Drive (1 to 5),Next step",
      "Amara Okafor,AGI Strategy,6,6,Yes,1,5,,,Strong yes",
      "Bea Lindqvist,AGI Strategy,5,6,Yes,1,,,,Yes",
      "Dev Patel,AGI Strategy,4,6,Yes,1,,,,Maybe",
      "Tariq Mensah,AGI Strategy,3,6,No,0,,,,",
      "Zach Levin,AGI Strategy,6,6,Yes,0,,,,",
    ]);
    assert.deepEqual(
      seen.kairosFileRecords.map(({ kind, actorUid, rowCount, filename }) => ({ kind, actorUid, rowCount, filename })),
      [{ kind: "kairos", actorUid: "zach", rowCount: 5, filename: "kairos-agi-strategy-2026-12-10.csv" }],
    );
    assert.deepEqual(seen.kairosFileByLead, { status: 403, body: { error: "Only an admin can download the Kairos file." } });
  });
});

describe("E. Considering, planning or already doing it: four pages, two answers (L3)", () => {
  test("Results pair by the question: 2 who answered it both times, both moved up", () => {
    assert.ok(seen.afterResults.text.includes("Before and now Of the 2 who answered it both times (AGI Strategy: before): 2 moved up, 0 stayed, 0 moved down."));
  });

  test("public numbers and the Kairos report pair by the question too: 0 of 2 at the start, 1 of 2 at the end", () => {
    const stage = seen.offer.numbers.find((number) => number.id === "stage");
    assert.deepEqual([stage.figure, stage.base], [{ kind: "pair", start: "0 of 2", end: "1 of 2" }, "From the 2 who answered both"]);
    assert.ok(seen.kairos.text.includes("Moved up at least one stage, start to end 2 of 2 (100%) n = 2"));
  });

  test("This term in numbers pairs by the surveys and counts Dev's skipped question as not considering: 1 → 1 of 3", () => {
    // Dev was considering it at the start and skipped the question at the end
    // (every question can be skipped). `programmeRow` in
    // src/lib/surveys/term/model.ts counts a missing stage as below the line,
    // so the term page says nobody crossed it while the three pages above say
    // one of two did.
    assert.ok(seen.term.text.includes("AGI Strategy Fellowship 7 5 3 1 → 1 of 3"));
  });
});

describe("E. Public numbers: published by an admin alone, shown on the course page, taken down", () => {
  test("nothing on the course page until published; then the two numbers and the one quote picked, with their base; gone once taken down", () => {
    assert.equal(seen.coursePageBefore, null);
    assert.deepEqual(seen.numbersPublished, { status: 200, body: { ok: true } });
    assert.deepEqual(seen.numbersByLead, { status: 403, body: { error: "Only an admin can do this with a survey." } });
    assert.equal(
      seen.coursePagePublished.text,
      "Last term How autumn 2026 went. 2 of 4 fellows would recommend it 0 of 2 at the start 1 of 2 at the end Considering, planning or already doing work on AI safety “I dropped a module for it.” Autumn 2026 fellow From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end, 3 of them at the start too.",
    );
    assert.deepEqual(seen.takenDown, { status: 200, body: { ok: true } });
    assert.equal(seen.coursePageTakenDown, null);
  });

  test("the offer's numbers are the Results' and the Kairos report's: 2 of 4 would recommend (+25), 3 of them answered both", () => {
    const recommend = seen.offer.numbers.find((number) => number.id === "recommend");
    assert.deepEqual([recommend.figure.value, recommend.base], ["2 of 4", "From 4 answers, counting 9 or 10 out of 10"]);
    assert.equal(seen.offer.footer, "From the fellowship’s own surveys, autumn 2026: 4 of 6 fellows answered at the end, 3 of them at the start too.");
    assert.deepEqual(seen.offer.quotes.map((quote) => quote.text).sort(), ["I dropped a module for it.", "None. It made my plans clearer."]);
  });
});

describe("E. Certificates: the count on the button is what a press sends", () => {
  test("5 who finished and 3 facilitators; a wrong number is refused; the press sends 8, and the button then has none left", () => {
    const model = seen.certificatesTest.body.model;
    assert.deepEqual([model.counts, model.button, model.emailsLine], [
      "5 people who finished and 3 facilitators.",
      "Send 8 certificates",
      "Emails 8 people. Each email links to their certificate page.",
    ]);
    assert.deepEqual(seen.certificatesTestMail, [["claudia@example.com", "[TEST] Your certificate for AGI Strategy"]]);
    assert.equal(seen.certificatesWrongCount.status, 409);
    assert.deepEqual(seen.certificatesSent.body.report, { sent: 8, held: 0, suppressed: 0, failed: [], noAddress: [] });
    assert.deepEqual(
      seen.certificatesMail.map(([to]) => to),
      ["amara", "bea", "dev", "kofi", "rahul", "sofia", "tom", "zach"].map((uid) => `${uid}@example.com`),
    );
    assert.equal(seen.certificatesSent.body.model.allSent, "Everybody who finished and every facilitator has been sent theirs.");
  });
});

describe("Readers: every admin page refuses whoever the policy does not name", () => {
  test("the admin-only tree draws for an admin and sends the lead, SU-recognised committee, the organiser, a facilitator, a member and a visitor away", () => {
    assert.deepEqual(seen.adminOnlyGate, {
      zach: "drawn",
      claudia: "sent to /dashboard",
      sue: "sent to /dashboard",
      iris: "sent to /dashboard",
      rahul: "sent to /dashboard",
      amara: "sent to /dashboard",
      null: "sent to /dashboard",
    });
  });
});
