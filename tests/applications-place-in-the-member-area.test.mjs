/**
 * Home and the list of a member's programmes (`/learn`) state no outcome,
 * and tell nobody who holds a place that they are on nothing.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * Both pages say "not on a programme yet" to a member with no run. Decision
 * day gives somebody a place, and they have no run until they are put on
 * one, so of them the sentence is untrue. What became of an application is
 * said in two places only, the person's own page and the list of their
 * applications (`docs/applications.md`, "One set of words for an outcome"):
 * a summary page is a third place the words could come to disagree, and
 * nobody should learn a decision from one. So both pages ask one thing,
 * whether the member holds a place, and do one thing with the answer. Six
 * things have to hold:
 *
 *  1. THE ANSWER IS YES EXACTLY WHEN THE PERSON'S OWN PAGE IS THE PAGE OF
 *     SOMEBODY WITH A PLACE. Every way an application can stand is stored and
 *     asked about: not a stored status with no result behind it, not an
 *     invitation nobody has answered, not a place given back. What cannot be
 *     read is "could not tell", and never "no".
 *  2. NEITHER PAGE STATES AN OUTCOME. Both pages are run for real against
 *     each of those applications and drawn to HTML. What each draws carries
 *     none of the words the person's own page uses for that outcome, no
 *     programme's name and no programme's id.
 *  3. EACH IS ONE OF TWO PAGES, AND NOTHING ELSE. The page of a member known
 *     to hold no place, which reads as it always has, and the page of
 *     everybody else, which leaves the sentence out and has the way to the
 *     member's applications on it. Which programme, how the place was come
 *     by and whether its email went change nothing in what is drawn.
 *  4. A PLACE AND A PLACE THAT COULD NOT BE READ ARE DRAWN ALIKE, so an admin
 *     viewing the site as a member is told nothing either way.
 *  5. THE TWO COMPONENTS, on their own: Home says the sentence only when it
 *     is handed that the member holds no place, and the list of programmes
 *     draws what it is handed where its empty state would be, and not beside
 *     a live run.
 *  6. THE SOURCE. The pages hand the session's own uid to one function, which
 *     asks the reader behind "Your application", and nothing in them looks
 *     at an application. No file of these pages imports the words for an
 *     outcome. And nowhere in the tree is somebody told they are on nothing
 *     by a file that has not asked about a place first.
 *
 * Who is asked and what is read (the member, an admin viewing the site as
 * them, another member, an unpublished decision) is held in
 * `tests/applications-view-as-own-application.test.mjs`.
 *
 * Real: the two server pages, the function they ask, the loaders behind the
 * person's own page and the list of their applications, the view-as module,
 * Home's form for a member, the list of programmes and the applications
 * card. Stubbed: `server-only`, `next/server`, `next/headers`,
 * `next/navigation`, `next/link`, the sentinels `firebase-admin/firestore`
 * supplies, the session, the Admin SDK handle
 * (`tests/lib/applicationsStore.mjs`), the hook that lists a member's runs
 * (it returns what a test sets), the public term, the admin's Home, the two
 * Home forms for somebody on a run, and the parts of Home that are not about
 * an application (the term, the events, the profile and task cards, the
 * install invitation), each of which draws a mark with its name. So are a
 * run's card, the page's entrance wrapper and the stylesheets.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  INCUBATOR,
  ROUND,
  ROUND_LABEL,
  TAIS,
  WHILE_OPEN,
  applicationDoc,
  applicationPath,
  roundDoc,
  seedTerm,
} from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const world = {
  h: createElement,
  runs: { runs: [], loading: false, error: null },
  db: null,
  user: null,
  cookie: null,
  touched: [],
};
globalThis.__memberArea = world;

const h = "globalThis.__memberArea.h";
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
/** A piece of the page that is not about an application: it draws a mark with its name. */
const MARK = (name) => `export default function ${name}() { return ${h}("div", null, "[${name}]"); }`;
/** One of Home's forms for somebody on a run: its name, and what it is handed about applications. */
const RUN_FORM = (name) =>
  `export default function ${name}({ applications, more }) { return ${h}("div", null, "[${name}]", applications, more); }`;

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export class NextResponse {\n" +
        "  constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; }\n" +
        "  static json(body, init) { return new NextResponse(body, init); }\n" +
        "}",
    ],
    [
      // The cookie jar of one request: the view-as marker is the one cookie in it.
      "next/headers",
      "export async function cookies() {\n" +
        "  const w = globalThis.__memberArea;\n" +
        "  return {\n" +
        "    get: (name) => (w.cookie === null ? undefined : { name, value: w.cookie }),\n" +
        "    set: (name, value) => { w.cookie = value; },\n" +
        "    delete: () => { w.cookie = null; },\n" +
        "  };\n" +
        "}",
    ],
    [
      "next/navigation",
      "export function redirect(to) { throw new Error('redirect to ' + to); }\n" +
        "export function notFound() { throw new Error('not found'); }",
    ],
    ["next/link", `export default ({ href, className, children }) => ${h}("a", { href, className }, children);`],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__memberArea.db; }"],
    [
      "@/lib/firebase/session",
      "export async function getCurrentUser() { return globalThis.__memberArea.user; }\n" +
        "export async function getCurrentCollaborator() { return null; }",
    ],
    // The view-as module's own import of the session, by the name it writes.
    ["./session", "export async function getCurrentUser() { return globalThis.__memberArea.user; }"],
    ["@/features/courses/useMyRuns", "export const useMyRuns = () => globalThis.__memberArea.runs;"],
    ["./useSyncTasks", "export const SyncTasksTrigger = () => null;"],
    ["@/features/tasks/components/MyWorkSummary", MARK("MyWorkSummary")],
    ["./HomeFacilitator", RUN_FORM("HomeFacilitator")],
    ["./HomeProgramme", RUN_FORM("HomeProgramme")],
    ["./HomeAdmin", MARK("HomeAdmin")],
    ["./TermCard", MARK("term")],
    ["./ComingUp", MARK("events")],
    [
      "./HomeAside",
      `export function FinishProfile() { return ${h}("div", null, "[profile]"); }\n` +
        `export function NoApplicationsYet() { return ${h}("div", null, "[nothing yet]"); }`,
    ],
    ["@/features/pwa/InstallCard", `export function InstallCard() { return ${h}("div", null, "[install]"); }`],
    [
      "./homeData",
      "export async function homeEvents() {\n" +
        "  return { upcoming: [], week: { range: null, events: [], startsAt: null, endsAt: null } };\n" +
        "}\n" +
        "export async function profileSteps() { return null; }",
    ],
    [
      // Applications are open, which is when Home says "Nothing yet" to a member who has not applied.
      "@/features/term/fetchPublicTerm",
      "export async function fetchPublicTerm() { return { stage: 'open', closesAt: null, decisionsByDate: null }; }",
    ],
    ["@/features/courses/RunCard", `export default ({ entry }) => ${h}("div", null, "[run " + entry.runId + "]");`],
    ["@/components/motion/PageEnter", `export default ({ children }) => ${h}("div", null, children);`],
    ["./home.module.css", CLASS_NAMES],
    ["./page.module.css", CLASS_NAMES],
    ["./MyCoursesSummary.module.css", CLASS_NAMES],
    ["./YourApplications.module.css", CLASS_NAMES],
    ["./PageHead.module.css", CLASS_NAMES],
    ["./Skeleton.module.css", CLASS_NAMES],
    ["./EmptyState.module.css", CLASS_NAMES],
    ["./Card.module.css", CLASS_NAMES],
    ["./Chip.module.css", CLASS_NAMES],
  ]),
});

