/**
 * AGI Strategy's run in week 3, with weeks written as blocks that hold PACKS,
 * CASES AND TALKS, for the suite about plan item 8 (Q32 A; boards wk-cases,
 * wk-week, wk-week-phone, wk-week6-phone, wk-fac-group, wk-programme): the
 * per-person record, Choose one on the week page, the draw on the group page,
 * Your case study and "Ready for my talk", and This week's work's two columns.
 *
 * Built on `tests/lib/hubAttendanceWorld.mjs` (four groups; Group B on
 * Tuesdays at 6pm with Chloe, Farah and Kofi, Rahul and Sofia facilitating;
 * Group A with Amara, Dev, Bea and Tariq, Sofia facilitating, and Sam, who
 * left; Una placed in Group C and not told; Omar taken off; Claudia leads the
 * programme, Tess another; Yusuf is the run's track lead; Zach is an admin),
 * on the hand-over world's real handlers. On top of it:
 *
 *  - WEEK 2 and WEEK 3 are the foundation's synthetic week (every kind of
 *    block, `tests/lib/weekBlocksFixture.mjs`) with each week's ids made its
 *    own: a Choose one a facilitator gives out ("Pack": Elections, Markets,
 *    Technology), the case study given out with its cases grouped by pack
 *    (Elections: two cases, one with a content note; Markets: one), a Choose
 *    one each person picks (two guides) and a 2-minute pitch each person
 *    marks ready for. Week 1 is week 1's shape, with no pack or case; week 4
 *    is written before blocks.
 *  - Rahul and Sofia hold the facilitator enrolments the facilitators route
 *    writes. FARAH FACILITATES GROUP B TOO, from a place in it: a
 *    facilitator who is a fellow of the group they run (Zach, Mon 26 Oct
 *    2026).
 *
 * THE CLOCK is Tue 17 Nov 2026 at noon in London: Group B meets tonight at
 * 6pm, in week 3. Every word in the weeks is made up for these tests, and
 * every address is on example.com or example.org.
 *
 * Real: the overview route, the person's own pack and talk route, the draw's
 * route, the week page, the group page and the draw page, the programme home
 * and Home's card, and every library under them. Stubbed: what the hand-over
 * world stubs (the session, the Admin SDK handle, the view-as guard, the
 * mail door), Next's navigation and link, the stylesheets, the register's
 * grid and the review queue (client components with suites of their own),
 * and the browser's data hooks, each handed what the real route answered.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./applicationsStore.mjs";
import { walkSource } from "./functionScan.mjs";
import { makeWorld } from "./handoverWorld.mjs";
import { A, B, C, D, NOW, RUN, attendanceSeed, enrolment } from "./hubAttendanceWorld.mjs";
import { syntheticWeekBlocks } from "./weekBlocksFixture.mjs";
import { weekOneBlocks } from "./weekBlocksPageWorld.mjs";

export { A, B, C, D, NOW, RUN };

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

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

/**
 * The synthetic week with every id made the week's own (`w2-`, `w3-`), as a
 * paste mints ids no other week shares: a record is keyed on a block's id
 * across the run, so two weeks must never share one.
 */
export function weekBlocksFor(prefix) {
  const blocks = structuredClone(syntheticWeekBlocks());
  const own = (id) => `${prefix}-${id}`;
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (typeof node.id === "string") node.id = own(node.id);
    if (typeof node.packId === "string") node.packId = own(node.packId);
    if (Array.isArray(node.covers)) node.covers = node.covers.map(own);
    for (const value of Object.values(node)) if (value && typeof value === "object") walk(value);
  };
  walk(blocks);
  return blocks;
}

/** A week document as the loader stores one. */
export function blockWeekDoc(n, title, blocks) {
  return {
    weekNumber: n,
    title,
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks,
  };
}

/** The ids of one week's blocks, by what they are in the synthetic week. */
export function idsOf(prefix) {
  const id = (name) => `${prefix}-${name}`;
  return {
    given: id("co-1"),
    elections: id("pk-1"),
    markets: id("pk-2"),
    technology: id("pk-3"),
    picked: id("co-2"),
    atWork: id("pk-4"),
    inPublic: id("pk-5"),
    caseStudy: id("cs-1"),
    surprise: id("ca-1"),
    closeCall: id("ca-2"),
    crash: id("ca-3"),
    pitch: id("cs-2"),
  };
}