const load = await loadTs(join("lib", "applications", "status", "load.ts"));
const words = await loadTs(join("lib", "applications", "status", "words.ts"));
const { holdsPlace } = await loadTs(join("features", "applications", "home", "holdsPlace.ts"));
const { default: YourApplications } = await loadTs(join("features", "applications", "home", "YourApplications.tsx"));
const { default: HomeMember } = await loadTs(join("app", "(app)", "dashboard", "HomeMember.tsx"));
const { default: LearnHub } = await loadTs(join("app", "(app)", "learn", "LearnHub.tsx"));
const { default: DashboardPage } = await loadTs(join("app", "(app)", "dashboard", "page.tsx"));
const { default: LearnPage } = await loadTs(join("app", "(app)", "learn", "page.tsx"));

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// A stored term, and every way one person's application on it can stand
// ---------------------------------------------------------------------------

/** A form whose window no test machine's clock is outside of. */
const ALWAYS_OPEN = { opensAt: new Date("2020-01-01T00:00:00Z"), closesAt: new Date("2099-01-01T00:00:00Z") };
const TOLD_AT = new Date("2026-10-23T11:00:00+01:00");

const result = (kind, programmeId, email = "sent") => ({ kind, programmeId, publishedAt: TOLD_AT, email });
const invitedTo = (programmeId, response) => ({
  result: result("invited", programmeId),
  invitation: { programmeId, replyBy: "2026-10-25", response, respondedAt: response ? TOLD_AT : null, lastReminderOn: null },
});
const reply = (answer) => ({ attendance: { answer, answeredAt: TOLD_AT } });

/** Every status an application can be stored under. None of them is a result. */
const STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "fellowship-offered",
  "waitlisted",
  "rejected",
  "withdrawn",
  "appointed",
  "invited",
  "no-offer",
  "declined",
];

/**
 * EVERY WAY AN APPLICATION CAN STAND, as stored on the person's own
 * document, and whether it is a place they hold. `over` is laid over a sent
 * application that ranked AGI Strategy and then Technical AI Safety.
 */
const WAYS = {
  ...Object.fromEntries(STATUSES.map((status) => [`stored as ${status}, with nothing published`, { held: false, over: { status } }])),
  "a draft nobody has sent": { held: false, draft: true },
  "placed by their own ranking": { held: true, over: { status: "accepted", result: result("accepted", AGI) } },
  "placed on their second choice": { held: true, over: { status: "accepted", result: result("accepted", TAIS) } },
  "placed on an incubator": { held: true, over: { status: "accepted", result: result("accepted", INCUBATOR) } },
  "placed, and the email about it has not gone": { held: true, over: { status: "accepted", result: result("accepted", AGI, "owed") } },
  "placed, and nothing can say whether the email went": {
    held: true,
    over: { status: "accepted", result: result("accepted", AGI, "unconfirmed") },
  },
  "placed, and said they are coming": { held: true, over: { status: "accepted", result: result("accepted", AGI), ...reply("coming") } },
  "placed on a programme the form no longer carries": {
    held: true,
    over: { status: "accepted", result: result("accepted", "left-the-form") },
  },
  "placed, then said they can’t make it": {
    held: false,
    over: { status: "withdrawn", result: result("accepted", AGI), ...reply("cant-make-it") },
  },
  "placed, then withdrawn by somebody else": { held: false, over: { status: "withdrawn", result: result("accepted", AGI) } },
  "invited, not answered": { held: false, over: { status: "invited", ...invitedTo(INCUBATOR, null) } },
  "invited, and accepted": { held: true, over: { status: "accepted", ...invitedTo(INCUBATOR, "accepted") } },
  "invited, and said no thanks": { held: false, over: { status: "withdrawn", ...invitedTo(INCUBATOR, "declined") } },
  "invited, accepted, then can’t make it": {
    held: false,
    over: { status: "withdrawn", ...invitedTo(INCUBATOR, "accepted"), ...reply("cant-make-it") },
  },
  "invited, with no invitation beside it": { held: false, over: { status: "invited", result: result("invited", INCUBATOR) } },
  "no offer": { held: false, over: { status: "no-offer", result: result("no-offer", null) } },
  "every programme declined": { held: false, over: { status: "declined", result: result("declined", null) } },
};
const WAY_NAMES = Object.keys(WAYS);

/** The stored application of one way. */
function stored(way) {
  if (way.draft) return applicationDoc("amara", [AGI, TAIS], { sent: false });
  return { ...applicationDoc("amara", [AGI, TAIS]), ...way.over };
}

/** The store, with `limit` on a query, which the list's loader asks for. */
function withLimit(query) {
  return { ...query, where: (...filter) => withLimit(query.where(...filter)), limit: () => withLimit(query) };
}

/** A term in which Amara's application stands the given way. `fails` names a collection whose reads throw. */
function term(way, { fails = null } = {}) {
  const db = makeDb(seedTerm({ round: ALWAYS_OPEN, over: way ? { [applicationPath("amara")]: stored(way) } : {} }), {
    now: WHILE_OPEN,
  });
  const collection = db.collection;
  db.collection = (name) => {
    world.touched.push(name);
    if (name === fails) throw new Error(`${name} could not be read`);
    return withLimit(collection(name));
  };
  world.db = db;
  world.touched = [];
  return db;
}

/** Who the session says is signed in, and the view-as marker in the request's cookies. */
function signedIn(uid, marker = null) {
  world.user = CAST[uid];
  world.cookie = marker === null ? null : JSON.stringify(marker);
  world.touched = [];
}
const VIEWING = { actorUid: "zach", actorName: "Zach Levin", actorEmail: "zach@example.com", auditId: "audit-1" };
const viewingAs = (uid) => signedIn(uid, VIEWING);

const run = (runId, over = {}) => ({
  runId,
  courseId: "course-1",
  courseTitle: `Course of ${runId}`,
  label: "Autumn 2026",
  academicYear: "2026/27",
  status: "running",
  roles: ["learner"],
  membership: "enrolled",
  archived: false,
  currentWeek: null,
  groupName: null,
  ...over,
});
const runsAre = (runs, more = {}) => {
  world.runs = { runs, loading: false, error: null, ...more };
};

/** The two pages, run on the server and drawn, for whoever is signed in. */
async function drawn() {
  const home = renderToStaticMarkup(await DashboardPage());
  const learn = renderToStaticMarkup(await LearnPage());
  return { home, learn, homeText: textOf(home), learnText: textOf(learn) };
}

// ---------------------------------------------------------------------------
// The two pages each page can be
// ---------------------------------------------------------------------------

const NOT_ON_A_PROGRAMME = "You’re not on a programme yet.";
/** Home's card for somebody who has applied: the name of each application, and no more. */
const APPLICATIONS_CARD = `Your applications View all → ${ROUND_LABEL} Open`;
/** The same card when it names nothing: the way to the list. */
const WAY_TO_APPLICATIONS = "Your applications View all → Everything you have applied to, and where each one has got to.";

const HOME = {
  /** A member the page knows holds no place: as Home has always read. */
  noPlace: `Hi Amara. ${NOT_ON_A_PROGRAMME} [install] [term] [events] ${APPLICATIONS_CARD} [profile] [MyWorkSummary]`,
  /** Everybody else: the sentence is left out, and nothing is put in its place. */
  other: `Hi Amara. [install] [term] [events] ${APPLICATIONS_CARD} [profile] [MyWorkSummary]`,
  /** The applications could not be read at all: the card names nothing. */
  unread: `Hi Amara. [install] [term] [events] ${WAY_TO_APPLICATIONS} [profile] [MyWorkSummary]`,
};

const HUB_HEAD =
  "Courses Your courses Every fellowship and reading group you're on: the week your cohort is on, the materials for it, " +
  "and the exercises you owe. A course can show here before your group is set.";
const HUB_EMPTY =
  "You're not on a course yet NAISI runs fellowships and reading groups each term. The catalogue lists what's open and what's coming. Browse courses";
const LEARN = {
  noPlace: `${HUB_HEAD} ${HUB_EMPTY}`,
  other: `${HUB_HEAD} ${WAY_TO_APPLICATIONS}`,
};