export const W2 = idsOf("w2");
export const W3 = idsOf("w3");

/** The world every suite starts from. `over` adds or replaces whole documents. */
export function packsSeed(over = {}) {
  const seed = attendanceSeed();
  seed[`courseRuns/${RUN.agi}/weeks/w01`] = blockWeekDoc(1, "Who keeps the lamps", weekOneBlocks("k1"));
  seed[`courseRuns/${RUN.agi}/weeks/w02`] = blockWeekDoc(2, "How sure are you?", weekBlocksFor("w2"));
  seed[`courseRuns/${RUN.agi}/weeks/w03`] = blockWeekDoc(3, "How sure are you, again?", weekBlocksFor("w3"));
  // The facilitator enrolments the facilitators route writes for Group B's two.
  for (const uid of ["rahul", "sofia"]) {
    seed[`courseEnrolments/${RUN.agi}__${uid}`] = enrolment(uid, null, { role: "facilitator", allocatedEmailAt: null });
  }
  // Farah facilitates Group B, the group Farah takes part in.
  const groupB = seed[`courseGroups/${B}`];
  seed[`courseGroups/${B}`] = { ...groupB, facilitatorUids: [...groupB.facilitatorUids, "farah"] };
  return { ...seed, ...over };
}

/** A stylesheet, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

function stylesheets() {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found];
}

/** The words of a page: markup gone, entities read, space folded. */
export function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<\/?(?:strong|em|a)(?:\s[^>]*)?>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function makePacksAndCasesWorld(key = "__packsAndCases") {
  const ui = {
    h: createElement,
    overview: null,
    roster: null,
    weekDocs: {},
    progress: new Map(),
    ownRows: new Map(),
    ownRowsLoaded: true,
    authUser: null,
    summary: null,
    hydrated: false,
  };
  const handle = `globalThis[${JSON.stringify(key)}].ui`;
  const quiet = (name) => `export default function ${name}() { return ${handle}.h('span', { 'data-stub': '${name}' }, '[${name}]'); }`;
  const useWeekStub =
    "export function useWeek(runId, weekId, canSeeUnpublished) {\n" +
    `  if (!weekId) return { status: 'loading', week: null, forked: false, error: null };\n` +
    `  const week = ${handle}.weekDocs[weekId] ?? null;\n` +
    "  if (!week) return { status: 'missing', week: null, forked: false, error: null };\n" +
    "  if (!week.published && !canSeeUnpublished) return { status: 'unpublished', week: null, forked: false, error: null };\n" +
    "  return { status: 'ready', week, forked: false, error: null };\n" +
    "}\nexport default useWeek;";
  const overviewStub = `export function useRunOverview() { return { data: ${handle}.overview, error: null, loading: false, reload() {} }; }\nexport default useRunOverview;`;
  const made = makeWorld(key, [
    ["firebase-admin/firestore", FIRESTORE],
    ["./session", `export async function getCurrentUser() { return globalThis[${JSON.stringify(key)}].user; }`],
    ["@/lib/rateLimit", "export function rateLimit() { return { ok: true, retryAfterSeconds: 0 }; }\nexport function clientIp() { return '10.0.0.1'; }"],
    [
      "next/navigation",
      "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
        "export function notFound() { throw new Error('NEXT_NOT_FOUND'); }\n" +
        "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }\n" +
        "export function usePathname() { return '/learn'; }\n" +
        "export function useSelectedLayoutSegment() { return null; }\n" +
        "export function useSearchParams() { return new URLSearchParams(); }",
    ],
    [
      "next/link",
      "export default ({ href, className, children, scroll, prefetch, onClick, ...rest }) =>\n" +
        `  ${handle}.h('a', { href, className, ...rest }, children);`,
    ],
    // False, as the server's markup is, unless a suite says the page has hydrated.
    ["@/hooks/useHydrated", `export function useHydrated() { return ${handle}.hydrated === true; }`],
    ["./useRunOverview", overviewStub],
    ["@/features/courses/useRunOverview", overviewStub],
    ["./useSyncTasks", "export function useSyncTasks() {}"],
    ["@/features/courses/useRunProgress", `export function useRunProgress() { return { byItemId: ${handle}.progress, loading: false, error: null }; }`],
    ["./useWeek", useWeekStub],
    ["../useWeek", useWeekStub],
    ["@/features/courses/useWeek", useWeekStub],
    ["../useGroupRoster", `export function useGroupRoster() { return ${handle}.roster; }`],
    // Home reads the group's roster itself, once, for its group card and the last week's survey card.
    ["@/features/courses/useGroupRoster", `export function useGroupRoster() { return ${handle}.roster; }`],
    [
      "./useMyExercises",
      `export function useMyExercises(runId) { const on = Boolean(runId); return { loading: false, loaded: on && ${handle}.ownRowsLoaded, byExerciseId: on ? ${handle}.ownRows : new Map(), error: null, reload() {}, apply() {} }; }`,
    ],
    [
      "./useWeekComments",
      "export function useWeekComments() { return { byItemId: new Map(), loaded: false, loading: false, error: null, load() {}, reload() {} }; }",
    ],
    ["./updates/RunUpdates", quiet("RunUpdates")],
    ["./FacilitatorGroupPanel", quiet("FacilitatorGroupPanel")],
    ["./ExerciseSubmit", quiet("ExerciseSubmit")],
    ["@/features/courses/AttendanceGrid", quiet("AttendanceGrid")],
    ["@/features/courses/ReviewQueue", quiet("ReviewQueue")],
    [
      "@/features/courses/facilitator/useFacilitatorSummary",
      `export function useFacilitatorSummary() { return { data: ${handle}.summary, error: null, loading: false }; }\nexport default useFacilitatorSummary;`,
    ],
    ["@/components/motion/PageEnter", `export default function PageEnter({ className, children }) { return ${handle}.h('div', { className }, children); }`],
    [
      "@/components/ui/ActionToast",
      "export default function ActionToast() { return null; }\n" +
        "export function useActionToast() { return { toast: null, dismiss() {}, run: async (fn) => { try { await fn(); } catch {} } }; }",
    ],
    ["@/auth/AuthProvider", `export function useAuth() { return { user: ${handle}.authUser, loading: false }; }`],
    [
      "@/lib/firebase/client",
      "export function getClientDb() { return { browser: true }; }\nexport function getClientAuth() { return {}; }\n" +
        "export function getFirebaseApp() { throw new Error('no client SDK here'); }\nexport function getClientStorage() { throw new Error('no client SDK here'); }",
    ],
    [
      "firebase/firestore",
      "export function doc(db, ...segments) { return { path: segments.join('/') }; }\n" +
        "export async function getDoc(ref) { return { exists: () => false, data: () => undefined, id: ref.path }; }\n" +
        "export async function setDoc() {}\n" +
        "export function serverTimestamp() { return 'serverTimestamp()'; }\n" +
        "export function collection() { return {}; }\nexport function query() { return {}; }\nexport function where() { return {}; }\n" +
        "export function onSnapshot() { return () => {}; }",
    ],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]);
  made.world.ui = ui;
  const { world, call, courseRoute, loadTs } = made;

  const routes = {
    overview: await courseRoute("runs", "[runId]", "overview"),
    me: await courseRoute("me"),
    myExercises: await courseRoute("runs", "[runId]", "my-exercises"),
    mine: await courseRoute("runs", "[runId]", "packs-and-cases", "[blockId]"),
    draw: await courseRoute("groups", "[groupId]", "draw"),
  };
  const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
  const pages = {
    week: (await loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default,
    group: (await loadTs(join(GROUP, "page.tsx"))).default,
    draw: (await loadTs(join("app", "(app)", "learn", "draw", "[groupId]", "page.tsx"))).default,
  };
  const components = {
    RunHome: (await loadTs(join("features", "courses", "RunHome.tsx"))).default,
    WeekView: (await loadTs(join("features", "courses", "WeekView.tsx"))).default,
    HomeProgramme: (await loadTs(join("app", "(app)", "dashboard", "HomeProgramme.tsx"))).default,
  };
  const lib = {
    courses: await loadTs(join("lib", "firestore", "courses.ts")),
    record: await loadTs(join("lib", "firestore", "coursePacksAndCases.ts")),
    model: await loadTs(join("lib", "courses", "packsAndCases", "model.ts")),
    words: await loadTs(join("lib", "courses", "packsAndCases", "words.ts")),
    readers: await loadTs(join("lib", "courses", "packsAndCases", "readers.ts")),
    progress: await loadTs(join("lib", "courses", "weekBlocks", "progress.ts")),
    accountDeletion: await loadTs(join("lib", "firestore", "accountDeletion.ts")),
    courseDeletion: await loadTs(join("lib", "firestore", "courseDeletion.ts")),
  };

  /** Move every clock the routes and the store read. */
  function at(when) {
    mock.timers.setTime(new Date(when).getTime());
  }

  function reset(seed = packsSeed()) {
    at(NOW);
    made.reset(seed, { now: () => new Date() });
    ui.overview = null;
    ui.roster = null;
    ui.weekDocs = {};
    ui.progress = new Map();
    ui.ownRows = new Map();
    ui.ownRowsLoaded = true;
    ui.authUser = null;
    ui.summary = null;
    ui.hydrated = false;
    for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  }

  /** The session a page is handed: the stored account, with the reviewer flag the roles writer keeps. */
  function sessionFor(uid) {
    const base = made.sessionOf(uid);
    if (!base) return null;
    return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
  }

  const overview = (who) => call(who, routes.overview.GET, { runId: RUN.agi }, { course: true });

  /** `who` picks a pack, or marks a talk ready, through their own route. */
  const pick = (who, blockId, weekId, packId, options = {}) =>
    call(who, routes.mine.PUT, { runId: RUN.agi, blockId }, { course: true, body: { weekId, packId }, ...options });
  const markReady = (who, blockId, weekId, ready, options = {}) =>
    call(who, routes.mine.PUT, { runId: RUN.agi, blockId }, { course: true, body: { weekId, ready }, ...options });

  /** A record as stored, or null. */
  const recordOf = (uid, blockId) => world.db.read(`coursePacksAndCases/${RUN.agi}__${uid}__${blockId}`) ?? null;
  /** Every record's path, sorted. */
  const records = () => world.db.paths().filter((path) => path.startsWith("coursePacksAndCases/")).sort();

  /** The draw as a facilitator would leave it, written straight to the store. */
  function seedDraw(uid, weekPrefix, { pack = null, caseId = null, ready = false } = {}) {
    const ids = idsOf(weekPrefix);
    const weekNumber = Number(weekPrefix.slice(1));
    const base = { runId: RUN.agi, uid, weekId: `w0${weekNumber}`, weekNumber };
    if (pack) {
      world.db.seed(`coursePacksAndCases/${RUN.agi}__${uid}__${ids.given}`, { ...base, blockId: ids.given, kind: "pack", packId: pack, givenAt: NOW });
    }
    if (caseId || ready) {
      world.db.seed(`coursePacksAndCases/${RUN.agi}__${uid}__${ids.caseStudy}`, { ...base, blockId: ids.caseStudy, kind: "talk", caseId, ready, givenAt: NOW });
    }
  }

  function weekDocsAsStored() {
    const docs = {};
    for (let n = 1; n <= 6; n += 1) {
      const id = `w0${n}`;
      const stored = world.db.read(`courseRuns/${RUN.agi}/weeks/${id}`);
      if (stored) docs[id] = lib.courses.normalizeCourseWeek(id, stored);
    }
    return docs;
  }

  /** Everything the browser would hold for `who` on week `n`. */
  async function asBrowser(who, n, ticked = []) {
    const answer = await overview(who);
    ui.overview = answer.status === 200 ? answer.body : null;
    ui.weekDocs = weekDocsAsStored();
    ui.authUser = who ? { uid: who } : null;
    ui.roster = { group: null, facilitators: [], members: [], loading: false, error: null };
    // The person's own rows for the week, as the my-exercises route answers them.
    ui.ownRows = new Map();
    if (who) {
      world.user = made.sessionOf(who);
      world.course = true;
      try {
        const response = await routes.myExercises.GET(new Request(`https://naisi.invalid/api?week=${n}`), {
          params: Promise.resolve({ runId: RUN.agi }),
        });
        if (response.status === 200) ui.ownRows = new Map(response.body.responses.map((row) => [row.exerciseId, row]));
      } finally {
        world.course = false;
      }
    }
    ui.progress = new Map(ticked.map((id) => [id, { id, itemId: id, itemKind: "material", completed: true, weekNumber: n }]));
    return answer;
  }

  /** The week page's server shell as `who`. */
  async function weekShell(who, n) {
    world.user = sessionFor(who);
    world.course = true;
    try {
      const element = await pages.week({ params: Promise.resolve({ runId: RUN.agi, n: String(n) }) });
      return { element, props: element?.props ?? null, to: null };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, props: null, to: err.to };
    } finally {
      world.course = false;
    }
  }

  /** A week's page as `who` reads it. */
  async function weekPage(who, n, ticked = []) {
    const shell = await weekShell(who, n);
    if (!shell.props) return { html: "", text: "", shell };
    await asBrowser(who, n, ticked);
    const html = renderToStaticMarkup(createElement(components.WeekView, shell.props));
    return { html, text: textOf(html), shell };
  }

  /** The programme home as `who` sees it. */
  async function programmeHome(who, ticked = []) {
    await asBrowser(who, 3, ticked);
    const html = renderToStaticMarkup(
      createElement(components.RunHome, { runId: RUN.agi, isAdmin: who === "zach", canEmailCohort: false, pitching: null, canLeave: false, uid: who }),
    );
    return { html, text: textOf(html) };
  }

  /** Home's card for the run, as `who` sees it. */
  async function homeCard(who, ticked = []) {
    await asBrowser(who, 3, ticked);
    const runs = (await call(who, routes.me.GET, {}, { course: true })).body?.runs ?? [];
    const entry = runs.find((row) => row.runId === RUN.agi);
    if (!entry) return null;
    const html = renderToStaticMarkup(
      createElement(components.HomeProgramme, { given: "Chloe", invite: null, entry, comingUp: null, applications: null, more: null }),
    );
    return { html, text: textOf(html) };
  }

  /** A server page as `who`: its HTML and words, or where it sent them. */
  async function draw(Page, who, params, searchParams = {}) {
    world.user = who === null ? null : sessionFor(who);
    world.course = true;
    try {
      const element = await Page({ params: Promise.resolve(params), searchParams: Promise.resolve(searchParams) });
      const html = renderToStaticMarkup(element);
      return { element, html, text: textOf(html), to: null };
    } catch (err) {
      if (err?.message !== "NEXT_REDIRECT") throw err;
      return { element: null, html: "", text: "", to: err.to };
    } finally {
      world.course = false;
    }
  }

  /** The group page as `who`. */
  const groupPage = (who, groupId = B) => draw(pages.group, who, { runId: RUN.agi, groupId });

  /** The draw page as `who`, for `week` (or the group's next session's week). */
  const drawPage = (who, groupId = B, week = undefined) => draw(pages.draw, who, { groupId }, week === undefined ? {} : { week: String(week) });

  /** `who` saves the draw: `entries` as `[uid, blockId, value]`. */
  const saveDraw = (who, weekId, entries, { groupId = B, ...options } = {}) =>
    call(who, routes.draw.PUT, { groupId }, {
      course: true,
      body: { weekId, entries: entries.map(([uid, blockId, value]) => ({ uid, blockId, value })) },
      ...options,
    });

  return {
    ...made,
    ui,
    routes,
    pages,
    components,
    lib,
    at,
    reset,
    sessionFor,
    overview,
    pick,
    markReady,
    recordOf,
    records,
    seedDraw,
    asBrowser,
    weekShell,
    weekPage,
    programmeHome,
    homeCard,
    draw,
    groupPage,
    drawPage,
    saveDraw,
  };
}