/** Every name and id a programme on the form goes by. None belongs on either page. */
const PROGRAMMES = Object.entries(roundDoc().programmes).flatMap(([id, programme]) => [id, programme.name, programme.shortName]);

/**
 * Words for an outcome that neither page has any other reason to print. The
 * bare words place and offered are on it: the list of programmes used to
 * speak, to everybody, of "a place you've been offered", and now says only
 * that a course can show there before somebody's group is set.
 */
const OUTCOME_WORDS =
  /you[’']re in\b|accepted|invit|\bplaces?\b|offered|can[’']t offer|given back|no thanks|turned down|can[’']t make it|waitlist|declin|reject|withdr[ae]w|unsuccessful|congratulations/i;

/** What the person's own page says of this application: its chip, its title, and what comes next. */
async function saidOnTheirOwnPage(uid) {
  const loaded = await load.loadStatus(world.db, ROUND, uid, new Date());
  if (!loaded) return { kind: "none", said: [] };
  const outcome = words.outcomeWords(loaded.view);
  const list = words.listWordsFor(loaded.view);
  const said = [outcome?.chip, outcome?.title, list?.sentence, loaded.view.next, loaded.view.programme?.name, loaded.view.programme?.shortName];
  return { kind: loaded.view.kind, said: said.filter((text) => typeof text === "string" && text.trim() !== "") };
}

// ---------------------------------------------------------------------------
// 1. The answer
// ---------------------------------------------------------------------------

describe("whether a member holds a place", () => {
  test("it is yes exactly when their own page is the page of somebody with a place", async () => {
    for (const name of WAY_NAMES) {
      term(WAYS[name]);
      signedIn("amara");
      const own = await saidOnTheirOwnPage("amara");
      assert.equal(await holdsPlace("amara"), WAYS[name].held ? "yes" : "no", name);
      assert.equal(own.kind === "place", WAYS[name].held, `${name}: their own page is the ${own.kind} page`);
    }
    // The table runs both answers, and more than one of each.
    const answers = Object.values(WAYS).map((way) => way.held);
    assert.ok(answers.filter(Boolean).length >= 7 && answers.filter((held) => !held).length >= 18);
  });

  test("no stored status is a place while nothing is published onto the application", async () => {
    for (const status of STATUSES) {
      term({ over: { status } });
      signedIn("amara");
      assert.equal(await holdsPlace("amara"), "no", `status ${status} with no result reads as a place`);
    }
  });

  test("somebody who has not applied holds none, and neither does anybody asked about no round", async () => {
    term(null);
    signedIn("nina");
    assert.equal(await holdsPlace("nina"), "no");
    term(WAYS["placed by their own ranking"]);
    signedIn("amara");
    assert.equal(await holdsPlace("amara", []), "no", "a page that listed no application asks about none");
    assert.equal(await holdsPlace("amara", [ROUND]), "yes");
    assert.equal(await holdsPlace("amara", ["older-round", "no-such-round"]), "no", "a round that is not an application form counts for nothing");
  });

  test("what cannot be read is could not tell, and never no", async (t) => {
    // The function says what it could not read. That is its to say, and not this run's to print.
    t.mock.method(console, "warn", () => {});
    term(WAYS["placed by their own ranking"]);
    signedIn("amara");
    world.db = null;
    assert.equal(await holdsPlace("amara"), "unknown", "with no database");
    for (const fails of ["admissionApplications", "admissionRounds"]) {
      term(WAYS["no offer"], { fails });
      signedIn("amara");
      assert.equal(await holdsPlace("amara", [ROUND]), "unknown", `when ${fails} cannot be read`);
    }
  });

  test("in a view-as session it is could not tell, for somebody with a place and for somebody without, and nothing is read", async () => {
    for (const name of ["placed by their own ranking", "no offer"]) {
      term(WAYS[name]);
      viewingAs("amara");
      assert.equal(await holdsPlace("amara"), "unknown", name);
      assert.deepEqual(world.touched, [], `${name}: something was read`);
    }
  });

  test("the answer is one of three words and carries nothing else", async () => {
    term(WAYS["placed on an incubator"]);
    signedIn("amara");
    const answer = await holdsPlace("amara");
    assert.equal(typeof answer, "string");
    assert.ok(["yes", "no", "unknown"].includes(answer));
    assert.equal(await load.loadHoldsPlace(world.db, "amara", [ROUND], new Date()), true, "the loader's answer is one bit");
  });
});

// ---------------------------------------------------------------------------
// 2, 3 and 4. What the two pages draw
// ---------------------------------------------------------------------------

describe("neither page states an outcome, however the application stands", () => {
  test("the two pages are drawn, and each is the page this file says it is", async () => {
    runsAre([]);
    term(WAYS["stored as submitted, with nothing published"]);
    signedIn("amara");
    const waiting = await drawn();
    assert.equal(waiting.homeText, HOME.noPlace);
    assert.equal(waiting.learnText, LEARN.noPlace);
    term(WAYS["placed by their own ranking"]);
    signedIn("amara");
    const placed = await drawn();
    assert.equal(placed.homeText, HOME.other);
    assert.equal(placed.learnText, LEARN.other);
  });

  for (const name of WAY_NAMES) {
    test(`${name}: no word of the outcome, and no programme, on Home or on the list of programmes`, async () => {
      runsAre([]);
      term(WAYS[name]);
      signedIn("amara");
      const own = await saidOnTheirOwnPage("amara");
      signedIn("amara");
      const pages = await drawn();
      for (const [page, html, text] of [["Home", pages.home, pages.homeText], ["the list of programmes", pages.learn, pages.learnText]]) {
        for (const said of own.said) {
          assert.ok(!text.includes(said), `${page} says what their own page says: ${said}`);
        }
        for (const programme of PROGRAMMES) {
          assert.ok(!html.includes(programme), `${page} carries a programme: ${programme}`);
        }
        assert.doesNotMatch(text, OUTCOME_WORDS, `${page} carries a word for an outcome`);
      }
      // One of two pages, to the character, and which one follows from one bit.
      assert.equal(pages.homeText, WAYS[name].held ? HOME.other : HOME.noPlace);
      assert.equal(pages.learnText, WAYS[name].held ? LEARN.other : LEARN.noPlace);
    });
  }

  test("the words this file looks for are the ones the person's own page uses, so the search is not empty", async () => {
    const seen = new Set();
    for (const name of WAY_NAMES) {
      term(WAYS[name]);
      signedIn("amara");
      for (const said of (await saidOnTheirOwnPage("amara")).said) seen.add(said);
    }
    for (const said of [
      "Accepted",
      "You’re in AGI Strategy.",
      "You’re in Research incubator.",
      "We’ll email you before you start with how the first week works.",
      "Invitation",
      "You’re invited to Research incubator.",
      "Place given back",
      "No place this term",
      "AGI Strategy Fellowship",
    ]) {
      assert.ok(seen.has(said), `their own page no longer says: ${said}`);
    }
    for (const said of seen) assert.match(said, /\p{L}{2}/u);
    // And the fixed list of words catches each of those pages' chips and titles.
    for (const said of ["Accepted", "You’re in AGI Strategy.", "Invitation", "Place given back", "No place this term", "You said no thanks to Research incubator."]) {
      assert.match(said, OUTCOME_WORDS);
    }
    assert.doesNotMatch(`${HOME.noPlace} ${HOME.other} ${HOME.unread} ${LEARN.noPlace} ${LEARN.other}`, OUTCOME_WORDS);
  });

  test("every page drawn for a place is the same page, to the byte, whichever programme and however it was come by", async () => {
    runsAre([]);
    const held = WAY_NAMES.filter((name) => WAYS[name].held);
    const pages = [];
    for (const name of held) {
      term(WAYS[name]);
      signedIn("amara");
      pages.push(await drawn());
    }
    for (const [index, page] of pages.entries()) {
      assert.equal(page.home, pages[0].home, `Home differs for: ${held[index]}`);
      assert.equal(page.learn, pages[0].learn, `the list of programmes differs for: ${held[index]}`);
    }
  });

  test("and every page drawn for no place is the same page, whatever the application came to", async () => {
    runsAre([]);
    const none = WAY_NAMES.filter((name) => !WAYS[name].held);
    const pages = [];
    for (const name of none) {
      term(WAYS[name]);
      signedIn("amara");
      pages.push(await drawn());
    }
    for (const [index, page] of pages.entries()) {
      assert.equal(page.home, pages[0].home, `Home differs for: ${none[index]}`);
      assert.equal(page.learn, pages[0].learn, `the list of programmes differs for: ${none[index]}`);
    }
  });

  test("somebody who has not applied reads what they always have", async () => {
    runsAre([]);
    term(null);
    signedIn("nina");
    const pages = await drawn();
    assert.equal(pages.homeText, `Hi Nina. ${NOT_ON_A_PROGRAMME} [install] [term] [events] [nothing yet] [profile] [MyWorkSummary]`);
    assert.equal(pages.learnText, LEARN.noPlace);
  });

  test("with a place, the way to their applications is on each page, and is the only thing there about them", async () => {
    runsAre([]);
    term(WAYS["placed on an incubator"]);
    signedIn("amara");
    const pages = await drawn();
    const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(hrefs(pages.home), ["/applications", `/applications/${ROUND}`]);
    assert.deepEqual(hrefs(pages.learn), ["/applications"]);
  });
});

describe("a place and a place that could not be read are drawn alike", () => {
  test("in a view-as session both pages are the same, to the byte, for every way the member's application can stand", async () => {
    runsAre([]);
    const pages = [];
    for (const name of WAY_NAMES) {
      term(WAYS[name]);
      viewingAs("amara");
      pages.push(await drawn());
      assert.deepEqual(
        world.touched.filter((collection) => collection.startsWith("admissionApplication")),
        [],
        `${name}: an application was read in a view-as session`,
      );
    }
    for (const [index, page] of pages.entries()) {
      assert.equal(page.home, pages[0].home, `Home differs for: ${WAY_NAMES[index]}`);
      assert.equal(page.learn, pages[0].learn, `the list of programmes differs for: ${WAY_NAMES[index]}`);
    }
    assert.equal(pages[0].homeText, HOME.unread);
    assert.equal(pages[0].learnText, LEARN.other);
  });

  test("the list of programmes of somebody with a place is the page an admin viewing as anybody is shown", async () => {
    runsAre([]);
    term(WAYS["placed by their own ranking"]);
    signedIn("amara");
    const hers = await drawn();
    term(WAYS["no offer"]);
    viewingAs("amara");
    const borrowed = await drawn();
    assert.equal(hers.learn, borrowed.learn);
  });

  test("when the applications cannot be read, neither page says the member is on nothing, and neither names anything", async (t) => {
    t.mock.method(console, "warn", () => {});
    runsAre([]);
    for (const name of ["placed by their own ranking", "no offer"]) {
      term(WAYS[name], { fails: "admissionApplications" });
      signedIn("amara");
      const pages = await drawn();
      assert.equal(pages.homeText, HOME.unread, name);
      assert.equal(pages.learnText, LEARN.other, name);
    }
  });

  test("when the form cannot be read, neither page says the member is on nothing either", async (t) => {
    t.mock.method(console, "warn", () => {});
    runsAre([]);
    // The list of applications is read first, and reads the form too: so this
    // is the list failing, and the card names nothing.
    term(WAYS["placed by their own ranking"], { fails: "admissionRounds" });
    signedIn("amara");
    const pages = await drawn();
    assert.equal(pages.homeText, HOME.unread);
    assert.equal(pages.learnText, LEARN.other);
  });
});

// ---------------------------------------------------------------------------
// 5. The two components, on their own
// ---------------------------------------------------------------------------

const slot = (name) => createElement("div", null, `[${name}]`);

function home({ holdsNoPlace = true } = {}) {
  return textOf(
    renderToStaticMarkup(
      createElement(HomeMember, {
        given: "Chloe",
        invite: slot("install"),
        termCard: slot("term"),
        comingUpRows: slot("events"),
        comingUpCards: slot("event cards"),
        applications: slot("applications"),
        nothingYet: null,
        holdsNoPlace,
        finishProfile: slot("profile"),
      }),
    ),
  );
}

describe("Home, for a member on no run", () => {
  test("handed that the member holds no place, it reads as it always has", () => {
    runsAre([]);
    assert.equal(home(), `Hi Chloe. ${NOT_ON_A_PROGRAMME} [install] [term] [events] [applications] [profile] [MyWorkSummary]`);
  });

  test("otherwise the sentence is left out, and nothing is put in its place", () => {
    runsAre([]);
    assert.equal(home({ holdsNoPlace: false }), "Hi Chloe. [install] [term] [events] [applications] [profile] [MyWorkSummary]");
  });

  test("somebody who may hold a place is never told they are on no programme, whatever runs they have had", () => {
    for (const runs of [[], [run("old", { archived: true })], [run("offer", { roles: [], membership: "offered" })]]) {
      runsAre(runs);
      assert.ok(!home({ holdsNoPlace: false }).includes(NOT_ON_A_PROGRAMME), JSON.stringify(runs.map((entry) => entry.runId)));
    }
  });

  test("the claim still waits for the runs, and is still left out when they could not be read or the member is involved", () => {
    runsAre([], { loading: true });
    assert.ok(!home().includes(NOT_ON_A_PROGRAMME), "said while the runs are loading");
    runsAre([], { error: new Error("could not load") });
    assert.ok(!home().includes(NOT_ON_A_PROGRAMME), "said when the runs could not be read");
    runsAre([run("led", { roles: ["lead"], membership: "none" })]);
    assert.ok(!home().includes(NOT_ON_A_PROGRAMME), "said to somebody who leads a programme");
  });

  test("it takes nothing about a place but that one answer", () => {
    const code = stripSource(readFileSync(join(SRC, "app", "(app)", "dashboard", "HomeMember.tsx"), "utf8"), { keepStrings: true });
    const slots = code.slice(code.indexOf("type Slots = {"), code.indexOf("};", code.indexOf("type Slots = {")));
    assert.deepEqual(
      [...slots.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]),
      ["given", "invite", "termCard", "comingUpRows", "comingUpCards", "applications", "nothingYet", "holdsNoPlace", "finishProfile"],
    );
    assert.match(slots, /holdsNoPlace: boolean;/);
  });
});

describe("Home, for a member on a live run", () => {
  test("the run's own Home is drawn, whatever was answered about a place", () => {
    for (const holdsNoPlace of [true, false]) {
      runsAre([run("live")]);
      const learner = home({ holdsNoPlace });
      assert.ok(learner.startsWith("[HomeProgramme]"), learner);
      runsAre([run("led", { roles: ["facilitator"] })]);
      const facilitator = home({ holdsNoPlace });
      assert.ok(facilitator.startsWith("[HomeFacilitator]"), facilitator);
      assert.ok(!learner.includes(NOT_ON_A_PROGRAMME) && !facilitator.includes(NOT_ON_A_PROGRAMME));
    }
  });
});

const hub = (instead = null) => textOf(renderToStaticMarkup(createElement(LearnHub, { instead })));
/** What the page hands the hub for everybody but a member known to hold no place. */
const wayIn = createElement(YourApplications, { rows: null });

describe("the list of programmes", () => {
  test("with no run, handed nothing, it reads as it always has", () => {
    runsAre([]);
    assert.equal(hub(), LEARN.noPlace);
  });

  test("with no run, the way to the member's applications stands where the empty state would", () => {
    runsAre([]);
    assert.equal(hub(wayIn), LEARN.other);
  });

  test("with only archived runs, it is above them, and no claim is made", () => {
    runsAre([run("old", { archived: true })]);
    const text = hub(wayIn);
    assert.ok(text.startsWith(`${HUB_HEAD} ${WAY_TO_APPLICATIONS} Archived `), text);
    assert.ok(text.endsWith("[run old]"));
    assert.ok(!text.includes("not on a course yet"));
  });

  test("with only archived runs, handed nothing, it reads as it always has", () => {
    runsAre([run("old", { archived: true })]);
    const text = hub();
    assert.ok(text.startsWith(`${HUB_HEAD} Archived `), text);
    assert.ok(text.endsWith("[run old]"));
  });

  test("on a live run the run's own card speaks, and what was handed in is not drawn", () => {
    runsAre([run("live"), run("old", { archived: true })]);
    const text = hub(wayIn);
    assert.ok(text.startsWith(`${HUB_HEAD} [run live] Archived `), text);
    assert.ok(!text.includes("Your applications"));
  });

  test("while the runs are loading, or could not be read, nothing is said about applications or about being on nothing", () => {
    for (const state of [{ loading: true }, { error: new Error("Your account is still pending.") }]) {
      runsAre([], state);
      const text = hub(wayIn);
      assert.ok(!text.includes("not on a course yet") && !text.includes("Your applications"), text);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The source
// ---------------------------------------------------------------------------

const codeOf = (...parts) => stripSource(readFileSync(join(SRC, ...parts), "utf8"), { keepStrings: true }).replace(/\s+/g, " ");

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry.name)) yield path;
  }
}
const inRepo = (file) => relative(REPO_ROOT, file).split(sep).join("/");

describe("the pages ask one function, and it asks the reader behind the person's own page", () => {
  const DASHBOARD = codeOf("app", "(app)", "dashboard", "page.tsx");
  const LEARN_PAGE = codeOf("app", "(app)", "learn", "page.tsx");
  const ASKED = codeOf("features", "applications", "home", "holdsPlace.ts");
  const LOAD = codeOf("lib", "applications", "status", "load.ts");

  test("neither page looks at what became of an application", () => {
    for (const [name, page] of [["the dashboard", DASHBOARD], ["the list of programmes", LEARN_PAGE]]) {
      assert.ok(!/row\.application\b|\.status\b|\.result\b|\.invitation\b|\.attendance\b|standingOf|statusViewFor/.test(page), `${name} reads an application itself`);
      assert.ok(!/admissionDecisions|staffRepo|decisionDay/.test(page), `${name} reaches a decision`);
    }
  });

  test("each page uses the answer for one thing: whether it is a no", () => {
    assert.ok(DASHBOARD.includes("user && applications ? holdsPlace(user.uid, applications.map((row) => row.roundId)) : COULD_NOT_TELL,"));
    assert.ok(DASHBOARD.includes('const COULD_NOT_TELL: HoldsPlace = "unknown";'));
    assert.ok(DASHBOARD.includes('holdsNoPlace={held === "no"}'));
    assert.equal(DASHBOARD.split("held").length - 1, 2, "the dashboard uses the answer somewhere else");
    assert.ok(
      LEARN_PAGE.includes(
        'const held = user ? await holdsPlace(user.uid) : "unknown"; return <LearnHub instead={held === "no" ? null : <YourApplications rows={null} />} />;',
      ),
    );
    assert.equal(LEARN_PAGE.split("held").length - 1, 2, "the list of programmes uses the answer somewhere else");
  });

  test("the one function reads the list of applications and the page's own read, and answers in three words", () => {
    assert.ok(ASKED.includes('export type HoldsPlace = "yes" | "no" | "unknown";'));
    assert.ok(ASKED.includes("const roundIds = appliedTo ?? (await loadStatusRows(db, uid, now)).map((row) => row.round.id);"));
    assert.ok(ASKED.includes('return (await loadHoldsPlace(db, uid, roundIds, now)) ? "yes" : "no";'));
    assert.ok(!/\.collection\(|\.doc\(|\.where\(|admissionDecisions|staffRepo|standingOf|\.result\b|\.status\b/.test(ASKED));
    // What it cannot read is "could not tell", never "holds no place".
    assert.ok(ASKED.includes('if (!db) return "unknown";'));
    assert.match(ASKED, /catch \(err\) \{ console\.warn\([^)]*\); return "unknown"; \}/);
    // Every way out of it is one of the three words.
    const body = ASKED.slice(ASKED.indexOf("export async function holdsPlace("));
    assert.deepEqual(
      [...body.matchAll(/return ([^;]+);/g)].map((match) => match[1]),
      ['"unknown"', '"unknown"', '(await loadHoldsPlace(db, uid, roundIds, now)) ? "yes" : "no"', '"unknown"'],
    );
  });

  test("the loader goes through the page's own read, and keeps one bit of it", () => {
    assert.ok(LOAD.includes('const loaded = await loadStatus(db, roundId, uid, now); return loaded !== null && loaded.view.kind === "place";'));
    assert.ok(LOAD.includes("): Promise<boolean> { const held = await Promise.all("));
  });
});

/**
 * THE FILES OF THESE TWO PAGES, AND THE CARDS THEY DRAW ABOUT APPLICATIONS.
 * None of them may import the words for an outcome, or the view they are
 * read from: a file that could not word an outcome cannot state one.
 */
const PAGE_FILES = [
  join(SRC, "app", "(app)", "dashboard"),
  join(SRC, "app", "(app)", "learn", "page.tsx"),
  join(SRC, "app", "(app)", "learn", "LearnHub.tsx"),
  join(SRC, "features", "applications", "home"),
];
/** Where an outcome is worded, or read into words. */
const OUTCOME_MODULES = /applications\/status\/(?:words|view|standing)|applications\/decisionDay\/|features\/applications\/status\//;
/** Functions that word an outcome, whatever they were imported as. */
const OUTCOME_FUNCTIONS = /\b(?:outcomeWords|listWordsFor|loadListWords|statusViewFor|standingOf|placeNextWords|standardSubject|loadStatus)\b/;

describe("no file of these pages can word an outcome", () => {
  const files = PAGE_FILES.flatMap((path) => (/\.tsx?$/.test(path) ? [path] : [...sourceFiles(path)]));

  test("the walk reads the pages' files", () => {
    const names = files.map(inRepo);
    assert.ok(names.length >= 12, `only ${names.length} files were read`);
    for (const expected of [
      "src/app/(app)/dashboard/page.tsx",
      "src/app/(app)/dashboard/HomeMember.tsx",
      "src/app/(app)/learn/page.tsx",
      "src/app/(app)/learn/LearnHub.tsx",
      "src/features/applications/home/YourApplications.tsx",
      "src/features/applications/home/holdsPlace.ts",
    ]) {
      assert.ok(names.includes(expected), `${expected} was not read`);
    }
    assert.match('import { outcomeWords } from "@/lib/applications/status/words";', OUTCOME_MODULES);
    assert.match("const words = outcomeWords(view);", OUTCOME_FUNCTIONS);
  });

  test("none imports the words for an outcome, the view they are read from, or a function that makes them", () => {
    for (const file of files) {
      const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
      const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      assert.deepEqual(imports.filter((from) => OUTCOME_MODULES.test(from)), [], `${inRepo(file)} imports where an outcome is worded`);
      assert.doesNotMatch(code, OUTCOME_FUNCTIONS, `${inRepo(file)} calls a function that words an outcome`);
    }
  });

  test("the one read they share is of one bit, from the loader of the person's own page", () => {
    const asked = files.filter((file) => /applications\/status\/load/.test(readFileSync(file, "utf8")));
    assert.deepEqual(asked.map(inRepo), ["src/features/applications/home/holdsPlace.ts"]);
    assert.ok(codeOf("features", "applications", "home", "holdsPlace.ts").includes('import { loadHoldsPlace } from "@/lib/applications/status/load";'));
  });
});

/**
 * Each sentence that tells a member they are on nothing, the file that types
 * it, and the test of a held place that file makes before it says so.
 */
const ON_NOTHING = {
  "not on a programme yet": {
    "src/app/(app)/dashboard/HomeMember.tsx": {
      asks: "const onNothing = !error && !involved && holdsNoPlace;",
      why: "Home says it only when the server read that the member holds no place",
    },
  },
  "not on a course yet": {
    "src/app/(app)/learn/LearnHub.tsx": {
      asks: "instead ? ( instead ) : ( <EmptyState",
      why: "the list of programmes draws the way to the member's applications in the stead of the empty state, for a place and for one it could not read",
    },
  },
};

describe("nobody is told they are on nothing by a file that has not asked about a place", () => {
  const found = Object.fromEntries(Object.keys(ON_NOTHING).map((phrase) => [phrase, []]));
  let read = 0;
  for (const file of sourceFiles(SRC)) {
    read += 1;
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    for (const phrase of Object.keys(ON_NOTHING)) {
      if (code.includes(phrase)) found[phrase].push(inRepo(file));
    }
  }

  test("the walk read the tree", () => {
    assert.ok(read > 500, `only ${read} source files were read`);
    // A comment about the sentence is not the sentence.
    assert.ok(!stripSource('// "You\'re not on a course yet"\nconst x = 1;', { keepStrings: true }).includes("not on a course yet"));
  });

  for (const [phrase, files] of Object.entries(ON_NOTHING)) {
    test(`"${phrase}" is said only where it is registered, both directions, and only after a place is asked about`, () => {
      const unregistered = found[phrase].filter((file) => !(file in files));
      assert.deepEqual(
        unregistered,
        [],
        `A file tells a member they are "${phrase}" and is not registered. Somebody decision day gave a place has no run yet: ` +
          "ask whether they hold a place first (holdsPlace on the server, one answer handed to the browser), then register the file.",
      );
      assert.deepEqual(Object.keys(files).filter((file) => !found[phrase].includes(file)), [], "a registered file no longer says it: remove it");
      for (const [file, entry] of Object.entries(files)) {
        const code = stripSource(readFileSync(join(REPO_ROOT, ...file.split("/")), "utf8"), { keepStrings: true }).replace(/\s+/g, " ");
        assert.ok(code.includes(entry.asks), `${file} no longer asks about a place before it says so: ${entry.asks}`);
        assert.ok(code.indexOf(entry.asks) < code.indexOf(phrase), `${file} says it before it has asked`);
        assert.ok(String(entry.why).trim().length >= 40, `${file}: the reason is a placeholder.`);
      }
    });
  }
});
